-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Creates the tickets table backing api/triage.js's persistence and the dashboard's history view.

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint generated always as identity,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  raw_message text not null,
  category text not null,
  urgency text not null,
  draft_response text not null,      -- the model's original draft, never overwritten
  final_response text,               -- what was actually sent/copied, after any edits - null until acted on

  safety_override boolean not null default false,
  tenant_contact text,               -- optional email, used for the "send" action's mailto: link

  -- 'new': triaged, no action taken yet. 'sent': emailed via the dashboard's Send button.
  -- 'copied': copied to clipboard instead. Both are terminal - a ticket doesn't need re-acting-on
  -- once either happens, but nothing stops re-copying/re-sending later if needed.
  status text not null default 'new' check (status in ('new', 'sent', 'copied')),

  -- Training-data pipeline (see api/analyze-tickets.js, admin.html, scripts/export_training_candidates.py):
  --   unanalyzed     - the daily cron hasn't judged this one yet (default)
  --   not_candidate  - judged redundant with existing training examples, skip (or an admin
  --                    rejected it after a closer look - "Not useful" in admin.html)
  --   candidate      - judged worth a human look; triggers the admin notification email
  --   added_to_train - admin approved it for dataset/real_examples.jsonl ("updated")
  --   added_to_gold  - admin decided this one belongs in the fixed eval set instead ("pushed to gold")
  training_status text not null default 'unanalyzed'
    check (training_status in ('unanalyzed', 'not_candidate', 'candidate', 'added_to_train', 'added_to_gold')),

  -- Set by scripts/export_training_candidates.py once a row has actually been written into a
  -- dataset file - separate from training_status so re-running the export script is idempotent
  -- (skips rows already exported) without needing another status value.
  exported_at timestamptz,

  created_by uuid references auth.users(id)
);

-- Safe to re-run: adds the columns above if you already created this table before they existed.
alter table tickets add column if not exists training_status text not null default 'unanalyzed';
alter table tickets add column if not exists exported_at timestamptz;
alter table tickets drop constraint if exists tickets_training_status_check;
alter table tickets add constraint tickets_training_status_check
  check (training_status in ('unanalyzed', 'not_candidate', 'candidate', 'added_to_train', 'added_to_gold'));

create index if not exists tickets_created_at_idx on tickets (created_at desc);
create index if not exists tickets_training_status_idx on tickets (training_status) where training_status = 'unanalyzed';

-- RLS enabled with NO policies, on purpose - this table is only ever touched via the
-- service_role key from server-side API routes (api/triage.js, api/tickets.js,
-- api/ticket-action.js), which bypasses RLS entirely regardless of policies. Enabling it anyway
-- is defense-in-depth: if the anon/publishable key were ever used against this table directly
-- (e.g. a future bug or a new client-side feature added carelessly), zero policies means zero
-- access, not silent full access to every tenant's messages.
alter table tickets enable row level security;

-- Inbound tenant emails (api/inbound-email.js) land here FIRST, not straight into `tickets` -
-- receiving an email is not the same as deciding it needs a reply, and AI triage costs a real
-- inference call, so neither should happen automatically just because an email arrived. A row
-- here only becomes a ticket once the property manager reviews it in dashboard.html's inbox and
-- clicks "Triage" themselves (see api/triage.js's tenant_message_id handling).
create table if not exists tenant_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  from_email text not null,
  subject text,
  body text not null,

  created_by uuid references auth.users(id),

  -- 'pending': sitting in the inbox, not yet acted on. 'resolved': the ticket created from this
  -- message was actually sent to the tenant (api/send-reply.js). 'dismissed': reserved for a
  -- future "not worth a reply" action - nothing sets this yet.
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),

  -- Set once the manager triages this message (api/triage.js links it here) - from that moment
  -- the row disappears from the pending inbox list (see api/tenant-messages.js's query, which
  -- filters on ticket_id is null) even though `status` itself doesn't flip to 'resolved' until
  -- the resulting ticket is actually sent. Keeps a single inbound email from being triaged twice
  -- while still tracking, separately, whether a reply actually went out.
  ticket_id uuid references tickets(id)
);

create index if not exists tenant_messages_pending_idx on tenant_messages (created_at desc)
  where status = 'pending' and ticket_id is null;

-- Same defense-in-depth reasoning as `tickets` above - only ever touched via service_role.
alter table tenant_messages enable row level security;

-- Maps an inbound email's local-part (the part before @) to the Leaseline customer (property
-- manager) it belongs to - see api/inbound-email.js. Multiple customers can share the same
-- receiving domain (Resend's free <id>.resend.app address, or a future verified custom domain)
-- since Resend accepts any local-part sent to that domain - the local-part is what's actually
-- unique per customer, not the domain, so this table (not a DNS/Resend setting) is what does the
-- routing. Managed via admin.html's "Customers" panel (api/admin-customers.js).
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  name text not null,
  -- lowercase, no "@domain" - e.g. 'sunsetapartments'. Always set, but not always admin-chosen:
  -- api/admin-customers.js defaults this to the owner account email's own local-part when the
  -- admin leaves it blank, so a customer isn't forced to invent a second address just to receive
  -- tenant email - the account email itself (Supabase login, invites, business correspondence
  -- with us) is a separate concern and is never used as the literal tenant-facing address.
  local_part text not null unique,

  -- The Supabase user (dashboard.html login) who manages this customer's tickets. One owner per
  -- customer for now - a single user managing multiple customers/properties is real future work,
  -- not modeled yet, same "not before it's needed" reasoning as everywhere else in this project.
  owner_user_id uuid not null references auth.users(id),

  -- Usage/plan tracking - see api/_lib/billing.js. No real payment processor integrated yet
  -- (Stripe/LemonSqueezy deferred, see progress.md's Phase 3 notes) - this only tracks and
  -- displays usage against a plan, it never charges anyone.
  --
  -- is_beta + beta_locked_until are separate on purpose: is_beta is the permanent historical
  -- record of "this customer was brought on as a beta customer"; beta_locked_until is the actual
  -- date their locked-in BETA_MONTHLY_PRICE_USD reverts to the standard rate - computed ONCE, at
  -- grant time, as now + BETA_DURATION_MONTHS (api/admin-customers.js), and stored as this fixed
  -- timestamp rather than always recomputed from BETA_DURATION_MONTHS on the fly. That's what
  -- makes it safe for the app owner to change BETA_DURATION_MONTHS later without retroactively
  -- shortening or extending a duration a customer already locked in - only customers granted beta
  -- AFTER the env var changes are affected. Lets effectivePrice() tell "still within the locked
  -- period" apart from "was beta, that period's over" without ever having to clear is_beta itself.
  is_beta boolean not null default false,
  beta_locked_until timestamptz,

  -- Anchors this customer's monthly usage/billing period - triage usage (see api/_lib/billing.js)
  -- is counted as `tickets` rows with created_at >= current_period_start, not a separately
  -- incremented counter, so it's always correct even if computed retroactively. Rolled forward by
  -- api/billing-reminders.js (daily cron) once a full month has elapsed - not derived on-the-fly
  -- from created_at, so a customer's billing anchor day doesn't silently drift.
  current_period_start timestamptz not null default now(),

  -- Set by api/billing-reminders.js once it's sent this period's "your plan renews soon" email -
  -- prevents sending the same reminder multiple times across repeated daily cron runs within the
  -- same period, without needing a separate reminders table.
  last_reminder_sent_at timestamptz,

  -- Cancellation - see api/admin-customers.js's PATCH action and api/_lib/billing.js's isActive().
  -- Policy: cancel-at-period-end, no refund, no immediate cutoff - a customer already paid for
  -- their current period, so they keep it in full regardless of usage so far. canceled_at is when
  -- cancellation was requested (a historical record); access_ends_at is the actual date access
  -- stops - computed ONCE at cancel time as that period's periodEnd(), same "compute once, store
  -- it, never recompute" pattern as beta_locked_until, so a customer's access date can't silently
  -- move if current_period_start were ever touched afterward. Both null means "active, not
  -- canceled" - the normal state for every customer until someone cancels.
  canceled_at timestamptz,
  access_ends_at timestamptz
);

-- Safe to re-run: adds the columns above if you already created this table before they existed
-- (same convention as `tickets`' own alter statements above).
alter table customers add column if not exists is_beta boolean not null default false;
alter table customers add column if not exists beta_locked_until timestamptz;
alter table customers add column if not exists current_period_start timestamptz not null default now();
alter table customers add column if not exists last_reminder_sent_at timestamptz;
alter table customers add column if not exists canceled_at timestamptz;
alter table customers add column if not exists access_ends_at timestamptz;

create index if not exists customers_local_part_idx on customers (local_part);

-- Same defense-in-depth reasoning as tickets/tenant_messages above - only ever touched via
-- service_role from server-side API routes.
alter table customers enable row level security;

-- Cooldown state for api/_lib/alerts.js's alertAdmin() - one row per alert `key` (e.g.
-- "hf-endpoint-down"), so a sustained outage emails ADMIN_EMAIL once per COOLDOWN_MS instead of
-- once per failed request. Needs to be a real table, not an in-memory timestamp in alerts.js,
-- because separate serverless invocations don't share memory.
create table if not exists system_alerts (
  key text primary key,
  last_sent_at timestamptz not null
);

-- Same defense-in-depth reasoning as the tables above - only ever touched via service_role.
alter table system_alerts enable row level security;
