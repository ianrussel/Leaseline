// Shared helper for the app/api/*/route.js handlers - a lightweight stand-in for a real error-tracking service (Sentry
// etc.): emails ADMIN_EMAIL via Resend when something customer-impacting breaks, so an outage is
// noticed within minutes instead of whenever a customer happens to complain. Deliberately just an
// email, not a new monitoring platform - proportionate to a single-operator project; revisit only
// once that stops being enough.

import { Resend } from "resend";
import { supabaseAdmin } from "./auth.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// One email per `key` per cooldown window, no matter how many failures happen inside it - a
// sustained outage should page you once, not once per request. Backed by the `system_alerts`
// table (see supabase/schema.sql) rather than an in-memory timestamp, since separate serverless
// invocations don't share memory - an in-memory cooldown would reset on almost every call.
const COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Fire-and-forget: always await this (so the process doesn't exit before the email is sent on a
 * short-lived serverless invocation), but never branch on its result - callers should still log
 * and return their own error response regardless of whether the alert itself succeeded. `key`
 * scopes the cooldown (e.g. "hf-endpoint-down") - use the same key for every call site that
 * represents the same underlying incident, so a flaky endpoint doesn't fire once per call site.
 */
export async function alertAdmin(key, subject, body) {
  if (!resend || !ADMIN_EMAIL || !supabaseAdmin) {
    console.error(`alertAdmin: not configured (RESEND_API_KEY/ADMIN_EMAIL/Supabase) - would have sent "${subject}": ${body}`);
    return;
  }

  try {
    const { data: existing, error: readError } = await supabaseAdmin
      .from("system_alerts")
      .select("last_sent_at")
      .eq("key", key)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    if (existing && Date.now() - new Date(existing.last_sent_at).getTime() < COOLDOWN_MS) {
      return;
    }

    await resend.emails.send({
      from: "Leaseline Alerts <onboarding@resend.dev>", // swap for a verified sending domain once you have one
      to: ADMIN_EMAIL,
      subject: `[Leaseline] ${subject}`,
      text: body,
    });

    const { error: upsertError } = await supabaseAdmin
      .from("system_alerts")
      .upsert({ key, last_sent_at: new Date().toISOString() }, { onConflict: "key" });
    if (upsertError) {
      console.error(`alertAdmin: sent "${subject}" but failed to record cooldown for "${key}":`, upsertError.message);
    }
  } catch (err) {
    console.error(`alertAdmin: failed to send alert "${subject}":`, err.message);
  }
}
