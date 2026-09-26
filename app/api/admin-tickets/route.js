// Route Handler. GET, Authorization: Bearer <supabase access token> -> array of
// tickets flagged as training candidates (plus already-processed ones, for context/audit).
// Backs app/admin. Requires app_metadata.role === "admin" (see requireAdmin in
// lib/server/auth.js) - a regular logged-in user (e.g. a future customer, once signup exists) must
// NOT be able to reach this, so it's a stricter check than the plain "is anyone signed in" used
// by app/api/triage/route.js.

import { supabaseAdmin, requireAdmin } from "@/lib/server/auth.js";

export async function GET(request) {
  const user = await requireAdmin(request);
  if (user instanceof Response) return user;

  const { data, error } = await supabaseAdmin
    .from("tickets")
    .select("id, ticket_number, created_at, raw_message, category, urgency, draft_response, training_status")
    .in("training_status", ["candidate", "added_to_train", "added_to_gold"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to list training candidates:", error.message);
    return Response.json({ error: "Couldn't load training candidates." }, { status: 500 });
  }

  return Response.json(data);
}
