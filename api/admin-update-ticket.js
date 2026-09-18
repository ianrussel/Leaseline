// Vercel serverless function. POST { id, training_status, category?, urgency?, draft_response? },
// Authorization: Bearer <supabase access token> -> { ok: true }
//
// Lets an admin correct a candidate's fields before approving it (real tenant phrasing often
// needs a category/urgency/wording fix before it's good training data - see the whole point of
// human review discussed for gold.jsonl) and mark where it's headed: back to 'not_candidate' if
// it's not actually useful on a second look, 'added_to_train', or 'added_to_gold'. This only
// updates the database row - it does NOT touch dataset/real_examples.jsonl or eval.diverse.jsonl
// directly (a Vercel function has no access to that git checkout). Run
// scripts/export_training_candidates.py afterward to actually pull approved rows into the files.

import { supabaseAdmin, requireAdmin } from "./_lib/auth.js";

const VALID_STATUSES = ["not_candidate", "candidate", "added_to_train", "added_to_gold"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Requires app_metadata.role === "admin" - same reasoning as api/admin-tickets.js. Without
  // this, any signed-in user could rewrite training data labels, not just customers viewing it.
  const user = await requireAdmin(req, res);
  if (!user) return;

  const { id, training_status, category, urgency, draft_response } = req.body || {};
  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "Missing 'id' in request body" });
    return;
  }
  if (!VALID_STATUSES.includes(training_status)) {
    res.status(400).json({ error: `'training_status' must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  const update = { training_status, updated_at: new Date().toISOString() };
  if (typeof category === "string" && category.trim()) update.category = category.trim();
  if (typeof urgency === "string" && urgency.trim()) update.urgency = urgency.trim();
  if (typeof draft_response === "string" && draft_response.trim()) update.draft_response = draft_response.trim();

  const { error } = await supabaseAdmin.from("tickets").update(update).eq("id", id);

  if (error) {
    console.error("Failed to update training candidate:", error.message);
    res.status(500).json({ error: "Couldn't save that change." });
    return;
  }

  res.status(200).json({ ok: true });
}
