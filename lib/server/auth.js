// Shared helper for the app/api/*/route.js handlers - not itself a route (only files named
// route.js under app/ become endpoints, so anything under lib/ is never routable).

import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { isActive } from "./billing.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// createClient() initializes a Realtime client internally regardless of whether it's used - none
// of these routes use Realtime (only .auth.getUser()/.from()), but on Node < 22 (no native
// WebSocket) that internal init throws unless a WebSocket implementation is supplied explicitly.
export const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { realtime: { transport: ws } })
    : null;

/**
 * Verifies the caller's Supabase session token from the Authorization header. On failure, returns
 * the appropriate error Response instead of a user - callers should check
 * `if (user instanceof Response) return user;` and return it as-is.
 */
export async function requireUser(request) {
  if (!supabaseAdmin) {
    console.error("Misconfigured - SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set in Vercel env vars.");
    return Response.json({ error: "Not configured yet." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return Response.json({ error: "Session expired or invalid - please sign in again." }, { status: 401 });
  }

  return user;
}

/**
 * Like requireUser, but additionally requires app_metadata.role === "admin" - use this for
 * the /admin page's endpoints (/api/admin-tickets, /api/admin-update-ticket). Deliberately checks
 * `app_metadata`, not `user_metadata` - Supabase lets a user edit their own user_metadata from
 * the client, so it can't be trusted for authorization; app_metadata can only be set via the
 * Admin API (the dashboard has no editable field for it at all - see scripts/set-admin-role.js),
 * which is what makes it safe to gate on. Without
 * this, any logged-in account - including a future real customer, once signup exists - could
 * reach the training-review panel, since app/api/triage/route.js's dashboard login and app/admin's login
 * are otherwise the exact same check.
 */
export async function requireAdmin(request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  if (user.app_metadata?.role !== "admin") {
    return Response.json({ error: "Not authorized." }, { status: 403 });
  }

  return user;
}

/**
 * Like requireUser, but additionally requires the caller to be a registered customer - a row in
 * `customers` with owner_user_id = their id (see supabase/schema.sql, app/admin's "Customers"
 * panel, app/api/admin-customers/route.js). Being a valid Supabase user is necessary but not sufficient to
 * use the triage dashboard: an admin can add someone as a Supabase user (Authentication -> Users
 * -> Add user) without yet linking them to a customer, and without this check that account could
 * still triage messages and create tickets with no customer/local-part context behind them at
 * all - an orphaned account in practice, since there'd be no inbound address routing to them and
 * no way for an admin to find them in the Customers panel. Use for every app/dashboard-facing
 * endpoint (app/api/triage/route.js, app/api/tickets/route.js, app/api/ticket-action/route.js, app/api/send-reply/route.js,
 * app/api/tenant-messages/route.js) - deliberately NOT for app/admin's own endpoints, which use
 * requireAdmin instead and have nothing to do with being a customer.
 *
 * Admins bypass this check entirely - an admin is never expected to also be a customer (they're
 * excluded from app/admin's own "eligible owner" dropdown for exactly that reason, see
 * app/api/admin-customers/route.js), but they still need to be able to open app/dashboard - to test the
 * triage flow, or help a customer troubleshoot - without hitting a "you're not a customer" wall
 * that was never meant for them in the first place.
 *
 * Also rejects a customer whose access has ended (isActive() false - see lib/server/billing.js and
 * schema.sql's canceled_at/access_ends_at comment) with a distinct message from "never set up" -
 * this is the actual enforcement point for cancellation: a canceled customer keeps working
 * everywhere this gate is used right up until access_ends_at, then every dashboard-facing
 * endpoint starts rejecting them, same as an account that was never a customer at all.
 */
export async function requireCustomer(request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  if (user.app_metadata?.role === "admin") return user;

  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id, access_ends_at")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("requireCustomer: failed to check customer status:", error.message);
    return Response.json({ error: "Something went wrong on our end." }, { status: 500 });
  }
  if (!data) {
    return Response.json(
      {
        error: "Your account isn't set up as a customer yet - contact your admin to get set up.",
        code: "not_a_customer",
      },
      { status: 403 },
    );
  }
  if (!isActive(data)) {
    // code lets app/dashboard's notCustomerScreen tell this apart from "never set up" and offer
    // a self-service "Renew subscription" button instead of just "contact your admin" - see
    // app/api/tickets/route.js's PATCH handler, which is reachable precisely because IT doesn't use
    // requireCustomer (it would reject the very account trying to renew).
    return Response.json(
      { error: "Your subscription has ended - renew it to continue.", code: "subscription_ended" },
      { status: 403 },
    );
  }

  return user;
}
