// Vercel serverless function. GET, Authorization: Bearer <supabase access token> -> array of the
// CALLER'S OWN recent tickets (see supabase/schema.sql), newest first. Backs the dashboard's
// history view. Scoped to created_by = the authenticated user - without this, once there's more
// than one dashboard.html user, everyone would see every other user's tenant messages. This is
// deliberately different from api/admin-tickets.js, which shows candidates across ALL users -
// that's the point of the admin review panel, not a bug.

import { supabaseAdmin, requireUser } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await requireUser(req, res);
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

  res.status(200).json(data);
}
