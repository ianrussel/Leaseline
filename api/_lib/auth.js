// Shared helper for api/*.js - not itself a route (Vercel excludes underscore-prefixed
// paths under api/ from routing, same convention as Next.js's _app/_middleware).

import { createClient } from "@supabase/supabase-js";
import ws from "ws";

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
 * Verifies the caller's Supabase session token from the Authorization header. On failure, writes
 * the appropriate error response itself and returns null - callers should `return` immediately
 * when this returns null, having already sent the response.
 */
export async function requireUser(req, res) {
  if (!supabaseAdmin) {
    console.error("Misconfigured - SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set in Vercel env vars.");
    res.status(500).json({ error: "Not configured yet." });
    return null;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Not signed in." });
    return null;
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: "Session expired or invalid - please sign in again." });
    return null;
  }

  return user;
}

/**
 * Like requireUser, but additionally requires app_metadata.role === "admin" - use this for
 * admin.html's endpoints (api/admin-tickets.js, api/admin-update-ticket.js). Deliberately checks
 * `app_metadata`, not `user_metadata` - Supabase lets a user edit their own user_metadata from
 * the client, so it can't be trusted for authorization; app_metadata can only be set via the
 * Admin API (the dashboard has no editable field for it at all - see scripts/set-admin-role.js),
 * which is what makes it safe to gate on. Without
 * this, any logged-in account - including a future real customer, once signup exists - could
 * reach the training-review panel, since api/triage.js's dashboard login and admin.html's login
 * are otherwise the exact same check.
 */
export async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null; // requireUser already sent the response

  if (user.app_metadata?.role !== "admin") {
    res.status(403).json({ error: "Not authorized." });
    return null;
  }

  return user;
}

/**
 * Like requireUser, but additionally requires the caller to be a registered customer - a row in
 * `customers` with owner_user_id = their id (see supabase/schema.sql, admin.html's "Customers"
 * panel, api/admin-customers.js). Being a valid Supabase user is necessary but not sufficient to
 * use the triage dashboard: an admin can add someone as a Supabase user (Authentication -> Users
 * -> Add user) without yet linking them to a customer, and without this check that account could
 * still triage messages and create tickets with no customer/local-part context behind them at
 * all - an orphaned account in practice, since there'd be no inbound address routing to them and
 * no way for an admin to find them in the Customers panel. Use for every dashboard.html-facing
 * endpoint (api/triage.js, api/tickets.js, api/ticket-action.js, api/send-reply.js,
 * api/tenant-messages.js) - deliberately NOT for admin.html's own endpoints, which use
 * requireAdmin instead and have nothing to do with being a customer.
 */
export async function requireCustomer(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null; // requireUser already sent the response

  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("requireCustomer: failed to check customer status:", error.message);
    res.status(500).json({ error: "Something went wrong on our end." });
    return null;
  }
  if (!data) {
    res.status(403).json({ error: "Your account isn't set up as a customer yet - contact your admin to get set up." });
    return null;
  }

  return user;
}
