// Vercel serverless function - webhook target for Resend's inbound email receiving (see
// https://resend.com/docs/dashboard/receiving/introduction). This is the "future inbox
// connection" tier mentioned in docs/knowledge-base.md's own roadmap ("by paste, forward, or
// future inbox connection") - a tenant's email lands here automatically, gets triaged, and
// becomes a ticket with zero manual copy-pasting, instead of needing dashboard.html at all.
//
// Setup (see README.md's "Inbound email" section for the full walkthrough):
//   1. Resend dashboard -> Emails -> Receiving -> note your <id>.resend.app address (free, no
//      DNS/domain setup needed to start) or configure a custom domain's MX record.
//   2. Resend dashboard -> Webhooks -> add this endpoint's deployed URL, subscribe to
//      "email.received", copy the signing secret into RESEND_WEBHOOK_SECRET.
//   3. Set INBOUND_EMAIL_OWNER to the email of the Supabase user tickets should be created under.
//      There's no per-tenant/per-customer routing yet - everything received goes to this one
//      account, which is correct for the current single-tenant stage. Real multi-customer routing
//      (matching the `to` address to a specific customer) is Phase 3/4 work once there's a real
//      account system.
//
// Body parsing disabled on purpose (see config export below) - signature verification needs the
// EXACT raw bytes Resend sent; re-serializing an already-parsed JS object would not reliably
// reproduce them, and svix's HMAC check would fail.

import { Webhook } from "svix";
import { supabaseAdmin } from "./_lib/auth.js";
import { runTriage } from "./_lib/triage-engine.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;
const INBOUND_EMAIL_OWNER = process.env.INBOUND_EMAIL_OWNER;

function readRawBody(req) {
  // Accumulating Buffer chunks and concatenating once at the end (rather than `body += chunk`)
  // avoids mangling multi-byte UTF-8 characters that land split across two chunks - signature
  // verification needs the exact original bytes, so this matters more here than it would for a
  // human-readable log line.
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// listUsers() paginates (50/page) - fine at this project's current scale (a handful of users).
// No caching across invocations - correctness (picking up a changed owner immediately) matters
// more than saving one cheap lookup call per inbound email, which is a low-volume event anyway.
async function findOwnerUserId() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    console.error("inbound-email: failed to list users:", error.message);
    return null;
  }
  const user = data.users.find((u) => u.email === INBOUND_EMAIL_OWNER);
  return user ? user.id : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!RESEND_API_KEY || !RESEND_WEBHOOK_SECRET || !INBOUND_EMAIL_OWNER || !supabaseAdmin) {
    console.error("inbound-email: not fully configured (RESEND_API_KEY / RESEND_WEBHOOK_SECRET / INBOUND_EMAIL_OWNER / Supabase env vars).");
    res.status(500).json({ error: "Not configured yet." });
    return;
  }

  const rawBody = await readRawBody(req);

  let event;
  try {
    const wh = new Webhook(RESEND_WEBHOOK_SECRET);
    event = wh.verify(rawBody, {
      "svix-id": req.headers["svix-id"],
      "svix-timestamp": req.headers["svix-timestamp"],
      "svix-signature": req.headers["svix-signature"],
    });
  } catch (err) {
    console.error("inbound-email: webhook signature verification failed:", err.message);
    res.status(400).json({ error: "Invalid signature." });
    return;
  }

  // Acknowledge everything else (delivery receipts, bounces, etc.) without processing it -
  // Resend sends multiple event types to the same webhook if subscribed to more than one.
  if (event.type !== "email.received") {
    res.status(200).json({ ok: true, skipped: event.type });
    return;
  }

  const { email_id, from, subject } = event.data;

  // The webhook payload is metadata only (from/to/subject) - the actual body needs a separate
  // API call. See https://resend.com/docs/api-reference/emails/retrieve-received-email
  let emailContent;
  try {
    const resp = await fetch(`https://api.resend.com/emails/receiving/${email_id}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    if (!resp.ok) {
      console.error("inbound-email: failed to fetch received email content:", resp.status, await resp.text());
      res.status(502).json({ error: "Couldn't fetch email content." });
      return;
    }
    emailContent = await resp.json();
  } catch (err) {
    console.error("inbound-email: unexpected error fetching email content:", err.message);
    res.status(502).json({ error: "Couldn't fetch email content." });
    return;
  }

  const text = (emailContent.text || "").trim();
  if (!text) {
    console.warn(`inbound-email: email ${email_id} from ${from} had no plain-text body (html-only?) - skipping.`);
    res.status(200).json({ ok: true, skipped: "no-text-body" });
    return;
  }

  const ownerUserId = await findOwnerUserId();
  if (!ownerUserId) {
    console.error(`inbound-email: INBOUND_EMAIL_OWNER (${INBOUND_EMAIL_OWNER}) doesn't match any Supabase user.`);
    res.status(500).json({ error: "Inbound email owner not configured correctly." });
    return;
  }

  // Truncate rather than reject outright - unlike a form submission, there's no one for the
  // sender to retry with a shorter message; a truncated ticket is still useful, a dropped one
  // silently isn't.
  const message = text.length > 2000 ? text.slice(0, 2000) : text;

  const result = await runTriage({ message, tenantContact: from, userId: ownerUserId });
  if (!result.ok) {
    console.error(`inbound-email: triage failed for email ${email_id} (subject: "${subject}"):`, result.error);
    res.status(200).json({ ok: false, error: result.error }); // still 200 - Resend would otherwise retry indefinitely
    return;
  }

  console.log(`inbound-email: created ticket #${result.ticket.ticket_number} from ${from}`);
  res.status(200).json({ ok: true, ticket_number: result.ticket.ticket_number });
}
