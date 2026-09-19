// Vercel serverless function - webhook target for Resend's inbound email receiving (see
// https://resend.com/docs/dashboard/receiving/introduction). This is the "future inbox
// connection" tier mentioned in docs/knowledge-base.md's own roadmap ("by paste, forward, or
// future inbox connection") - a tenant's email lands here automatically, with zero manual
// copy-pasting into dashboard.html required.
//
// Deliberately does NOT auto-triage or auto-create a ticket - it only inserts a `pending` row
// into `tenant_messages` (see supabase/schema.sql). Receiving an email isn't the same as deciding
// it needs a reply, and AI triage costs a real inference call, so neither should happen just
// because an email arrived. dashboard.html's inbox shows these rows; a ticket only gets created
// once the property manager reviews one and clicks "Triage" themselves (api/triage.js).
//
// Setup (see README.md's "Inbound email" section for the full walkthrough):
//   1. Resend dashboard -> Emails -> Receiving -> note your <id>.resend.app address (free, no
//      DNS/domain setup needed to start) or configure a custom domain's MX record.
//   2. Resend dashboard -> Webhooks -> add this endpoint's deployed URL, subscribe to
//      "email.received", copy the signing secret into RESEND_WEBHOOK_SECRET.
//   3. Add each customer via admin.html's "Customers" panel (name + a unique local-part, e.g.
//      "sunsetapartments" for sunsetapartments@<id>.resend.app) - see findCustomerByAddress below
//      for why the local-part, not the domain, is what does the routing.
//
// Body parsing disabled on purpose (see config export below) - signature verification needs the
// EXACT raw bytes Resend sent; re-serializing an already-parsed JS object would not reliably
// reproduce them, and svix's HMAC check would fail.

import { Webhook } from "svix";
import { supabaseAdmin } from "./_lib/auth.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

// Deliberately a SEPARATE key from RESEND_API_KEY (used elsewhere for sending only) - Resend API
// keys are either "Full access" (can read received emails) or "Sending access" (send-only, can't
// read anything). Using one Full-access key everywhere would hand the sending code paths
// (analyze-tickets.js, send-reply.js) more privilege than they need. This one specifically must
// be Full access, or the GET /emails/receiving/{id} call below 401s with "This API key is
// restricted to only send emails" - the exact failure mode that motivated this split.
const RESEND_RECEIVING_API_KEY = process.env.RESEND_RECEIVING_API_KEY;
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

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

// Routes by the LOCAL-PART of whichever address the email was sent to (e.g. "sunsetapartments" out
// of "sunsetapartments@uuziluuamb.resend.app"), not the full address - multiple customers share
// the same receiving domain (Resend's free <id>.resend.app address accepts any local-part sent to
// it, same would be true of a future verified custom domain), so the local-part is what's actually
// unique per customer. No caching across invocations - a newly-added customer (admin.html) should
// take effect on the very next email, not after some TTL expires.
async function findCustomerByAddress(toAddress) {
  const localPart = (toAddress || "").split("@")[0].trim().toLowerCase();
  if (!localPart) return null;

  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id, owner_user_id")
    .eq("local_part", localPart)
    .maybeSingle();

  if (error) {
    console.error("inbound-email: failed to look up customer:", error.message);
    return null;
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!RESEND_RECEIVING_API_KEY || !RESEND_WEBHOOK_SECRET || !supabaseAdmin) {
    console.error("inbound-email: not fully configured (RESEND_RECEIVING_API_KEY / RESEND_WEBHOOK_SECRET / Supabase env vars).");
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

  const { email_id, from, subject, to, received_for } = event.data;
  // received_for is Resend's own record of which address actually matched delivery - preferred
  // over `to` (a header the sender wrote, in principle less trustworthy) when both are present;
  // seen identical in practice, but this is the more correct field to route on.
  const toAddress = (received_for && received_for[0]) || (to && to[0]);

  // The webhook payload is metadata only (from/to/subject) - the actual body needs a separate
  // API call. See https://resend.com/docs/api-reference/emails/retrieve-received-email
  let emailContent;
  try {
    const resp = await fetch(`https://api.resend.com/emails/receiving/${email_id}`, {
      headers: { Authorization: `Bearer ${RESEND_RECEIVING_API_KEY}` },
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

  const customer = await findCustomerByAddress(toAddress);
  if (!customer) {
    // Not an error - most likely an email sent to an address no customer has been assigned yet
    // (e.g. a typo, or the admin hasn't added this customer in admin.html yet). 200 so Resend
    // doesn't retry a delivery that will never resolve to anyone.
    console.warn(`inbound-email: no customer configured for "${toAddress}" (email ${email_id} from ${from}) - dropping.`);
    res.status(200).json({ ok: false, skipped: "unknown-recipient" });
    return;
  }

  // Truncate rather than reject outright - unlike a form submission, there's no one for the
  // sender to retry with a shorter message; a truncated inbox item is still useful, a dropped one
  // silently isn't.
  const body = text.length > 2000 ? text.slice(0, 2000) : text;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("tenant_messages")
    .insert({
      from_email: from,
      subject: subject || null,
      body,
      created_by: customer.owner_user_id,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error(`inbound-email: failed to save inbox row for email ${email_id}:`, insertError.message);
    res.status(200).json({ ok: false, error: insertError.message }); // still 200 - Resend would otherwise retry indefinitely
    return;
  }

  console.log(`inbound-email: saved pending tenant message ${inserted.id} from ${from}`);
  res.status(200).json({ ok: true, tenant_message_id: inserted.id });
}
