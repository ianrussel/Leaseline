// Vercel serverless function. GET, Authorization: Bearer <supabase access token> -> array of
// tickets flagged as training candidates (plus already-processed ones, for context/audit).
// Backs admin.html. Requires app_metadata.role === "admin" (see requireAdmin in
// api/_lib/auth.js) - a regular logged-in user (e.g. a future customer, once signup exists) must
// NOT be able to reach this, so it's a stricter check than the plain "is anyone signed in" used
// by api/triage.js.

import { supabaseAdmin, requireAdmin } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await requireAdmin(req, res);
  if (!user) return;

  const { data, error } = await supabaseAdmin
    .from("tickets")
    .select("id, ticket_number, created_at, raw_message, category, urgency, draft_response, training_status")
    .in("training_status", ["candidate", "added_to_train", "added_to_gold"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to list training candidates:", error.message);
    res.status(500).json({ error: "Couldn't load training candidates." });
    return;
  }

  res.status(200).json(data);
}
