// Vercel serverless function (zero-config: any file under /api becomes an endpoint).
// POST { message: string, tenant_contact?: string }, Authorization: Bearer <supabase access token>
// -> { id, ticket_number, category, urgency, draft_response, safety_override }
//
// The dashboard-facing entry point into the triage engine (api/_lib/triage-engine.js) - the other
// entry point is api/inbound-email.js (a Resend webhook, which only saves a pending
// `tenant_messages` row, never calls this directly). Every triage is persisted as a row in the
// `tickets` table (see supabase/schema.sql) - the dashboard's history view and the edit-then-
// send/copy actions (api/ticket-action.js) both depend on this.
//
// Auth: requireCustomer() (api/_lib/auth.js) verifies the caller's Supabase session token AND
// that they're a registered customer (a `customers` row, added via admin.html) - a signed-in
// Supabase user who hasn't been linked to a customer yet is rejected here, not just shown a
// friendlier screen client-side. dashboard.html showing a login screen isn't real protection on
// its own, since anyone who finds this URL directly could otherwise call it (and rack up
// Inference Endpoint usage) with no login at all. There's no signup flow - every account is added
// manually via the Supabase dashboard (Authentication -> Users -> Add user), then linked to a
// customer via admin.html; build a real signup flow only once actual beta users need it.

import { supabaseAdmin, requireCustomer } from "./_lib/auth.js";
import { runTriage } from "./_lib/triage-engine.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await requireCustomer(req, res);
  if (!user) return;

  const { message, tenant_contact, tenant_message_id } = req.body || {};
  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "Missing 'message' in request body" });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: "Message too long (max 2000 characters)" });
    return;
  }
  const tenantContact = typeof tenant_contact === "string" && tenant_contact.trim() ? tenant_contact.trim() : null;

  const result = await runTriage({ message, tenantContact, userId: user.id });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  // Optional: this triage originated from dashboard.html's inbox (a tenant_messages row created
  // by api/inbound-email.js), not a manually pasted message. Link it to the new ticket so
  // api/tenant-messages.js's query stops listing it - scoped to the caller's own row, same
  // ownership pattern as every other table here, so a foreign id can't be used to tamper with
  // someone else's inbox. Best-effort: a failure here shouldn't undo an otherwise-successful
  // triage, so it's only logged, not surfaced as an error to the caller.
  if (result.ticket.id && typeof tenant_message_id === "string" && tenant_message_id) {
    const { error: linkError } = await supabaseAdmin
      .from("tenant_messages")
      .update({ ticket_id: result.ticket.id })
      .eq("id", tenant_message_id)
      .eq("created_by", user.id);
    if (linkError) {
      console.error("triage: failed to link tenant_message to ticket:", linkError.message);
    }
  }

  res.status(200).json(result.ticket);
}
