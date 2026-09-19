// Vercel serverless function. GET, Authorization: Bearer <supabase access token> ->
// { tickets: [...], usage } - tickets are the CALLER'S OWN recent tickets (see
// supabase/schema.sql), newest first. Backs the dashboard's history view AND (via `usage`) its
// "triages used this period" widget - piggybacking this endpoint for usage info, rather than a
// dedicated one, both saves a function slot (Vercel Hobby's 12-function cap - see
// api/admin-customers.js's top comment) and is also what dashboard.html's checkIsCustomer() reads
// the 403 off of. Scoped to created_by = the authenticated user - without this, once there's more
// than one dashboard.html user, everyone would see every other user's tenant messages. This is
// deliberately different from api/admin-tickets.js, which shows candidates across ALL users -
// that's the point of the admin review panel, not a bug.
//
// `usage` is null for an admin account (requireCustomer lets admins through without a `customers`
// row to compute it from - see api/_lib/auth.js) - dashboard.html just hides the usage widget
// when it's null, same as it would for any customer whose usage lookup happened to fail.

import { supabaseAdmin, requireCustomer } from "./_lib/auth.js";
import { effectivePrice, periodEnd, countUsage, MONTHLY_TRIAGE_LIMIT } from "./_lib/billing.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await requireCustomer(req, res);
  if (!user) return;

  const { data, error } = await supabaseAdmin
    .from("tickets")
    .select("id, ticket_number, created_at, raw_message, category, urgency, draft_response, final_response, safety_override, tenant_contact, status")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Failed to list tickets:", error.message);
    res.status(500).json({ error: "Couldn't load ticket history." });
    return;
  }

  let usage = null;
  try {
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("is_beta, beta_locked_until, current_period_start")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (customerError) throw new Error(customerError.message);
    if (customer) {
      usage = {
        used: await countUsage(supabaseAdmin, customer),
        limit: MONTHLY_TRIAGE_LIMIT,
        price: effectivePrice(customer),
        period_end: periodEnd(customer),
      };
    }
  } catch (err) {
    // Non-fatal - the ticket history itself loaded fine, no reason to fail the whole request over
    // a widget. dashboard.html just won't show the usage card this load.
    console.error("Failed to compute usage:", err.message);
  }

  res.status(200).json({ tickets: data, usage });
}
