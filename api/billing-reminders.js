// Vercel Cron target (see vercel.json's "crons" entry) - not meant to be called by the dashboard
// or any user-facing code. Runs once daily (Hobby plan caps cron at once/day). Two jobs in one
// pass, both keyed off each customer's own current_period_start (see api/_lib/billing.js):
//
//   1. Roll current_period_start forward a month for any customer whose period has ended - this
//      is what resets their usage counter (usage is always computed live from `tickets`, see
//      countUsage(), so "resetting" it just means moving the window forward).
//   2. Email a friendly "your plan period ends soon" reminder to any customer within
//      REMINDER_DAYS_BEFORE of their period end who hasn't already gotten one this period
//      (last_reminder_sent_at gets cleared whenever a period rolls over, so this naturally sends
//      at most once per period per customer).
//
// Deliberately informational, not a real billing notice - there's no payment processor
// integrated yet (Stripe/LemonSqueezy deferred, see progress.md's Phase 3 notes), so the copy
// below says exactly that and tells the customer to disregard it if they've already sorted
// renewal out with us directly, rather than implying an automatic charge that isn't actually
// happening.
//
// Uses RESEND_API_KEY (sending-only), same as api/send-reply.js/analyze-tickets.js's admin email -
// NOT RESEND_RECEIVING_API_KEY, which is for reading received mail, unrelated here. Same Resend
// sandbox restriction already flagged elsewhere in this project applies: onboarding@resend.dev
// can only send to the Resend account's own verified email until a real sending domain is
// verified, so reminders to a customer's own address will fail until that's set up - failures are
// logged and skipped per-customer, not fatal to the run, same reasoning as analyze-tickets.js's
// notification email.

import { Resend } from "resend";
import { supabaseAdmin } from "./_lib/auth.js";
import { periodEnd, daysUntilPeriodEnd } from "./_lib/billing.js";

// A canceled customer (access_ends_at set - see schema.sql's comment) needs neither job here:
// their access ends on its own once access_ends_at passes (enforced by requireCustomer() and
// api/inbound-email.js reading it directly), so there's nothing to renew, and a "your plan renews
// soon" reminder would be actively wrong messaging for someone who already asked to stop.
function isCanceled(customer) {
  return !!customer.access_ends_at;
}

const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const REMINDER_DAYS_BEFORE = 3;

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    res.status(401).json({ error: "Not authorized" });
    return;
  }

  if (!supabaseAdmin) {
    res.status(500).json({ error: "Not configured (Supabase env vars missing)" });
    return;
  }

  const { data: customers, error } = await supabaseAdmin
    .from("customers")
    .select("id, name, owner_user_id, current_period_start, last_reminder_sent_at, access_ends_at");

  if (error) {
    console.error("billing-reminders: failed to list customers:", error.message);
    res.status(500).json({ error: "Failed to fetch customers" });
    return;
  }

  let emailById = {};
  if (resend && customers.length) {
    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    if (usersError) {
      console.error("billing-reminders: failed to list users:", usersError.message);
    } else {
      emailById = Object.fromEntries(usersData.users.map((u) => [u.id, u.email]));
    }
  }

  let rolledOver = 0;
  let remindersSent = 0;

  for (const customer of customers) {
    if (isCanceled(customer)) continue;

    const daysLeft = daysUntilPeriodEnd(customer);

    if (daysLeft <= 0) {
      const nextStart = periodEnd(customer); // one month after the (now-ended) current period
      const { error: rollError } = await supabaseAdmin
        .from("customers")
        .update({ current_period_start: nextStart.toISOString(), last_reminder_sent_at: null })
        .eq("id", customer.id);
      if (rollError) {
        console.error(`billing-reminders: failed to roll over period for customer ${customer.id}:`, rollError.message);
        continue;
      }
      rolledOver++;
      continue; // fresh period just started - nothing to remind about this run
    }

    if (daysLeft > REMINDER_DAYS_BEFORE || customer.last_reminder_sent_at) continue;

    const ownerEmail = emailById[customer.owner_user_id];
    if (!resend || !ownerEmail) {
      if (!resend) console.warn(`billing-reminders: RESEND_API_KEY not set - skipping reminder for customer ${customer.id}.`);
      continue;
    }

    try {
      await resend.emails.send({
        from: "Leaseline <onboarding@resend.dev>", // swap for a verified sending domain once you have one
        to: ownerEmail,
        subject: "Leaseline: your plan period ends soon",
        text:
          `Hi,\n\nJust a friendly heads-up - your Leaseline plan period for ${customer.name} ends ` +
          `on ${periodEnd(customer).toLocaleDateString()}.\n\n` +
          `If you've already arranged renewal with us, there's nothing to do - please disregard ` +
          `this message. Otherwise, reply to this email or reach out and we'll sort it out ` +
          `together.\n\nThanks,\nLeaseline`,
      });
      const { error: markError } = await supabaseAdmin
        .from("customers")
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .eq("id", customer.id);
      if (markError) console.error(`billing-reminders: sent but failed to mark reminder for customer ${customer.id}:`, markError.message);
      remindersSent++;
    } catch (err) {
      console.error(`billing-reminders: failed to send reminder for customer ${customer.id}:`, err.message);
    }
  }

  res.status(200).json({ customers: customers.length, rolled_over: rolledOver, reminders_sent: remindersSent });
}
