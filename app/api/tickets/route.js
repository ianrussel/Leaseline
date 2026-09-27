// Route Handler, Authorization: Bearer <supabase access token>.
//
// GET   -> { tickets: [...], usage } - tickets are the CALLER'S OWN recent tickets (see
//          supabase/schema.sql), newest first. Backs the dashboard's history view AND (via
//          `usage`) its "triages used this period" widget/subscription controls - piggybacking
//          this endpoint for usage info, rather than a dedicated one, both saves a function slot
//          (Vercel Hobby's 12-function cap - see app/api/admin-customers/route.js's top comment) and is also
//          what app/dashboard's checkIsCustomer() reads the 403 off of. Scoped to
//          created_by = the authenticated user - without this, once there's more than one
//          app/dashboard user, everyone would see every other user's tenant messages. This is
//          deliberately different from app/api/admin-tickets/route.js, which shows candidates across ALL
//          users - that's the point of the admin review panel, not a bug.
//
//          `usage` is null for an admin account (requireCustomer lets admins through without a
//          `customers` row to compute it from - see lib/server/auth.js) - app/dashboard just hides
//          the usage widget when it's null, same as it would for any customer whose usage lookup
//          happened to fail.
//
// PATCH {action: 'cancel' | 'renew'} -> self-service subscription control, scoped to the CALLER'S
//          OWN customer row (looked up by owner_user_id, never a client-supplied id - a customer
//          can only ever act on their own subscription). Deliberately uses requireUser, NOT
//          requireCustomer - requireCustomer rejects a customer whose access has already ended,
//          which is exactly the account that needs to reach 'renew' to fix that. Same
//          computeCancelUpdate/computeReactivateUpdate as app/api/admin-customers/route.js's admin-facing
//          PATCH (lib/server/billing.js), so the two paths can't quietly diverge on what cancelling
//          or renewing actually does - "renew" here is "reactivate" there, same operation, just
//          customer-facing wording (see the auto-renew note below for why).
//
// Note on "renew": billing-reminders.js already auto-renews an active subscription every month
// (rolls current_period_start forward, same as Stripe's own default auto-renewal) - a customer
// never needs to manually renew an active subscription. This PATCH's 'renew' only ever applies to
// a CANCELED one (undoing that decision, or resuming after access lapsed) - there's nothing to
// renew otherwise, which is also why app/dashboard only shows the button when canceled_at is set.

import { supabaseAdmin, requireCustomer, requireUser } from "@/lib/server/auth.js";
import { readJson } from "@/lib/server/http.js";
import {
  effectivePrice,
  periodEnd,
  countUsage,
  MONTHLY_TRIAGE_LIMIT,
  isActive,
  computeCancelUpdate,
  computeReactivateUpdate,
} from "@/lib/server/billing.js";

export async function GET(request) {
  const user = await requireCustomer(request);
  if (user instanceof Response) return user;

  const { data, error } = await supabaseAdmin
    .from("tickets")
    .select("id, ticket_number, created_at, raw_message, category, urgency, draft_response, final_response, safety_override, tenant_contact, status")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Failed to list tickets:", error.message);
    return Response.json({ error: "Couldn't load ticket history." }, { status: 500 });
  }

  let usage = null;
  try {
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("is_beta, beta_locked_until, current_period_start, canceled_at, access_ends_at")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (customerError) throw new Error(customerError.message);
    if (customer) {
      usage = {
        used: await countUsage(supabaseAdmin, customer),
        limit: MONTHLY_TRIAGE_LIMIT,
        price: effectivePrice(customer),
        period_end: periodEnd(customer),
        canceled_at: customer.canceled_at,
        access_ends_at: customer.access_ends_at,
        is_active: isActive(customer),
      };
    }
  } catch (err) {
    // Non-fatal - the ticket history itself loaded fine, no reason to fail the whole request
    // over a widget. app/dashboard just won't show the usage card this load.
    console.error("Failed to compute usage:", err.message);
  }

  return Response.json({ tickets: data, usage });
}

export async function PATCH(request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  if (user.app_metadata?.role === "admin") {
    return Response.json({ error: "Admin accounts don't have a subscription to manage here." }, { status: 400 });
  }

  const { action } = await readJson(request);
  if (action !== "cancel" && action !== "renew") {
    return Response.json({ error: "'action' must be 'cancel' or 'renew'." }, { status: 400 });
  }

  const { data: customer, error: fetchError } = await supabaseAdmin
    .from("customers")
    .select("id, current_period_start, access_ends_at")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (fetchError) {
    console.error("tickets: failed to look up customer for PATCH:", fetchError.message);
    return Response.json({ error: "Something went wrong on our end." }, { status: 500 });
  }
  if (!customer) {
    return Response.json({ error: "No subscription found for this account." }, { status: 404 });
  }

  let update;
  if (action === "cancel") {
    update = computeCancelUpdate(customer);
    if (!update) {
      return Response.json({ error: "Already canceled." }, { status: 400 });
    }
  } else {
    update = computeReactivateUpdate(customer);
  }

  const { error: updateError } = await supabaseAdmin.from("customers").update(update).eq("id", customer.id);
  if (updateError) {
    console.error(`tickets: ${action} failed:`, updateError.message);
    return Response.json({ error: `Couldn't ${action} your subscription.` }, { status: 500 });
  }

  return Response.json({ ok: true });
}
