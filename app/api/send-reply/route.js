// Route Handler. POST { id, to, subject, body }, Authorization: Bearer <supabase
// access token> -> { ok: true }
//
// Replaces the old mailto: link, which only recorded status='sent' the moment the button was
// clicked - regardless of whether a mail client even opened, let alone whether the tenant ever
// actually received anything. This sends for real via Resend (server-side, same as the training-
// candidate notification email in app/api/analyze-tickets/route.js) and only marks the ticket 'sent' after
// a confirmed successful send.
//
// Scoped to created_by = the caller, same as app/api/ticket-action/route.js - a user can only send replies
// for their own tickets.

import { Resend } from "resend";
import { supabaseAdmin, requireCustomer } from "@/lib/server/auth.js";
import { readJson } from "@/lib/server/http.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export async function POST(request) {
  const user = await requireCustomer(request);
  if (user instanceof Response) return user;

  if (!resend) {
    console.error("send-reply: RESEND_API_KEY not set in Vercel env vars.");
    return Response.json({ error: "Email sending isn't configured yet." }, { status: 500 });
  }

  const { id, to, subject, body } = await readJson(request);
  if (!id || typeof id !== "string") {
    return Response.json({ error: "Missing 'id' in request body" }, { status: 400 });
  }
  if (!to || typeof to !== "string" || !to.includes("@")) {
    return Response.json({ error: "A valid tenant email is required to send." }, { status: 400 });
  }
  if (typeof body !== "string" || !body.trim()) {
    return Response.json({ error: "Missing 'body' in request body" }, { status: 400 });
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
    return Response.json({ error: "Something went wrong on our end." }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "Ticket not found." }, { status: 404 });
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
      return Response.json({ error: "Couldn't send the email - try again shortly." }, { status: 502 });
    }
  } catch (err) {
    console.error("send-reply: unexpected error calling Resend:", err.message);
    return Response.json({ error: "Couldn't send the email - try again shortly." }, { status: 502 });
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

  // If this ticket originated from app/dashboard's inbox (app/api/triage/route.js linked a tenant_messages
  // row to it), mark that row 'resolved' now - not at triage time, since a triaged-but-not-yet-
  // sent message shouldn't read as handled. Best-effort, same reasoning as updateError above: the
  // email already went out, so a failure here is logged, not surfaced to the caller.
  const { error: resolveError } = await supabaseAdmin
    .from("tenant_messages")
    .update({ status: "resolved" })
    .eq("ticket_id", id);
  if (resolveError) {
    console.error("send-reply: sent but failed to resolve linked tenant_message:", resolveError.message);
  }

  return Response.json({ ok: true });
}
