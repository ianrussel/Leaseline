// Vercel serverless function, Authorization: Bearer <supabase access token>.
//
// GET   -> { tickets: [...], usage } - tickets are the CALLER'S OWN recent tickets (see
//          supabase/schema.sql), newest first. Backs the dashboard's history view AND (via
//          `usage`) its "triages used this period" widget/subscription controls - piggybacking
//          this endpoint for usage info, rather than a dedicated one, both saves a function slot
//          (Vercel Hobby's 12-function cap - see api/admin-customers.js's top comment) and is also
//          what dashboard.html's checkIsCustomer() reads the 403 off of. Scoped to
//          created_by = the authenticated user - without this, once there's more than one
//          dashboard.html user, everyone would see every other user's tenant messages. This is
//          deliberately different from api/admin-tickets.js, which shows candidates across ALL
//          users - that's the point of the admin review panel, not a bug.
//
//          `usage` is null for an admin account (requireCustomer lets admins through without a
//          `customers` row to compute it from - see api/_lib/auth.js) - dashboard.html just hides
//          the usage widget when it's null, same as it would for any customer whose usage lookup
//          happened to fail.
//
// PATCH {action: 'cancel' | 'renew'} -> self-service subscription control, scoped to the CALLER'S
//          OWN customer row (looked up by owner_user_id, never a client-supplied id - a customer
//          can only ever act on their own subscription). Deliberately uses requireUser, NOT
//          requireCustomer - requireCustomer rejects a customer whose access has already ended,
//          which is exactly the account that needs to reach 'renew' to fix that. Same
//          computeCancelUpdate/computeReactivateUpdate as api/admin-customers.js's admin-facing
//          PATCH (api/_lib/billing.js), so the two paths can't quietly diverge on what cancelling
//          or renewing actually does - "renew" here is "reactivate" there, same operation, just
//          customer-facing wording (see the auto-renew note below for why).
//
// Note on "renew": billing-reminders.js already auto-renews an active subscription every month
// (rolls current_period_start forward, same as Stripe's own default auto-renewal) - a customer
// never needs to manually renew an active subscription. This PATCH's 'renew' only ever applies to
// a CANCELED one (undoing that decision, or resuming after access lapsed) - there's nothing to
// renew otherwise, which is also why dashboard.html only shows the button when canceled_at is set.

import { supabaseAdmin, requireCustomer, requireUser } from "./_lib/auth.js";
import {
  effectivePrice,
  periodEnd,
  countUsage,
  MONTHLY_TRIAGE_LIMIT,
  isActive,
  computeCancelUpdate,
  computeReactivateUpdate,
} from "./_lib/billing.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const user = await requireCustomer(req, res);
    if (!user) return;

    const { data, error } = await supabaseAdmin
      .from("tickets")
      .select("id, ticket_number, created_at, raw_message, category, urgency, draft_response, final_response, safety_override, tenant_contact, status")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Failed to list tickets:", error.message);
      res.status(500).json({ error: "Couldn't load ticket history." });
      return;
    }

    let usage = null;
    try {
      const { data: customer, error: customerError } = await supabaseAdmin
        .from("customers")
        .select("is_beta, beta_locked_until, current_period_start, canceled_at, access_ends_at")
        .eq("owner_user_id", user.id)
        .maybeSingle();
      if (customerError) throw new Error(customerError.message);
      if (customer) {
        usage = {
          used: await countUsage(supabaseAdmin, customer),
          limit: MONTHLY_TRIAGE_LIMIT,
          price: effectivePrice(customer),
          period_end: periodEnd(customer),
          canceled_at: customer.canceled_at,
          access_ends_at: customer.access_ends_at,
          is_active: isActive(customer),
        };
      }
    } catch (err) {
      // Non-fatal - the ticket history itself loaded fine, no reason to fail the whole request
      // over a widget. dashboard.html just won't show the usage card this load.
      console.error("Failed to compute usage:", err.message);
    }

    res.status(200).json({ tickets: data, usage });
    return;
  }

  if (req.method === "PATCH") {
    const user = await requireUser(req, res);
    if (!user) return;

    if (user.app_metadata?.role === "admin") {
      res.status(400).json({ error: "Admin accounts don't have a subscription to manage here." });
      return;
    }

    const { action } = req.body || {};
    if (action !== "cancel" && action !== "renew") {
      res.status(400).json({ error: "'action' must be 'cancel' or 'renew'." });
      return;
    }

    const { data: customer, error: fetchError } = await supabaseAdmin
      .from("customers")
      .select("id, current_period_start, access_ends_at")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (fetchError) {
      console.error("tickets: failed to look up customer for PATCH:", fetchError.message);
      res.status(500).json({ error: "Something went wrong on our end." });
      return;
    }
    if (!customer) {
      res.status(404).json({ error: "No subscription found for this account." });
      return;
    }

    let update;
    if (action === "cancel") {
      update = computeCancelUpdate(customer);
      if (!update) {
        res.status(400).json({ error: "Already canceled." });
        return;
      }
    } else {
      update = computeReactivateUpdate(customer);
    }

    const { error: updateError } = await supabaseAdmin.from("customers").update(update).eq("id", customer.id);
    if (updateError) {
      console.error(`tickets: ${action} failed:`, updateError.message);
      res.status(500).json({ error: `Couldn't ${action} your subscription.` });
      return;
    }

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
