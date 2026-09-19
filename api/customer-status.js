// Vercel serverless function. GET, Authorization: Bearer <supabase access token> ->
// { is_customer: boolean }
//
// Lets dashboard.html show a clean "not set up yet" screen for a signed-in-but-not-a-customer
// account (same idea as admin.html's client-side role check for its "not authorized" screen),
// instead of the user only finding out via a raw 403 the first time they try to triage something.
// This is purely informational - the real enforcement is requireCustomer() (api/_lib/auth.js),
// which every dashboard-facing endpoint (api/triage.js, api/tickets.js, api/ticket-action.js,
// api/send-reply.js, api/tenant-messages.js) already calls independently of this endpoint.

import { supabaseAdmin, requireUser } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("customer-status: failed to check:", error.message);
    res.status(500).json({ error: "Something went wrong on our end." });
    return;
  }

  res.status(200).json({ is_customer: !!data });
}
