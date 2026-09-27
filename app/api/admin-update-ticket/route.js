// Route Handler. POST { id, training_status, category?, urgency?, draft_response? },
// Authorization: Bearer <supabase access token> -> { ok: true }
//
// Lets an admin correct a candidate's fields before approving it (real tenant phrasing often
// needs a category/urgency/wording fix before it's good training data - see the whole point of
// human review discussed for gold.jsonl) and mark where it's headed: back to 'not_candidate' if
// it's not actually useful on a second look, 'added_to_train', or 'added_to_gold'. This only
// updates the database row - it does NOT touch dataset/real_examples.jsonl or eval.diverse.jsonl
// directly (a Vercel function has no access to that git checkout). Run
// scripts/export_training_candidates.py afterward to actually pull approved rows into the files.

import { supabaseAdmin, requireAdmin } from "@/lib/server/auth.js";
import { readJson } from "@/lib/server/http.js";

const VALID_STATUSES = ["not_candidate", "candidate", "added_to_train", "added_to_gold"];

export async function POST(request) {
  // Requires app_metadata.role === "admin" - same reasoning as app/api/admin-tickets/route.js. Without
  // this, any signed-in user could rewrite training data labels, not just customers viewing it.
  const user = await requireAdmin(request);
  if (user instanceof Response) return user;

  const { id, training_status, category, urgency, draft_response } = await readJson(request);
  if (!id || typeof id !== "string") {
    return Response.json({ error: "Missing 'id' in request body" }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(training_status)) {
    return Response.json({ error: `'training_status' must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const update = { training_status, updated_at: new Date().toISOString() };
  if (typeof category === "string" && category.trim()) update.category = category.trim();
  if (typeof urgency === "string" && urgency.trim()) update.urgency = urgency.trim();
  if (typeof draft_response === "string" && draft_response.trim()) update.draft_response = draft_response.trim();

  const { error } = await supabaseAdmin.from("tickets").update(update).eq("id", id);

  if (error) {
    console.error("Failed to update training candidate:", error.message);
    return Response.json({ error: "Couldn't save that change." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
