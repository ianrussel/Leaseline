// Shared helper for the app/api/*/route.js handlers - not itself a route. Usage/plan calculations shared by
// app/api/admin-customers/route.js (admin's all-customers status view), app/api/tickets/route.js (the customer-
// facing usage widget), and app/api/billing-reminders/route.js (the daily renewal-reminder cron).
//
// No real payment processor integrated yet (Stripe/LemonSqueezy deferred - see progress.md's
// Phase 3 notes). Everything here tracks and displays usage against a plan; none of it charges
// anyone or blocks triage on its own - see app/api/triage/route.js's own comment on why exceeding the
// limit is flagged, not enforced, until real billing exists.

export const STANDARD_MONTHLY_PRICE_USD = Number(process.env.STANDARD_MONTHLY_PRICE_USD || 29);
export const BETA_MONTHLY_PRICE_USD = Number(process.env.BETA_MONTHLY_PRICE_USD || 29);
export const MONTHLY_TRIAGE_LIMIT = Number(process.env.MONTHLY_TRIAGE_LIMIT || 100);
export const MAX_BETA_USERS = Number(process.env.MAX_BETA_USERS || 10);

// How long a NEWLY granted beta customer keeps the beta rate, from the moment they're registered
// (app/api/admin-customers/route.js computes beta_locked_until = now + this many months, once, at grant
// time). Deliberately only read there, not here in effectivePrice() below - changing this env var
// later must only affect customers granted beta AFTER the change, never retroactively shorten or
// extend a duration a customer already locked in. That's the whole reason beta_locked_until is an
// absolute timestamp stored per-customer instead of always being computed as "N months from
// current_period_start" on the fly: the app owner adjusting this value can't move the goalposts
// on someone who already has a specific date recorded in their own row.
export const BETA_DURATION_MONTHS = Number(process.env.BETA_DURATION_MONTHS || 12);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A beta customer keeps BETA_MONTHLY_PRICE_USD only until beta_locked_until passes, then reverts
 * to the standard rate - kept separate from the permanent `is_beta` flag so "still within the
 * locked period" can be told apart from "was beta, that period's over" (see schema.sql's comment
 * on the `customers` table) without ever clearing the historical record of having been a beta
 * customer. Reads the stored beta_locked_until, never recomputes it from BETA_DURATION_MONTHS -
 * see that const's own comment for why.
 */
export function effectivePrice(customer) {
  const stillLocked = customer.is_beta && customer.beta_locked_until && new Date(customer.beta_locked_until) > new Date();
  return stillLocked ? BETA_MONTHLY_PRICE_USD : STANDARD_MONTHLY_PRICE_USD;
}

/** One calendar month after current_period_start - when usage resets and price re-evaluates. */
export function periodEnd(customer) {
  const end = new Date(customer.current_period_start);
  end.setMonth(end.getMonth() + 1);
  return end;
}

export function daysUntilPeriodEnd(customer) {
  return Math.ceil((periodEnd(customer).getTime() - Date.now()) / ONE_DAY_MS);
}

/**
 * Cancellation policy: cancel-at-period-end, no refund, no immediate cutoff - see schema.sql's
 * comment on `canceled_at`/`access_ends_at`. A customer is active as long as access_ends_at is
 * unset, or hasn't passed yet - so a just-canceled customer stays fully active/isActive() === true
 * through the rest of the period they already paid for, and only flips false once that period
 * (recorded once, at cancel time, not recomputed) actually ends.
 */
export function isActive(customer) {
  return !customer.access_ends_at || new Date(customer.access_ends_at) > new Date();
}

/**
 * Shared by app/api/admin-customers/route.js's admin-facing PATCH and app/api/tickets/route.js's customer-facing
 * self-service PATCH, so the two paths can never quietly diverge on what "cancel" actually does.
 * Returns null if already canceled - the caller should treat that as a no-op/error, not apply it.
 */
export function computeCancelUpdate(customer) {
  if (customer.access_ends_at) return null;
  return { canceled_at: new Date().toISOString(), access_ends_at: periodEnd(customer).toISOString() };
}

/**
 * Reactivating ("renew" in customer-facing copy) after access had already lapsed starts a fresh
 * period from right now - the old one is long over, nothing left to resume. Reactivating BEFORE
 * access_ends_at (undoing a still-pending cancellation) leaves current_period_start untouched -
 * they're still mid-period, no reason to disrupt it. Same function backs both admin's
 * "Reactivate" and the customer's own "Renew subscription".
 */
export function computeReactivateUpdate(customer) {
  const hadLapsed = customer.access_ends_at && new Date(customer.access_ends_at) <= new Date();
  const update = { canceled_at: null, access_ends_at: null };
  if (hadLapsed) update.current_period_start = new Date().toISOString();
  return update;
}

/**
 * Counts triage tickets this customer's owner has created since current_period_start - usage is
 * always computed live from `tickets`, never a separately incremented counter, so it's correct
 * even if recomputed retroactively (e.g. after current_period_start rolls forward).
 */
export async function countUsage(supabaseAdmin, customer) {
  const { count, error } = await supabaseAdmin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("created_by", customer.owner_user_id)
    .gte("created_at", customer.current_period_start);

  if (error) throw new Error(error.message);
  return count || 0;
}
