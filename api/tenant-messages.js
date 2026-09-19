// Vercel serverless function. GET, Authorization: Bearer <supabase access token> -> array of the
// CALLER'S OWN pending inbound tenant emails (see supabase/schema.sql's `tenant_messages` table),
// newest first. Backs dashboard.html's inbox list.
//
// Filters on ticket_id is null, not just status = 'pending' - a row stops appearing here the
// moment it's used to trigger a triage (api/triage.js), even though `status` itself doesn't flip
// to 'resolved' until the resulting ticket is actually sent. Without the ticket_id check, a
// message the manager already triaged (but hasn't sent yet) would still show up in the inbox,
// inviting it to be triaged a second time.
//
// Ordered oldest-first (ascending) on purpose - a tenant can send multiple issues before earlier
// ones are resolved, and dashboard.html auto-loads whichever row is first in this list into the
// tenant message window, so oldest-first means the manager works the queue FIFO instead of
// automatically jumping to whatever just arrived.

import { supabaseAdmin, requireCustomer } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await requireCustomer(req, res);
  if (!user) return;

  const { data, error } = await supabaseAdmin
    .from("tenant_messages")
    .select("id, from_email, subject, body, created_at")
    .eq("created_by", user.id)
    .eq("status", "pending")
    .is("ticket_id", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("tenant-messages: failed to list:", error.message);
    res.status(500).json({ error: "Couldn't load tenant messages." });
    return;
  }

  res.status(200).json(data);
}
