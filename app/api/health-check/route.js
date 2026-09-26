// Vercel Cron target (see vercel.json's "crons" entry) - not meant to be called by the dashboard
// or any user-facing code. Runs once daily (Hobby plan caps cron at once/day, same constraint
// noted in billing-reminders.js) - a proactive canary. Without this, a triage-engine.js failure
// (lib/server/triage-engine.js) is only noticed, and alerted on, when a real customer happens to
// trigger it; during a quiet stretch (overnight, a slow week) an outage could otherwise sit
// undetected for hours. Once/day is a coarse safety net, not real-time monitoring - upgrading past
// Vercel Hobby to run this every 15-30 minutes instead would be the natural next step.
//
// Deliberately reuses the exact same alertAdmin() keys ("hf-misconfigured"/"hf-endpoint-down"/
// "hf-endpoint-error") that runTriage()'s own failure paths use - this check and a real failed
// triage represent the same underlying incident, so they share one cooldown rather than sending
// two separate emails for the same outage.

import { alertAdmin } from "@/lib/server/alerts.js";

const CRON_SECRET = process.env.CRON_SECRET;
const HF_ENDPOINT_URL = process.env.HF_ENDPOINT_URL;
const HF_TOKEN = process.env.HF_TOKEN;

export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Not authorized" }, { status: 401 });
  }

  if (!HF_ENDPOINT_URL || !HF_TOKEN) {
    await alertAdmin("hf-misconfigured", "Triage misconfigured", "HF_ENDPOINT_URL/HF_TOKEN are not set - every triage request is failing.");
    return Response.json({ status: "misconfigured" });
  }

  // A tiny real request, not just a reachability ping - HF Inference Endpoints don't expose a
  // separate health route, and a bare GET/HEAD wouldn't exercise the same POST the model actually
  // serves. max_new_tokens: 1 keeps this cheap regardless of endpoint state.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // scale-to-zero cold starts can take a while
  try {
    const response = await fetch(HF_ENDPOINT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: "ping", parameters: { max_new_tokens: 1 } }),
      signal: controller.signal,
    });

    if (response.status === 503) {
      // Cold start, woken up by this very check - fine, not an incident (same reasoning as
      // triage-engine.js's own 503 handling).
      return Response.json({ status: "cold_start" });
    }
    if (!response.ok) {
      const body = await response.text();
      console.error("health-check: HF Inference Endpoint error:", response.status, body);
      await alertAdmin("hf-endpoint-error", "Triage endpoint returning errors", `Daily health check got ${response.status}: ${body}`);
      return Response.json({ status: "error", http_status: response.status });
    }

    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("health-check: unexpected error calling HF endpoint:", error.message);
    await alertAdmin("hf-endpoint-down", "Triage endpoint unreachable", `Daily health check fetch() failed: ${error.message}`);
    return Response.json({ status: "unreachable" });
  } finally {
    clearTimeout(timeout);
  }
}
