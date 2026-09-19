// Vercel serverless function, admin-only (see api/_lib/auth.js's requireAdmin). Manages the
// `customers` table - the local-part -> owner mapping that makes multi-customer inbound email
// routing work (see api/inbound-email.js's findCustomerByAddress). Backs admin.html's
// "Customers" panel - same gating as api/admin-tickets.js, no public signup involved.
//
// GET             -> { customers, receiving_domain, eligible_owners }, newest customer first -
//                    each customer includes usage/plan info (see api/_lib/billing.js) for
//                    admin.html's all-customers status view: is_beta, effective_price,
//                    triages_used, triage_limit, period_end, is_active, canceled_at,
//                    access_ends_at. receiving_domain (RESEND_RECEIVING_DOMAIN) is a display-only
//                    convenience so admin.html can show each customer's actual full inbound
//                    address (local_part@receiving_domain) instead of a bare local-part the admin
//                    has to mentally combine with a domain they remember separately.
//                    eligible_owners backs the "Owner" dropdown on the add-customer form -
//                    Supabase users who could validly be assigned as a NEW customer's owner (used
//                    to be its own endpoint, api/admin-users.js, folded in here to stay under
//                    Vercel Hobby's 12-Serverless-Functions-per-deployment cap - this project hit
//                    exactly 13 and started silently failing to deploy its two newest functions).
// POST   {name, local_part, owner_email, is_beta?} -> create one (owner_email must be an existing
//                    Supabase user - added manually via the Supabase dashboard, same as every
//                    other user in this project; there's no self-serve signup yet). is_beta is
//                    only honored up to MAX_BETA_USERS - see the beta-cap comment below.
// PATCH  {id, action: 'cancel' | 'reactivate'} -> cancel-at-period-end, no refund, no immediate
//                    cutoff (see schema.sql's canceled_at/access_ends_at comment) - 'cancel' sets
//                    access_ends_at to the END of the period already paid for, not now; the
//                    customer keeps full access (including remaining usage) until then.
//                    'reactivate' undoes it - if access had already lapsed, also starts a fresh
//                    period from right now, since the old one is long over.
// DELETE {id}     -> remove one PERMANENTLY (does NOT touch any tickets/tenant_messages already
//                    created under that owner, but the customer row itself is gone - reserved for
//                    mistakes/test cleanup, not real cancellations; use PATCH .../cancel for that,
//                    which keeps the record and only affects future access).

import { supabaseAdmin, requireAdmin } from "./_lib/auth.js";
import {
  MAX_BETA_USERS,
  BETA_DURATION_MONTHS,
  effectivePrice,
  periodEnd,
  countUsage,
  MONTHLY_TRIAGE_LIMIT,
  isActive,
  computeCancelUpdate,
  computeReactivateUpdate,
} from "./_lib/billing.js";

const RESEND_RECEIVING_DOMAIN = process.env.RESEND_RECEIVING_DOMAIN || null;

// listUsers() paginates (50/page) - fine at this project's scale (a handful of customers for a
// while yet). Used both to resolve an owner_email into a user id on create, and to display owner
// emails on list - auth.users isn't reachable via a plain PostgREST select, only the Admin API.
async function listAllUsers() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw new Error(error.message);
  return data.users;
}

export default async function handler(req, res) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("id, name, local_part, owner_user_id, created_at, is_beta, beta_locked_until, current_period_start, canceled_at, access_ends_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("admin-customers: failed to list:", error.message);
      res.status(500).json({ error: "Couldn't load customers." });
      return;
    }

    let users;
    try {
      users = await listAllUsers();
    } catch (err) {
      console.error("admin-customers: failed to list users:", err.message);
      res.status(500).json({ error: "Couldn't load customers." });
      return;
    }
    const emailById = Object.fromEntries(users.map((u) => [u.id, u.email]));

    // Excludes admins and anyone who already owns a customer - see the removed
    // api/admin-users.js's original comment for why: neither is a valid choice for a NEW
    // customer's owner. Derived from `data` (already fetched above) rather than a second query.
    const alreadyOwns = new Set(data.map((c) => c.owner_user_id));
    const eligibleOwners = users
      .filter((u) => u.app_metadata?.role !== "admin")
      .filter((u) => !alreadyOwns.has(u.id))
      .map((u) => ({ id: u.id, email: u.email }))
      .sort((a, b) => a.email.localeCompare(b.email));

    // One usage query per customer - fine at this project's scale (a handful of customers for a
    // while yet); a single grouped query isn't viable here since each customer has its own
    // current_period_start to count from.
    let customersWithUsage;
    try {
      customersWithUsage = await Promise.all(
        data.map(async (c) => ({
          ...c,
          owner_email: emailById[c.owner_user_id] || null,
          effective_price: effectivePrice(c),
          triage_limit: MONTHLY_TRIAGE_LIMIT,
          triages_used: await countUsage(supabaseAdmin, c),
          period_end: periodEnd(c),
          is_active: isActive(c),
        }))
      );
    } catch (err) {
      console.error("admin-customers: failed to compute usage:", err.message);
      res.status(500).json({ error: "Couldn't load customers." });
      return;
    }

    res.status(200).json({
      customers: customersWithUsage,
      receiving_domain: RESEND_RECEIVING_DOMAIN,
      eligible_owners: eligibleOwners,
    });
    return;
  }

  if (req.method === "POST") {
    const { name, local_part, owner_email, is_beta } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Missing 'name'." });
      return;
    }
    if (!owner_email || typeof owner_email !== "string" || !owner_email.trim()) {
      res.status(400).json({ error: "Missing 'owner_email'." });
      return;
    }

    let users;
    try {
      users = await listAllUsers();
    } catch (err) {
      console.error("admin-customers: failed to list users:", err.message);
      res.status(500).json({ error: "Something went wrong on our end." });
      return;
    }
    const owner = users.find((u) => u.email === owner_email.trim());
    if (!owner) {
      res.status(400).json({
        error: `No Supabase user with email ${owner_email} - add them first (Supabase dashboard: Authentication -> Users -> Add user).`,
      });
      return;
    }

    // The account email (Supabase login, invites, business correspondence with us) and the
    // tenant-facing support address are different concerns - a customer shouldn't be forced to
    // invent a second address just to receive tenant email. Explicit local_part wins when given
    // (lets a customer use something memorable like "sunsetapartments" or "support"); left blank,
    // default to the local-part of their OWN account email, stripped of characters our routing
    // doesn't accept - not the literal same address (Resend can only receive mail for domains it's
    // configured to receive for, not an arbitrary company's real domain), but the same "no extra
    // setup needed" effect the account email already provides.
    let localPart = typeof local_part === "string" ? local_part.trim().toLowerCase() : "";
    if (!localPart) {
      localPart = owner.email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "");
      if (!localPart) {
        res.status(400).json({ error: "Couldn't derive a support address from that account email - provide a local-part manually." });
        return;
      }
    } else if (/[^a-z0-9._-]/.test(localPart)) {
      res.status(400).json({ error: "Local-part must be letters/numbers/._- only (the part before @)." });
      return;
    }

    // Beta status is capped at MAX_BETA_USERS, enforced here rather than trusting the client -
    // requested but silently downgraded to a normal (standard-price) customer once the cap is
    // hit, not rejected outright, per the explicit spec: adding customers shouldn't ever fail
    // just because beta slots ran out, it should just stop granting the beta rate.
    let grantBeta = false;
    let betaLockedUntil = null;
    if (is_beta) {
      const { count: betaCount, error: betaCountError } = await supabaseAdmin
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("is_beta", true);
      if (betaCountError) {
        console.error("admin-customers: failed to count beta customers:", betaCountError.message);
        res.status(500).json({ error: "Something went wrong on our end." });
        return;
      }
      if (betaCount < MAX_BETA_USERS) {
        grantBeta = true;
        // Computed once, here, from BETA_DURATION_MONTHS as it's set RIGHT NOW - never
        // recalculated later (see that const's own comment in billing.js). Anchored to this
        // customer's own registration moment, not a global date, so each customer's lock is
        // independent of when anyone else was granted beta.
        const lockedUntil = new Date();
        lockedUntil.setMonth(lockedUntil.getMonth() + BETA_DURATION_MONTHS);
        betaLockedUntil = lockedUntil.toISOString();
      }
    }

    const { data: created, error: insertError } = await supabaseAdmin
      .from("customers")
      .insert({
        name: name.trim(),
        local_part: localPart,
        owner_user_id: owner.id,
        is_beta: grantBeta,
        beta_locked_until: betaLockedUntil,
      })
      .select("id, name, local_part, owner_user_id, created_at, is_beta, beta_locked_until, current_period_start")
      .single();

    if (insertError) {
      // Postgres unique_violation - worth a specific message since it's the failure an admin is
      // actually likely to hit: either a typo'd duplicate local-part, or two customers whose
      // account emails happen to share the same local-part on different domains (e.g.
      // owner@companyA.com and owner@companyB.com both default to "owner") - either way the fix is
      // the same, provide an explicit local-part instead of relying on the default.
      const message =
        insertError.code === "23505"
          ? `"${localPart}" is already used by another customer - provide a different local-part for this one.`
          : "Couldn't save that customer.";
      console.error("admin-customers: insert failed:", insertError.message);
      res.status(400).json({ error: message });
      return;
    }

    res.status(200).json({ ...created, owner_email: owner.email });
    return;
  }

  if (req.method === "PATCH") {
    const { id, action } = req.body || {};
    if (!id || typeof id !== "string") {
      res.status(400).json({ error: "Missing 'id'." });
      return;
    }
    if (action !== "cancel" && action !== "reactivate") {
      res.status(400).json({ error: "'action' must be 'cancel' or 'reactivate'." });
      return;
    }

    const { data: customer, error: fetchError } = await supabaseAdmin
      .from("customers")
      .select("id, current_period_start, access_ends_at")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) {
      console.error("admin-customers: failed to look up customer for PATCH:", fetchError.message);
      res.status(500).json({ error: "Something went wrong on our end." });
      return;
    }
    if (!customer) {
      res.status(404).json({ error: "Customer not found." });
      return;
    }

    let update;
    if (action === "cancel") {
      update = computeCancelUpdate(customer);
      if (!update) {
        res.status(400).json({ error: "This customer is already canceled." });
        return;
      }
    } else {
      update = computeReactivateUpdate(customer);
    }

    const { error: updateError } = await supabaseAdmin.from("customers").update(update).eq("id", id);
    if (updateError) {
      console.error(`admin-customers: ${action} failed:`, updateError.message);
      res.status(500).json({ error: `Couldn't ${action} that customer.` });
      return;
    }

    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id || typeof id !== "string") {
      res.status(400).json({ error: "Missing 'id'." });
      return;
    }

    const { error } = await supabaseAdmin.from("customers").delete().eq("id", id);
    if (error) {
      console.error("admin-customers: delete failed:", error.message);
      res.status(500).json({ error: "Couldn't remove that customer." });
      return;
    }

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
