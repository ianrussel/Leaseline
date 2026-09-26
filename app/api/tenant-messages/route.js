// Route Handler. GET, Authorization: Bearer <supabase access token> -> array of the
// CALLER'S OWN pending inbound tenant emails (see supabase/schema.sql's `tenant_messages` table),
// newest first. Backs app/dashboard's inbox list.
//
// Filters on ticket_id is null, not just status = 'pending' - a row stops appearing here the
// moment it's used to trigger a triage (app/api/triage/route.js), even though `status` itself doesn't flip
// to 'resolved' until the resulting ticket is actually sent. Without the ticket_id check, a
// message the manager already triaged (but hasn't sent yet) would still show up in the inbox,
// inviting it to be triaged a second time.
//
// Ordered oldest-first (ascending) on purpose - a tenant can send multiple issues before earlier
// ones are resolved, and app/dashboard auto-loads whichever row is first in this list into the
// tenant message window, so oldest-first means the manager works the queue FIFO instead of
// automatically jumping to whatever just arrived.

import { supabaseAdmin, requireCustomer } from "@/lib/server/auth.js";

export async function GET(request) {
  const user = await requireCustomer(request);
  if (user instanceof Response) return user;

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
    return Response.json({ error: "Couldn't load tenant messages." }, { status: 500 });
  }

  return Response.json(data);
}
