// Vercel serverless function, admin-only (see api/_lib/auth.js's requireAdmin). Manages the
// `customers` table - the local-part -> owner mapping that makes multi-customer inbound email
// routing work (see api/inbound-email.js's findCustomerByAddress). Backs admin.html's
// "Customers" panel - same gating as api/admin-tickets.js, no public signup involved.
//
// GET             -> list all customers, newest first
// POST   {name, local_part, owner_email} -> create one (owner_email must be an existing Supabase
//                    user - added manually via the Supabase dashboard, same as every other user
//                    in this project; there's no self-serve signup yet)
// DELETE {id}     -> remove one (does NOT touch any tickets/tenant_messages already created under
//                    that owner - only stops routing NEW inbound email to this local-part)

import { supabaseAdmin, requireAdmin } from "./_lib/auth.js";

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
      .select("id, name, local_part, owner_user_id, created_at")
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

    res.status(200).json(data.map((c) => ({ ...c, owner_email: emailById[c.owner_user_id] || null })));
    return;
  }

  if (req.method === "POST") {
    const { name, local_part, owner_email } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Missing 'name'." });
      return;
    }
    const localPart = typeof local_part === "string" ? local_part.trim().toLowerCase() : "";
    if (!localPart || /[^a-z0-9._-]/.test(localPart)) {
      res.status(400).json({ error: "Local-part must be letters/numbers/._- only (the part before @)." });
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

    const { data: created, error: insertError } = await supabaseAdmin
      .from("customers")
      .insert({ name: name.trim(), local_part: localPart, owner_user_id: owner.id })
      .select("id, name, local_part, owner_user_id, created_at")
      .single();

    if (insertError) {
      // Postgres unique_violation - the one validation failure worth a specific message, since
      // it's the one an admin is likely to actually hit (typo'd the same local-part twice).
      const message = insertError.code === "23505" ? `"${localPart}" is already used by another customer.` : "Couldn't save that customer.";
      console.error("admin-customers: insert failed:", insertError.message);
      res.status(400).json({ error: message });
      return;
    }

    res.status(200).json({ ...created, owner_email: owner.email });
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
