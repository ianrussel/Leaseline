// Vercel serverless function. POST { id: string, final_response: string, status: 'sent'|'copied' },
// Authorization: Bearer <supabase access token> -> { ok: true }
//
// Records what the property manager actually did with a triaged ticket - sent it (via the
// dashboard's mailto: link) or just copied it elsewhere - along with the final text after any
// edits. draft_response (the model's original) is never overwritten, so the two can be compared
// later (e.g. when deciding what's worth folding into leaseline/dataset/real_examples.jsonl).
//
// Scoped to created_by = the caller - without this, anyone who obtained another user's ticket id
// (e.g. by guessing a small integer... though these are UUIDs, so guessing isn't realistic, but
// it could still leak via a referrer header, a shared screenshot, etc.) could rewrite that
// ticket's final_response/status even without being able to browse it via api/tickets.js.

import { supabaseAdmin, requireUser } from "./_lib/auth.js";

const VALID_STATUSES = ["sent", "copied"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const { id, final_response, status } = req.body || {};
  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "Missing 'id' in request body" });
    return;
  }
  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `'status' must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }
  if (typeof final_response !== "string" || !final_response.trim()) {
    res.status(400).json({ error: "Missing 'final_response' in request body" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("tickets")
    .update({ final_response: final_response.trim(), status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("created_by", user.id)
    .select("id");

  if (error) {
    console.error("Failed to update ticket:", error.message);
    res.status(500).json({ error: "Couldn't save that action." });
    return;
  }

  // update() alone doesn't error when the WHERE clause matches zero rows - it just "succeeds"
  // having done nothing. Checking the returned rows is what actually distinguishes "updated" from
  // "no such ticket, or it's not yours" - without this, a wrong/foreign id would silently report
  // { ok: true } despite changing nothing.
  if (!data || data.length === 0) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }

  res.status(200).json({ ok: true });
}
