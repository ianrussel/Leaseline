// Unit tests for billing.js's pure billing-decision functions - these decide who gets charged
// what and who keeps/loses access, so a regression here is a billing or access-control bug, not
// just a cosmetic one. Run with `npm test` (node --test).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectivePrice,
  periodEnd,
  daysUntilPeriodEnd,
  isActive,
  computeCancelUpdate,
  computeReactivateUpdate,
  countUsage,
  STANDARD_MONTHLY_PRICE_USD,
  BETA_MONTHLY_PRICE_USD,
} from "./billing.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

test("effectivePrice: beta customer still within beta_locked_until gets the beta rate", () => {
  const customer = {
    is_beta: true,
    beta_locked_until: new Date(Date.now() + 30 * DAY_MS).toISOString(),
  };
  assert.equal(effectivePrice(customer), BETA_MONTHLY_PRICE_USD);
});

test("effectivePrice: beta customer past beta_locked_until reverts to standard rate", () => {
  const customer = {
    is_beta: true,
    beta_locked_until: new Date(Date.now() - DAY_MS).toISOString(),
  };
  assert.equal(effectivePrice(customer), STANDARD_MONTHLY_PRICE_USD);
});

test("effectivePrice: never-beta customer gets the standard rate regardless of beta_locked_until", () => {
  const customer = { is_beta: false, beta_locked_until: new Date(Date.now() + 30 * DAY_MS).toISOString() };
  assert.equal(effectivePrice(customer), STANDARD_MONTHLY_PRICE_USD);
});

test("effectivePrice: beta customer with no beta_locked_until set gets the standard rate", () => {
  // Shouldn't happen in practice (admin-customers.js always sets it alongside is_beta), but a
  // customer row missing it must not silently fall through to the beta price.
  const customer = { is_beta: true, beta_locked_until: null };
  assert.equal(effectivePrice(customer), STANDARD_MONTHLY_PRICE_USD);
});

test("periodEnd: is exactly one calendar month after current_period_start", () => {
  const customer = { current_period_start: "2026-01-15T00:00:00.000Z" };
  assert.equal(periodEnd(customer).toISOString(), "2026-02-15T00:00:00.000Z");
});

test("daysUntilPeriodEnd: counts up for a period ending in the future", () => {
  const customer = { current_period_start: new Date().toISOString() };
  const days = daysUntilPeriodEnd(customer);
  // A fresh period just started, so its end (~1 month out) should be well over a week away.
  assert.ok(days > 20 && days <= 31, `expected ~a month out, got ${days}`);
});

test("isActive: true when access_ends_at is unset (never canceled)", () => {
  assert.equal(isActive({ access_ends_at: null }), true);
});

test("isActive: true when access_ends_at is set but still in the future", () => {
  assert.equal(isActive({ access_ends_at: new Date(Date.now() + DAY_MS).toISOString() }), true);
});

test("isActive: false once access_ends_at has passed", () => {
  assert.equal(isActive({ access_ends_at: new Date(Date.now() - DAY_MS).toISOString() }), false);
});

test("computeCancelUpdate: sets access_ends_at to this period's end, not immediately", () => {
  const customer = { access_ends_at: null, current_period_start: new Date().toISOString() };
  const update = computeCancelUpdate(customer);
  assert.ok(update.canceled_at);
  assert.equal(update.access_ends_at, periodEnd(customer).toISOString());
});

test("computeCancelUpdate: returns null (no-op) for an already-canceled customer", () => {
  const customer = { access_ends_at: new Date(Date.now() + DAY_MS).toISOString() };
  assert.equal(computeCancelUpdate(customer), null);
});

test("computeReactivateUpdate: undoing a still-pending cancellation keeps current_period_start untouched", () => {
  const originalStart = new Date(Date.now() - 10 * DAY_MS).toISOString();
  const customer = { access_ends_at: new Date(Date.now() + 20 * DAY_MS).toISOString(), current_period_start: originalStart };
  const update = computeReactivateUpdate(customer);
  assert.equal(update.canceled_at, null);
  assert.equal(update.access_ends_at, null);
  assert.equal("current_period_start" in update, false);
});

test("computeReactivateUpdate: reactivating after access already lapsed starts a fresh period from now", () => {
  const customer = { access_ends_at: new Date(Date.now() - DAY_MS).toISOString(), current_period_start: new Date(Date.now() - 40 * DAY_MS).toISOString() };
  const before = Date.now();
  const update = computeReactivateUpdate(customer);
  const after = Date.now();
  assert.ok("current_period_start" in update);
  const newStart = new Date(update.current_period_start).getTime();
  assert.ok(newStart >= before && newStart <= after);
});

test("countUsage: returns the row count from the query builder", async () => {
  const fakeSupabase = fakeCountQuery({ count: 42, error: null });
  const count = await countUsage(fakeSupabase, { owner_user_id: "u1", current_period_start: "2026-01-01" });
  assert.equal(count, 42);
});

test("countUsage: returns 0 when count is null instead of throwing", async () => {
  const fakeSupabase = fakeCountQuery({ count: null, error: null });
  const count = await countUsage(fakeSupabase, { owner_user_id: "u1", current_period_start: "2026-01-01" });
  assert.equal(count, 0);
});

test("countUsage: throws on a query error rather than silently returning 0", async () => {
  const fakeSupabase = fakeCountQuery({ count: null, error: { message: "boom" } });
  await assert.rejects(
    () => countUsage(fakeSupabase, { owner_user_id: "u1", current_period_start: "2026-01-01" }),
    /boom/
  );
});

// Minimal stand-in for the chunk of the supabase-js query builder countUsage() calls
// (.from().select().eq().gte()) - just enough chaining to resolve with a given {count, error}.
function fakeCountQuery(result) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => Promise.resolve(result),
        }),
      }),
    }),
  };
}
