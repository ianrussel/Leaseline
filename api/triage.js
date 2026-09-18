// Vercel serverless function (zero-config: any file under /api becomes an endpoint).
// POST { message: string, tenant_contact?: string }, Authorization: Bearer <supabase access token>
// -> { id, ticket_number, category, urgency, draft_response, safety_override }
//
// The dashboard-facing entry point into the triage engine (api/_lib/triage-engine.js) - the other
// entry point is api/inbound-email.js (a Resend webhook, no user session involved at all). Every
// triage is persisted as a row in the `tickets` table (see supabase/schema.sql) - the dashboard's
// history view and the edit-then-send/copy actions (api/ticket-action.js) both depend on this.
//
// Auth: verifies the caller's Supabase session token server-side before doing anything else -
// dashboard.html showing a login screen isn't real protection on its own, since anyone who finds
// this URL directly could otherwise call it (and rack up Inference Endpoint usage) with no login
// at all. There's no signup flow - single admin user, added manually via the Supabase dashboard
// (Authentication -> Users -> Add user); build a real signup flow only once actual beta users
// need accounts, not before.

import { requireUser } from "./_lib/auth.js";
import { runTriage } from "./_lib/triage-engine.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const { message, tenant_contact } = req.body || {};
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

  res.status(200).json(result.ticket);
}
