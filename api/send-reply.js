// Vercel serverless function. POST { id, to, subject, body }, Authorization: Bearer <supabase
// access token> -> { ok: true }
//
// Replaces the old mailto: link, which only recorded status='sent' the moment the button was
// clicked - regardless of whether a mail client even opened, let alone whether the tenant ever
// actually received anything. This sends for real via Resend (server-side, same as the training-
// candidate notification email in api/analyze-tickets.js) and only marks the ticket 'sent' after
// a confirmed successful send.
//
// Scoped to created_by = the caller, same as api/ticket-action.js - a user can only send replies
// for their own tickets.

import { Resend } from "resend";
import { supabaseAdmin, requireUser } from "./_lib/auth.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  if (!resend) {
    console.error("send-reply: RESEND_API_KEY not set in Vercel env vars.");
    res.status(500).json({ error: "Email sending isn't configured yet." });
    return;
  }

  const { id, to, subject, body } = req.body || {};
  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "Missing 'id' in request body" });
    return;
  }
  if (!to || typeof to !== "string" || !to.includes("@")) {
    res.status(400).json({ error: "A valid tenant email is required to send." });
    return;
  }
  if (typeof body !== "string" || !body.trim()) {
    res.status(400).json({ error: "Missing 'body' in request body" });
    return;
  }

  // Verify ownership BEFORE sending anything - checking after the send would mean a wrong/foreign
  // ticket id still triggers a real email before we ever find out it wasn't the caller's ticket.
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("tickets")
    .select("id")
    .eq("id", id)
    .eq("created_by", user.id)
    .maybeSingle();

  if (lookupError) {
    console.error("send-reply: failed to look up ticket:", lookupError.message);
    res.status(500).json({ error: "Something went wrong on our end." });
    return;
  }
  if (!existing) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }

  try {
    const { error: sendError } = await resend.emails.send({
      from: "Leaseline <onboarding@resend.dev>", // swap for a verified sending domain once you have one
      to,
      subject: subject && typeof subject === "string" ? subject : "Re: your maintenance request",
      text: body,
    });

    if (sendError) {
      console.error("send-reply: Resend send failed:", sendError.message || sendError);
      res.status(502).json({ error: "Couldn't send the email - try again shortly." });
      return;
    }
  } catch (err) {
    console.error("send-reply: unexpected error calling Resend:", err.message);
    res.status(502).json({ error: "Couldn't send the email - try again shortly." });
    return;
  }

  // Ownership already confirmed above - only reached after a confirmed successful send, so
  // unlike the old mailto: flow, this status actually means what it says.
  const { error: updateError } = await supabaseAdmin
    .from("tickets")
    .update({
      final_response: body.trim(),
      status: "sent",
      tenant_contact: to,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    // The email genuinely went out - don't report failure to the caller over a logging problem.
    console.error("send-reply: email sent but failed to update ticket:", updateError.message);
  }

  res.status(200).json({ ok: true });
}
