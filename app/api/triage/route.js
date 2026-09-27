// Route Handler (any app/**/route.js file becomes an endpoint).
// POST { message: string, tenant_contact?: string }, Authorization: Bearer <supabase access token>
// -> { id, ticket_number, category, urgency, draft_response, safety_override }
//
// The dashboard-facing entry point into the triage engine (lib/server/triage-engine.js) - the other
// entry point is app/api/inbound-email/route.js (a Resend webhook, which only saves a pending
// `tenant_messages` row, never calls this directly). Every triage is persisted as a row in the
// `tickets` table (see supabase/schema.sql) - the dashboard's history view and the edit-then-
// send/copy actions (app/api/ticket-action/route.js) both depend on this.
//
// Auth: requireCustomer() (lib/server/auth.js) verifies the caller's Supabase session token AND
// that they're a registered customer (a `customers` row, added via app/admin) - a signed-in
// Supabase user who hasn't been linked to a customer yet is rejected here, not just shown a
// friendlier screen client-side. app/dashboard showing a login screen isn't real protection on
// its own, since anyone who finds this URL directly could otherwise call it (and rack up
// Inference Endpoint usage) with no login at all. There's no signup flow - every account is added
// manually via the Supabase dashboard (Authentication -> Users -> Add user), then linked to a
// customer via app/admin; build a real signup flow only once actual beta users need it.

import { supabaseAdmin, requireCustomer } from "@/lib/server/auth.js";
import { runTriage } from "@/lib/server/triage-engine.js";
import { countUsage, MONTHLY_TRIAGE_LIMIT } from "@/lib/server/billing.js";
import { readJson } from "@/lib/server/http.js";

// Off by default so flipping this on is a deliberate choice, not a silent behavior change for
// customers already using the product - turn on once you're ready to actually cap usage instead
// of just displaying it (see billing.js's own comment on why nothing enforces this yet).
const ENFORCE_USAGE_LIMITS = process.env.ENFORCE_USAGE_LIMITS === "true";

export async function POST(request) {
  const user = await requireCustomer(request);
  if (user instanceof Response) return user;

  const { message, tenant_contact, tenant_message_id } = await readJson(request);
  if (!message || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "Missing 'message' in request body" }, { status: 400 });
  }
  if (message.length > 2000) {
    return Response.json({ error: "Message too long (max 2000 characters)" }, { status: 400 });
  }
  const tenantContact = typeof tenant_contact === "string" && tenant_contact.trim() ? tenant_contact.trim() : null;

  // Admins bypass requireCustomer's customer lookup entirely (see auth.js), so there's no
  // customer row - and thus no usage limit - to enforce for them here.
  if (ENFORCE_USAGE_LIMITS && user.app_metadata?.role !== "admin") {
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("owner_user_id, current_period_start")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (customerError) {
      // Fail open - a broken usage-check query shouldn't block a paying customer from triaging.
      console.error("triage: failed to check usage limit:", customerError.message);
    } else if (customer) {
      const used = await countUsage(supabaseAdmin, customer);
      if (used >= MONTHLY_TRIAGE_LIMIT) {
        return Response.json({
          error: "You've reached this month's triage limit - it resets at the start of your next billing period.",
          code: "usage_limit_reached",
        }, { status: 403 });
      }
    }
  }

  const result = await runTriage({ message, tenantContact, userId: user.id });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  // Optional: this triage originated from app/dashboard's inbox (a tenant_messages row created
  // by app/api/inbound-email/route.js), not a manually pasted message. Link it to the new ticket so
  // app/api/tenant-messages/route.js's query stops listing it - scoped to the caller's own row, same
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

  return Response.json(result.ticket);
}
