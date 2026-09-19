// Vercel serverless function, admin-only (see api/_lib/auth.js's requireAdmin). Lists Supabase
// users eligible to be a NEW customer's owner (id, email) - backs the "Owner" dropdown in
// admin.html's Customers panel, so an admin picks from real, actually-assignable accounts instead
// of typing an email that might not exist, be typo'd, or already belong to someone else.
//
// Excludes two groups, both because they're not valid choices for a NEW customer, not because
// they're hidden for any other reason:
//   - Admins (app_metadata.role === "admin") - an admin manages the training-review panel and
//     customer list, not a single customer's own tickets; nothing stops an admin account
//     literally existing, but it shouldn't show up as something to assign a customer to.
//   - Users who already own a customer - this project's model is one owner per customer (see
//     supabase/schema.sql's `customers.owner_user_id` comment); a user already listed as an
//     owner elsewhere would silently merge that customer's tickets into an existing one if picked
//     again, which is never what "add a NEW customer" means.

import { supabaseAdmin, requireAdmin } from "./_lib/auth.js";

export default async function handler(req, res) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // listUsers() paginates (50/page) - fine at this project's scale (a handful of accounts for a
  // while yet), same caveat as everywhere else this call is used.
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    console.error("admin-users: failed to list users:", error.message);
    res.status(500).json({ error: "Couldn't load users." });
    return;
  }

  const { data: existingOwners, error: customersError } = await supabaseAdmin
    .from("customers")
    .select("owner_user_id");
  if (customersError) {
    console.error("admin-users: failed to list existing customer owners:", customersError.message);
    res.status(500).json({ error: "Couldn't load users." });
    return;
  }
  const alreadyOwns = new Set(existingOwners.map((c) => c.owner_user_id));

  const eligible = data.users
    .filter((u) => u.app_metadata?.role !== "admin")
    .filter((u) => !alreadyOwns.has(u.id))
    .map((u) => ({ id: u.id, email: u.email }))
    .sort((a, b) => a.email.localeCompare(b.email));

  res.status(200).json(eligible);
}
