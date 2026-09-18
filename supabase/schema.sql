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
