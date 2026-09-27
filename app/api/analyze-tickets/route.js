// Vercel Cron target (see vercel.json's "crons" entry) - not meant to be called by the dashboard
// or any user-facing code. Runs once daily (Vercel's Hobby plan caps cron at once-per-day; an
// hourly schedule fails at *deploy time* on that tier - bump vercel.json's schedule to something
// like "0 * * * *" for hourly only once/if you're on Pro): finds tickets nobody's judged yet,
// asks Claude whether each is redundant with the kind of examples already well-covered or a
// genuinely useful/novel real-tenant-data candidate worth a human look, and emails the admin (via
// Resend) if any new candidates showed up this run - so nobody has to manually scan the tickets
// table.
//
// This is a background job, not a page load, so it does NOT need to be fast - it's fine for this
// to take a while processing a batch. It DOES need protecting from random callers, since it
// spends real Claude API + email quota - Vercel signs its own cron requests with CRON_SECRET
// (set that env var, Vercel sends it as `Authorization: Bearer <CRON_SECRET>` automatically) and
// this handler rejects anything else.

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/server/auth.js";

const CRON_SECRET = process.env.CRON_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY, same as app/api/chat/route.js
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const JUDGE_PROMPT = `You help decide whether a real tenant maintenance message is worth adding \
to a fine-tuning training set for a maintenance-triage AI. The training set already has strong \
coverage of common, straightforward cases (leaky faucets, running toilets, minor pest sightings, \
routine noise complaints, etc.) - those are NOT worth adding, no matter how well-written.

A message IS worth flagging as a candidate if it has any of: unusual or ambiguous phrasing that's \
hard to categorize, a genuinely novel category/urgency combination, multiple issues bundled \
together in an unusual way, or real tenant voice/slang/typos that synthetic data doesn't capture \
well.

Reply with ONLY a single JSON object, no prose: {"candidate": true or false, "reason": "one short \
sentence"}.`;

async function judgeTicket(ticket) {
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 150,
    output_config: { effort: "low" }, // a quick classification call, not open-ended generation
    system: [{ type: "text", text: JUDGE_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: `Message: "${ticket.raw_message}"\nCategory: ${ticket.category}\nUrgency: ${ticket.urgency}`,
    }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  const match = textBlock?.text.match(/\{[\s\S]*\}/);
  if (!match) return { candidate: false, reason: "unparseable judge response" };
  try {
    return JSON.parse(match[0]);
  } catch {
    return { candidate: false, reason: "unparseable judge response" };
  }
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Not authorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return Response.json({ error: "Not configured (Supabase env vars missing)" }, { status: 500 });
  }

  const { data: tickets, error } = await supabaseAdmin
    .from("tickets")
    .select("id, ticket_number, raw_message, category, urgency")
    .eq("training_status", "unanalyzed")
    .limit(25); // one cron tick processes at most 25 - keeps each run fast and cheap; the rest wait for the next hourly tick

  if (error) {
    console.error("analyze-tickets: failed to fetch unanalyzed tickets:", error.message);
    return Response.json({ error: "Failed to fetch tickets" }, { status: 500 });
  }

  const newCandidates = [];
  for (const ticket of tickets) {
    let verdict;
    try {
      verdict = await judgeTicket(ticket);
    } catch (err) {
      console.error(`analyze-tickets: judge call failed for ticket ${ticket.id}:`, err.message);
      continue; // leave it 'unanalyzed' - picked up again next run rather than guessed at
    }

    const training_status = verdict.candidate ? "candidate" : "not_candidate";
    const { error: updateError } = await supabaseAdmin
      .from("tickets")
      .update({ training_status })
      .eq("id", ticket.id);

    if (updateError) {
      console.error(`analyze-tickets: failed to update ticket ${ticket.id}:`, updateError.message);
      continue;
    }
    if (verdict.candidate) newCandidates.push({ ...ticket, reason: verdict.reason });
  }

  if (newCandidates.length && resend && ADMIN_EMAIL) {
    try {
      await resend.emails.send({
        from: "Leaseline <onboarding@resend.dev>", // swap for a verified sending domain once you have one
        to: ADMIN_EMAIL,
        subject: `Leaseline: ${newCandidates.length} new training candidate${newCandidates.length > 1 ? "s" : ""}`,
        text: newCandidates
          .map((t) => `Ticket #${t.ticket_number} (${t.category}/${t.urgency}): ${t.reason}\n"${t.raw_message}"`)
          .join("\n\n"),
      });
    } catch (err) {
      // Don't fail the whole run over a notification email - the candidates are already saved
      // and will show up in app/admin regardless of whether this email went out.
      console.error("analyze-tickets: failed to send admin notification email:", err.message);
    }
  } else if (newCandidates.length && !resend) {
    console.warn(`analyze-tickets: ${newCandidates.length} new candidate(s), but RESEND_API_KEY isn't set - no email sent.`);
  }

  return Response.json({ analyzed: tickets.length, new_candidates: newCandidates.length });
}
