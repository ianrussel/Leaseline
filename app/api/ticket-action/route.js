// Route Handler. POST { id: string, final_response: string, status: 'sent'|'copied' },
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
// ticket's final_response/status even without being able to browse it via app/api/tickets/route.js.

import { supabaseAdmin, requireCustomer } from "@/lib/server/auth.js";
import { readJson } from "@/lib/server/http.js";

const VALID_STATUSES = ["sent", "copied"];

export async function POST(request) {
  const user = await requireCustomer(request);
  if (user instanceof Response) return user;

  const { id, final_response, status } = await readJson(request);
  if (!id || typeof id !== "string") {
    return Response.json({ error: "Missing 'id' in request body" }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status)) {
    return Response.json({ error: `'status' must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }
  if (typeof final_response !== "string" || !final_response.trim()) {
    return Response.json({ error: "Missing 'final_response' in request body" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("tickets")
    .update({ final_response: final_response.trim(), status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("created_by", user.id)
    .select("id");

  if (error) {
    console.error("Failed to update ticket:", error.message);
    return Response.json({ error: "Couldn't save that action." }, { status: 500 });
  }

  // update() alone doesn't error when the WHERE clause matches zero rows - it just "succeeds"
  // having done nothing. Checking the returned rows is what actually distinguishes "updated" from
  // "no such ticket, or it's not yours" - without this, a wrong/foreign id would silently report
  // { ok: true } despite changing nothing.
  if (!data || data.length === 0) {
    return Response.json({ error: "Ticket not found." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
