# Leaseline

AI maintenance-triage micro-SaaS for small property managers and landlords. Static single-page
site (`index.html`), no build step, plus a small serverless backend for the chat widget.

- Full venture plan: [`imon-my-48-years-staged-frost.md`](imon-my-48-years-staged-frost.md)
- What's done / what's next, in order: [`progress.md`](progress.md)
- This file: how to run it, what each piece is, environment requirements

## What's in this repo

| Path | What it is |
|---|---|
| `index.html` | The landing page - copy, styling, demo ticket examples, waitlist form, chat widget UI |
| `dashboard.html` | Minimal, **unauthenticated**, unlinked internal triage UI - calls `api/triage.js` directly (see "Triage endpoint" below) |
| `api/chat.js` | Vercel serverless function backing the chat widget (Claude API + knowledge base) |
| `api/triage.js` | Vercel serverless function backing maintenance-triage requests (Hugging Face Inference Endpoint - the fine-tuned model from `../leaseline-training`) |
| `api/inbound-email.js` | Resend webhook - receives a tenant's email automatically and triages it, no copy-paste needed (see "Inbound email" below) |
| `api/_lib/triage-engine.js` | Shared core logic (`api/triage.js` and `api/inbound-email.js` both call this rather than duplicating the HF call/safety-net/ticket-insert) |
| `docs/knowledge-base.md` | Source of truth the chatbot answers from - read at runtime by `api/chat.js` |
| `docs/leaseline-knowledge-base.pdf` | Same content, rendered as a PDF (for feeding into an external RAG tool if needed) |
| `dataset/` | Training data + its own generator/validator scripts - see `dataset/README.md` |
| `scripts/` | `generate_dataset.py`, `validate_dataset.py`, `diversify_dataset.py` |
| `facebook-announcement.txt`, `leaseline-announcement.mp4` | Marketing copy/video drafted for launch |

Fine-tuning lives in a **separate sibling repo**, [`../leaseline-training`](../leaseline-training) -
see "Fine-tuning" below.

## Environment variables

| Variable | Required | Where it's used | Get it from |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes, for the chat widget to answer | `api/chat.js` (`new Anthropic()` reads it automatically - never hardcode a key in code) | [console.anthropic.com](https://console.anthropic.com/) → API Keys → Create Key |
| `CHAT_LOG_FORMSPREE_ENDPOINT` | No - chat works without it | `api/chat.js` forwards every question+answer to this Formspree endpoint, which emails it to you (the widget has no other storage) | Reuse the waitlist form's endpoint, or create a second Formspree form to keep chat logs separate |
| `HF_ENDPOINT_URL` | Yes, for `/api/triage` to answer | `api/triage.js` - the Hugging Face Inference Endpoint URL serving the fine-tuned model | Created per `../leaseline-training`'s `deploy-inference-endpoint.md` - shown on the endpoint's page once deployed (`https://<hash>.endpoints.huggingface.cloud`) |
| `HF_TOKEN` | Yes, for `/api/triage` to answer | `api/triage.js` - auth for the call above | Must be the **read-only** fine-grained token from `deploy-inference-endpoint.md` step 0 - never the write-scoped one used to create/upload the model repo |
| `SUPABASE_URL` | Yes, for `/api/triage` to accept requests | `api/triage.js` - verifies the caller's session server-side before doing anything else | Supabase dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes, for `/api/triage` to accept requests | `api/triage.js` only - the secret admin key used to validate session tokens | Same page as above. **Never** put this in `dashboard.html` or any client-side code - that's what the separate anon/public key (hardcoded in `dashboard.html`, safe by design) is for |

**Local:** copy `.env.example` to `.env` and fill in the real values:

```bash
cp .env.example .env
```

`.env` is gitignored - it never gets committed. `npx vercel dev` (see
below) loads it automatically; nothing else needs to source it.

**Deployed on Vercel:** `.env` is local-only and is **not** picked up by
a deploy - each variable has to be added separately in the dashboard:
**Project → Settings → Environment Variables** → add it → check all
three environments (Production/Preview/Development) → save → redeploy
(env var changes only apply to the *next* deploy). Without
`ANTHROPIC_API_KEY`, the chat widget shows a clear "not configured yet"
error instead of failing silently; without `HF_ENDPOINT_URL`/`HF_TOKEN`,
`/api/triage` does the same - either error means this step hasn't been
done yet, not that something's broken.

## Run it locally

Two different local servers, for two different things:

```bash
npm run dev       # static file server (serve) - fast, but api/*.js does NOT run
npx vercel dev     # full local Vercel environment - runs api/*.js too, reads .env
```

Use `npm run dev` (http://localhost:3000) for everyday landing-page
edits - no build step, refresh to see changes. Use `npx vercel dev` when
testing anything that touches a serverless function (`api/chat.js` or
`api/triage.js`), since `npm run dev`'s static server can't execute
either function at all (calling them will just fail with a connection
error even with valid keys set).

## Deploy to Vercel

One-time setup:

```bash
npx vercel login
```

This emails you a verification link - click it in your browser to
authenticate the CLI.

Deploy:

```bash
npx vercel --prod
```

First run asks a few setup questions (link to a new project, keep
defaults). Every later `npx vercel --prod` redeploys the same project to
the same URL. `.vercelignore` keeps `scripts/`, `dataset/`, and internal
planning docs out of the deployed bundle.

## Waitlist submissions

The form posts to [Formspree](https://formspree.io) (free tier) and
arrives by email - manage or export entries at
https://formspree.io/forms. The endpoint is wired in via `FORM_ENDPOINT`
near the bottom of `index.html`; if you ever need to point it at a
different form, that's the one line to change, then redeploy
(`vercel --prod`). The form itself is currently hidden behind a status
message on the live page (see `progress.md`) - the markup is intact, so
re-enabling it is a one-line `hidden` attribute flip, not a rebuild.

## Training dataset

See [`dataset/README.md`](dataset/README.md) for the schema, taxonomy, and honest limitations.

```bash
python3 scripts/generate_dataset.py --train 2000 --eval 150   # (re)generate the templated base set
python3 scripts/validate_dataset.py                            # QA: schema, dupes, leakage, distribution
python3 scripts/diversify_dataset.py dataset/train.jsonl dataset/train.diverse.jsonl  # LLM paraphrase pass (local Ollama)
```

## Chat widget (customer-facing FAQ bot)

A floating "Ask about Leaseline" chat widget on the landing page answers
prospect questions grounded in `docs/knowledge-base.md` - see that file
for the full content and its own "keep this updated" note.

- **Backend**: `api/chat.js`, a zero-config Vercel serverless function
  (any file under `api/` becomes an endpoint automatically - no
  framework, no build step). It stuffs the whole knowledge base into the
  system prompt (small enough that a vector DB would be overkill) and
  calls the Claude API, with the knowledge base cached
  (`cache_control: ephemeral`) so repeat questions are cheap.
- **Setup + local testing**: see "Environment variables" and "Run it
  locally" above - `ANTHROPIC_API_KEY` in both `.env` (local) and
  Vercel's dashboard (deployed), and `npx vercel dev` to test it before
  shipping.
- **Chat logging** (optional): set `CHAT_LOG_FORMSPREE_ENDPOINT` and
  every question+answer pair forwards there silently - nothing in the
  widget itself indicates this to whoever's chatting. Formspree's free
  tier caps submissions per month, so a busy week of chat traffic could
  hit that cap faster than the waitlist form alone would.
- **Known gap**: no rate limiting yet (would need a KV store like Upstash
  Redis - a separate account, not set up). Cost is bounded per-message
  (512 max output tokens, low reasoning effort, 2000-character input
  cap) but not per-visitor. Fine for beta-stage traffic; revisit if this
  ever gets meaningfully popular before real usage is proven.

## Triage endpoint (maintenance-triage backend)

`api/triage.js` accepts a tenant's maintenance message and returns
`{category, urgency, draft_response, safety_override}`, using the
fine-tuned model deployed per `../leaseline-training`'s
`deploy-inference-endpoint.md`. No dashboard calls this yet (see
`progress.md`, Phase 3) - it's reachable directly for now.

- **Backend**: builds the exact chat-template prompt the model was
  trained on (must match `leaseline-training`'s `prepare_data.py`
  `INSTRUCTION` constant - a mismatch silently degrades output rather
  than erroring), calls the Hugging Face Inference Endpoint, extracts
  the JSON object from the response (tolerant of surrounding prose/a
  stray trailing brace - see the comment above `extractJsonObj` in the
  file), then applies a narrow keyword safety-net floor (forces minimum
  `Emergency` urgency on gas-smell/sparking/flooding/broken-lock
  phrasing specifically - not generic tone words like "ASAP", since
  those turned out to be an unreliable urgency signal during training
  data review - see `progress.md`'s Phase 2 notes).
- **Setup + local testing**: `HF_ENDPOINT_URL` and `HF_TOKEN` in `.env`
  (see "Environment variables" above), then `npx vercel dev`:

  ```bash
  curl http://localhost:3000/api/triage \
    -X POST -H "Content-Type: application/json" \
    -d '{"message": "the kitchen sink has been leaking for 2 days"}'
  ```

  Expect `{"category":"Plumbing","urgency":"High","draft_response":"...","safety_override":false}`.
  Worth also checking the safety-net floor fires independent of the
  model's own tone reading:

  ```bash
  curl http://localhost:3000/api/triage \
    -X POST -H "Content-Type: application/json" \
    -d '{"message": "hey no rush but the front door lock is busted, doesnt lock at all lol"}'
  ```

  Should come back `"urgency":"Emergency","safety_override":true`
  regardless of how casually the message reads. And the error paths:
  `-d '{}'` for a 400, or `curl http://localhost:3000/api/triage`
  (no `-X POST`) for a 405. A `503` with *"starting up - try again in a
  moment"* is expected (not a bug) the first time the endpoint is hit
  after being scale-to-zero idle - it means the HF endpoint is cold
  booting, not that anything's broken.
- **Production testing**: same requests, against the deployed URL once
  `HF_ENDPOINT_URL`/`HF_TOKEN` are set in Vercel's dashboard and
  redeployed:

  ```bash
  curl https://<your-vercel-domain>/api/triage \
    -X POST -H "Content-Type: application/json" \
    -d '{"message": "the kitchen sink has been leaking for 2 days"}'
  ```

  If this 500s with "not configured yet" in production but works
  locally, the env vars weren't actually saved in Vercel's dashboard (or
  a redeploy hasn't happened since) - `.env` never gets picked up by a
  deploy, same caveat as `ANTHROPIC_API_KEY` above.
- **Known gaps**: no rate limiting (same caveat as the chat widget
  above); no auth yet, so `dashboard.html` (below) is unauthenticated
  and unlinked rather than gated.

## Inbound email (automatic tenant messages, no copy-paste)

`api/inbound-email.js` - the "future inbox connection" tier mentioned in
`docs/knowledge-base.md`'s own roadmap ("by paste, forward, or future inbox connection"). A
tenant's email arrives with zero manual copy-pasting into `dashboard.html` required.

**Deliberately does NOT auto-triage or auto-create a ticket.** Receiving an email isn't the same
as deciding it needs a reply, and AI triage costs a real inference call, so neither happens
automatically just because an email arrived - especially since a tenant can send several messages
about different issues before earlier ones are resolved. Instead:

1. The webhook only inserts a `pending` row into the `tenant_messages` table (see
   `supabase/schema.sql`).
2. `dashboard.html`'s **Tenant inbox** card lists pending rows, oldest first, and auto-loads the
   oldest one into the "Tenant message" window - a click on any other row loads that one instead.
   Nothing is submitted until the manager clicks **Triage** themselves, same as a pasted message
   always required.
3. Triaging one (`api/triage.js`) links it to the new ticket, which removes it from the pending
   list - but the row isn't marked `resolved` until the reply is actually sent
   (`api/send-reply.js`), which also clears the window and auto-loads the next oldest pending
   message, turning the flow into a queue.

`api/triage.js` and `api/inbound-email.js` no longer share identical logic the way they briefly
did - only `api/triage.js` (dashboard-triggered) calls into `api/_lib/triage-engine.js`'s HF
call/safety-net/ticket-insert pipeline; `api/inbound-email.js` never calls it at all, on purpose.

**How it works**: Resend receives the email, sends a webhook to this endpoint with metadata only
(from/to/subject - not the body), which fetches the actual body via a separate Resend API call,
and saves it as a pending tenant message.

**Setup**:
1. Resend dashboard → **Emails** → **Receiving** → note your free `<id>.resend.app` address (no
   DNS/domain setup needed to start - you can configure a custom domain's MX record later if you
   want a branded address instead).
2. Resend dashboard → **Webhooks** → **Add endpoint** → your deployed URL +
   `/api/inbound-email` → subscribe to the `email.received` event → copy the signing secret into
   `RESEND_WEBHOOK_SECRET`.
3. Resend dashboard → **API Keys** → **Create API Key** → permission **Full access** (not
   "Sending access" - that's what the existing `RESEND_API_KEY` is) → paste it into
   `RESEND_RECEIVING_API_KEY`. This has to be a separate key from `RESEND_API_KEY`: fetching a
   received email's body (`GET /emails/receiving/{id}`) 401s with "This API key is restricted to
   only send emails" against a Sending-access key, and widening the existing sending-only key to
   Full access would give the send-only code paths (`analyze-tickets.js`, `send-reply.js`) more
   privilege than they need.
4. Set `INBOUND_EMAIL_OWNER` to the email of the Supabase user tickets should be created under.
5. `npm install` (pulls in the new `svix` dependency, used for webhook signature verification).

Remember to set `RESEND_RECEIVING_API_KEY` in Vercel's dashboard too (Project Settings →
Environment Variables) and redeploy - like every other env var here, `.env` only covers local dev.

**No per-customer routing yet** - every email received, regardless of which address it was sent
to, becomes a ticket under the single account in `INBOUND_EMAIL_OWNER`. Real multi-customer
routing (matching the `to` address to a specific customer's account) is Phase 3/4 work, once
there's an actual multi-account system - premature before that, same reasoning as not building a
signup form yet.

**Signature verification is mandatory, not optional** - the endpoint rejects any request that
doesn't verify against `RESEND_WEBHOOK_SECRET` using the `svix` library, so a random POST to the
URL (anyone can guess `/api/inbound-email` exists) can't fabricate tickets or spend Inference
Endpoint usage.

**Local testing is awkward on purpose, not broken**: Resend needs a real deployed HTTPS URL to
send webhooks to, so this can't be fully tested against `vercel dev` the way `dashboard.html` can
- either deploy first, or use a tunnel tool (e.g. `ngrok`) pointed at your local dev server and
register *that* URL as the webhook endpoint temporarily.

## Dashboard (internal preview)

`dashboard.html` - paste a tenant message, see it triaged, edit the draft reply, copy it. Calls
`api/triage.js` directly via `fetch`, no framework, no build step, same convention as `index.html`.

- **Gated behind real login, not just obscurity** - Supabase auth, checked both client-side (shows
  a sign-in screen) and server-side (`api/triage.js` rejects any request without a valid session
  token, so the API itself is protected even if someone finds the URL directly - a login screen
  alone wouldn't stop that). One admin user only, added manually via the Supabase dashboard
  (Authentication → Users → Add user) - there's no signup form, deliberately; build one only once
  actual beta users need their own accounts, not before. Still `noindex`/unlinked on top of that.
- **One-time setup**: create a Supabase project, add yourself as a user (Authentication → Users →
  Add user, with a real email + password), then:
  - Fill `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` into `.env` (and Vercel's dashboard for prod)
  - Fill the `SUPABASE_URL`/`SUPABASE_ANON_KEY` placeholders directly in `dashboard.html`'s
    `<script type="module">` (the anon key is safe to hardcode - it's the public key by design,
    protection comes from auth, not from hiding it; **never** put the service role key there)
  - `npm install` to pull in the new `@supabase/supabase-js` dependency
- **Local testing**: `npx vercel dev` (needed for `api/triage.js` to actually respond - `npm run
  dev`'s static server can't run it), then open `http://localhost:3000/dashboard.html` and sign in
  with the user you added above.
- **Two actions on every result, your choice**: "Send via email" (`api/send-reply.js`) sends the
  (possibly edited) reply for real via Resend, after a confirm dialog - not a silent one-click
  auto-send, but a genuine send, not the `mailto:` link this used to be. That older version only
  recorded `status: 'sent'` the moment the button was clicked, regardless of whether a mail client
  even opened or an email was ever actually delivered - a real gap between what the status said
  and what happened, fixed by sending server-side and only marking `sent` after a confirmed
  success. "Copy reply" is still there for whatever channel isn't email, unchanged.
- A distinct `⚠` note appears when the safety-net floor in `api/triage.js` overrode the urgency
  the model itself predicted - so whoever's using this can tell the difference between the model's
  own judgment and the safety net stepping in.
- **Every triage is a persisted ticket**, not a stateless response - see `supabase/schema.sql`'s
  `tickets` table and the "Recent tickets" list on the page. `api/tickets.js` /
  `api/ticket-action.js` back this.

## Training review (admin) and the real-tenant-data pipeline

`admin.html` - same login as `dashboard.html` - lists real tenant tickets flagged as worth adding
to `leaseline-training`'s dataset, lets you correct category/urgency/draft before approving, and
tracks each one as `added_to_train` or `added_to_gold`.

- **What flags a candidate**: `api/analyze-tickets.js`, a **daily** Vercel Cron job (see
  `vercel.json` - Hobby plan caps cron at once/day, hourly fails at deploy time on that tier). It
  asks Claude whether each new ticket is redundant with already-well-covered patterns or a
  genuinely useful edge case, so `real_examples.jsonl` doesn't just fill up with every raw message
  verbatim. Reuses the existing `ANTHROPIC_API_KEY` - no new AI account needed.
- **Why not Celery**: needs a persistent worker process (the opposite of serverless) and is
  Python-only in an all-Node.js project. Vercel's own newer "Queues" primitive was tempting but is
  Beta, needs special permissions, and assumes Next.js conventions this repo doesn't use - Cron is
  the stable fit for genuinely time-triggered work like this.
- **Setup**: `CRON_SECRET` (any random string - `openssl rand -hex 32`, matched in Vercel's
  dashboard), `ADMIN_EMAIL`, and a free [Resend](https://resend.com) account for
  `RESEND_API_KEY` - the "new candidate" notification email. Skips sending silently if
  `RESEND_API_KEY` isn't set; everything else still works. **This same `RESEND_API_KEY` is also
  what `api/send-reply.js` uses** for the dashboard's actual "Send via email" action (see the
  Dashboard section above) - one Resend account covers both.
- **What approving does NOT do**: write to `dataset/real_examples.jsonl` or `eval.diverse.jsonl`
  directly - a Vercel function has no access to this git checkout. Run
  `scripts/export_training_candidates.py` (idempotent, safe to re-run) to actually pull approved
  rows into the files - `added_to_train` rows go straight into `real_examples.jsonl`;
  `added_to_gold` rows land in `dataset/gold_candidates_to_review.jsonl` for you to review and add
  to `eval.diverse.jsonl` by hand, since that file staying a deliberately-fixed benchmark was the
  entire point of the earlier gold.jsonl review process.

## User & access management (Supabase)

Reference for the account-management steps that come up repeatedly but aren't in any one place -
all done in the Supabase dashboard, not in code.

### Add a new user (dashboard.html access)

**Authentication → Users → Add user → Create new user.** Real email + a password.
**Check "Auto Confirm User"** - without it, Supabase expects the user to click an email
confirmation link before they can log in at all, which won't happen since there's no
email-sending set up for that flow. This is also how you'd add a staff member later - there's no
self-serve signup form anywhere (deliberately, per `progress.md`'s Phase 3 notes - build one only
once real beta customers need their own accounts).

Any user created this way can log into `dashboard.html` and use the triage tool. It does **not**
grant `admin.html` access - that's a separate step:

### Grant admin access (admin.html access)

`admin.html`'s training-review panel requires `app_metadata.role === "admin"` (checked both
server-side in `api/_lib/auth.js`'s `requireAdmin()` - the real boundary - and client-side in
`admin.html` for a clean message instead of a broken panel).

**The Supabase dashboard has no editable `app_metadata` field anywhere** - the Users page only
lists users; setting `app_metadata` requires the Admin API, which needs the service_role key
server-side. Use `scripts/set-admin-role.js` (uses `@supabase/supabase-js`, already a dependency)
rather than reaching for the SQL Editor to hand-edit `auth.users` directly - Supabase's own
`auth` schema isn't a supported/stable target for direct writes, the Admin API is the sanctioned
path:

```bash
SUPABASE_URL=$(grep -m1 '^SUPABASE_URL=' .env | cut -d= -f2-) \
SUPABASE_SERVICE_ROLE_KEY=$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2-) \
node scripts/set-admin-role.js user@example.com
```

(Pulls both values straight out of `.env` rather than `source .env` directly - safer if `.env`
ever has a stray non-`KEY=VALUE` line in it, which breaks `source` outright. Real account emails/
passwords belong in the gitignored `supabase.md`, never in this file - `README.md` is tracked.)

Then have that user **sign out and back in** - Supabase notes the change takes effect on the next
token refresh, a fresh login guarantees it rather than waiting for one.

To revoke, add `--revoke`:
```bash
SUPABASE_URL=$(grep -m1 '^SUPABASE_URL=' .env | cut -d= -f2-) \
SUPABASE_SERVICE_ROLE_KEY=$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2-) \
node scripts/set-admin-role.js user@example.com --revoke
```

### Multiple admins (e.g. hiring a VA to help with training review)

Same process, once per person - nothing about it changes with more admins:

1. **Add a user** for them first (see "Add a new user" above - Authentication → Users → Add user,
   real email + password, check "Auto Confirm User").
2. **Grant admin** with the same script: `node scripts/set-admin-role.js their-email@example.com`.
3. They sign in at `admin.html` with the credentials you gave them.

**Two things worth knowing before handing this to a VA specifically:**

- **There's no tiered/granular permission system** - `role: "admin"` is all-or-nothing, the exact
  same access level as your own account (full training-review panel: edit any ticket, approve to
  train or gold). There's no "read-only" or "review but not approve" tier. If that's more access
  than you want to hand a contractor, that's a real gap to build before doing so, not something
  already configurable.
- **Checking who currently has admin access** isn't exposed in any page either - query it
  directly in Supabase's SQL Editor (read-only queries against `auth.users` are fine; it's writes
  to that schema that are discouraged, which is why granting still goes through the Admin API
  script instead of an `UPDATE` here):
  ```sql
  select email, raw_app_meta_data->>'role' as role
  from auth.users
  where raw_app_meta_data->>'role' = 'admin';
  ```

**When the engagement ends**, revoke with `--revoke` (above) - that alone stops `admin.html`
access on their very next request, not just after their token eventually expires.
`requireAdmin()` calls Supabase's `auth.getUser(token)`, which always round-trips to the Auth
server for verified, current data - unlike the lighter `getClaims()` (not used here), which only
decodes the JWT locally and could still reflect a role that's since been revoked. Consider also
disabling their login entirely (Authentication → Users → find them → there's a ban/disable
action) if they shouldn't retain `dashboard.html` access either.

**Do NOT** use `user_metadata` for this - Supabase lets a user edit their own `user_metadata` from
the browser, so it can't be trusted for authorization. `app_metadata` can only be changed
server-side or via the dashboard, which is what makes it safe to gate admin access on.

### Staging vs. production (optional, free)

Supabase's free tier allows **2 active projects per org** at $0 - a second project dedicated to
staging costs nothing extra (vs. Supabase's own "Branching" feature, which is Pro-plan-only
($25/mo) plus ~$9.70/mo per persistent branch - not worth it for a long-lived staging environment
specifically). Setup:

1. Create a second Supabase project, run `supabase/schema.sql` there too.
2. Server-side (`api/*.js`) is easy: Vercel lets the same env var name hold different values per
   environment - set `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` to production's values under
   Vercel's **Production** scope, staging's values under **Preview**/**Development**.
3. Client-side is the one wrinkle: `dashboard.html`/`admin.html` hardcode `SUPABASE_URL`/
   `SUPABASE_ANON_KEY` directly (no build step, by design), so a static file can't automatically
   swap values per environment the way the server-side can. Treat staging as a **manual local
   toggle** instead: keep both projects' credentials in `supabase.md`, and when testing against
   staging, temporarily swap `.env` plus the two hardcoded constants near the top of each HTML
   file's `<script type="module">`, test with `npx vercel dev`, then revert before deploying.
4. Free projects auto-pause after a week of inactivity - if staging's been quiet, click "unpause"
   in its dashboard before using it again.

## Fine-tuning

Lives in a **separate repo**, [`../leaseline-training`](../leaseline-training) - not this one,
and not deployed anywhere. Standalone (own `requirements.txt`, own `prepare_data.py`/`train.py`/
`evaluate.py`, no dependency on any other project's pipeline code); the only thing it reads from
*this* repo is `dataset/` (as a sibling checkout, for its raw training data). See that repo's
README for the full task writeup, GPU sizing, and the RunPod notebook.
