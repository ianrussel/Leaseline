# Progress Tracker

Internal tracker for what's done and what's next, in phase order. `README.md` stays purely
technical (how to run, env vars, requirements) — this file is the todo list. Update it as things
move; don't let it drift the way the knowledge base briefly did.

Last reviewed: 2026-09-17 (dataset diversification completed same day).

---

## 🔴 Immediate next actions (blocking or quick wins)

These sit ahead of their phase below because they block everything after them.

- [ ] **Finalize product name.** Currently "Leaseline" everywhere in code, but that name has a
      real collision (an active landlord-software company on the same TLD pattern) and is not
      recommended for actual use. "Amborly" is the current front-runner (verified clean: domain
      unregistered, zero brand/company hits) — see chat history for the full naming research and
      the ~20 rejected candidates. Decide, then:
      - [ ] Register the domain (amborly.com, or whichever name wins)
      - [ ] Run a real USPTO TESS trademark search (the research so far is web-search-based, not
            a legal clearance)
      - [ ] Execute the rename across the codebase (index.html, api/chat.js, docs/knowledge-base.md
            + regenerate PDF, README.md, package.json, dataset/README.md, scripts/generate_dataset.py,
            facebook-announcement.txt, the announcement video, and the sibling `leaseline-training`
            repo — same scope as the Faultline→Leaseline rename already done once). Consider
            renaming both project folders too (`leaseline/` → `<name>/`,
            `leaseline-training/` → `<name>-training/`) for consistency, though not required.
- [ ] **Deploy to Vercel production.** No `.vercel/project.json` exists yet, and `.vercel/repo.json`
      still shows the project name as "faultline" from an even earlier rename — unclear if this
      has ever actually gone live via `vercel --prod`, as opposed to just `vercel dev` locally.
      Confirm/run `npx vercel --prod` after the rename lands (may need `vercel link` again given
      the folder rename firstproject→leaseline and the stale project name).
- [ ] **Set `ANTHROPIC_API_KEY` in the Vercel dashboard** (Project → Settings → Environment
      Variables). Works locally via `.env`; production won't answer chat questions without this
      set separately. Confirm by asking the live chat widget something after deploying.
- [ ] Decide whether to turn on `CHAT_LOG_FORMSPREE_ENDPOINT` (optional — silently forwards every
      chat Q&A to your email; off by default until this is set).

---

## Phase 0 — Landing page & validation

- [x] Landing page built (`index.html`) — ticket/dispatch visual identity, 4 before/after triage
      examples spanning all urgency levels
- [x] Waitlist form wired to Formspree
- [x] Chat widget + backend (`api/chat.js`, Claude API, grounded in the knowledge base) — verified
      working end-to-end with a real API call
- [x] Google Analytics (GA4) added, skipped on localhost
- [x] Facebook announcement copy + 10s teaser video drafted (`facebook-announcement.txt`,
      `leaseline-announcement.mp4` — filenames will change with the rename)
- [ ] **Waitlist is currently PAUSED on purpose** — landing page shows an "in development" status
      message instead of the signup form (form markup still in the DOM, just `hidden`, so it's a
      quick flip back). Re-enable once Phase 2 produces a real result worth showing beta joiners.
- [ ] Post the Facebook announcement (after the rename, so it doesn't announce a name you're not
      using)
- [ ] Outreach: r/PropertyManagement, r/Landlord, BiggerPockets, local PM Facebook/LinkedIn groups
- [ ] Direct-message 30–50 small property managers (2–20 units)
- [ ] **Validation gate**: 15–20 waitlist signups, or 5+ verbal "I'd pay" commitments, within
      ~2 weeks of actually opening the waitlist back up

## Phase 1 — Training dataset

- [x] Generator (`scripts/generate_dataset.py`) — 2,000 template train rows, 150 eval rows, 8
      categories × 4 urgency levels, ~12% multi-issue messages
- [x] Validator (`scripts/validate_dataset.py`) — schema, dupes, leakage, distribution checks
- [x] Diversification pass (`scripts/diversify_dataset.py`, local Ollama model, frozen-label
      guard) — **complete**: 2,000/2,000 train rows, 150/150 eval rows. 4.4%/4.7% fallback rate
      (safety guard rejecting bad rewrites) — expected, not a problem. `train.diverse.jsonl` /
      `eval.diverse.jsonl` are the files to actually fine-tune on, per `dataset/README.md`.
- [ ] **Ongoing, not blocking** — fold real tenant messages into `dataset/real_examples.jsonl`
      *whenever* outreach or real users turn them up (currently empty; no script reads this file
      yet, so it also needs prepare_data.py updated or a manual merge into `train.diverse.jsonl`
      once there's something to add). The 2,000-row synthetic set is a complete v0 dataset on its
      own — **Phase 2 does not wait on this.** Real examples matter more than more synthetic
      volume only in the sense that if/when they show up, add those before generating still more
      synthetic rows — not that fine-tuning is gated on having any.
      - No live surface captures real tenant messages today — checked 2026-09-17: the landing
        page's demo tickets are static, the chat widget only answers FAQ questions about
        Leaseline (not maintenance requests), and the beta intake form (currently hidden anyway)
        has no free-text field. Real examples right now only arrive via manual outreach, pasted
        in by hand against `dataset/real_examples_guide.jsonl`'s schema.
      - [ ] **Once Phase 3 stands up Supabase**, move real-example intake off "SSH + hand-edit a
            jsonl" onto a Postgres table (Supabase gives a table editor UI for free — no separate
            vector DB needed just to browse/query rows without shell access). Plain columns
            (`raw_message`, `category`, `urgency`, `draft_response`, `source`, `reviewed`,
            `added_to_dataset`, `created_at`) cover it. Add `pgvector` only if/when there's an
            actual similarity-search need (e.g. "flag messages similar to ones already in
            gold.jsonl") — not required just to avoid SSH-ing to a file.
      - [ ] Write a small export script: reviewed DB rows → append to
            `dataset/real_examples.jsonl` in the existing schema, so `prepare_data.py` and the
            whole `leaseline-training` pipeline stay unchanged — the DB only replaces *how humans
            get eyes on new examples*, not the training data format.

## Phase 2 — Fine-tuning

**Moved to a separate standalone repo, [`../leaseline-training`](../leaseline-training)
(2026-09-17).** No longer depends on the ait-lab research project's shared pipeline code - this
is a real product, so its training code owns its own `prepare_data.py`/`train.py`/`evaluate.py`,
own `requirements.txt`, own repo. The only cross-repo reference anywhere in that repo is
`prepare_data.py` reading this repo's `dataset/` folder.

- [x] `prepare_data.py` rewritten standalone (zero external imports), verified working - 2,000
      train rows + 150 gold rows
- [x] `evaluate.py` written - judge-free field-accuracy scoring (category+urgency exact match).
      Pure scoring logic unit-tested and confirmed correct (exact match, partial match,
      unparseable output, prose-wrapped JSON all score correctly)
- [x] `train.py` written - QLoRA fine-tune, evaluates base vs. tuned, writes ACCEPT/REJECT
      `report.json`. Model-loading/`SFTTrainer` calls follow a proven-working pattern from
      ait-lab's own train.py (reused as reference code, not a runtime dependency)
- [x] RunPod notebook updated for the standalone repo (no more shared-folder env vars to
      override - that whole risk class is gone now that data/output live in this repo, not a
      shared external volume)
- [x] **`train.py`/`evaluate.py` run end-to-end on RunPod (RTX 2000 Ada, 16GB), 2026-09-17** -
      the code itself is now validated, not just the reference pattern it was based on
- [x] Human review of `data/gold.jsonl` in `leaseline-training` (real product data, not a
      throwaway benchmark — this is the checkpoint before spending money). Done 2026-09-17 via
      `review_gold.py`'s heuristic shortlist + a manual read of every flagged row: 5 rows had a
      real severity/label mismatch and were corrected in `dataset/eval.diverse.jsonl` (jammed
      disposal, stuck-open gate, breaker-tripping microwave, 2x malfunctioning fire alarm); the
      other ~30 flagged rows are tenants using "ASAP"/"pronto" on objectively low-severity issues
      and are correctly labeled as-is — left unchanged on purpose.
- [x] 8 hand-authored reinforcement rows added to `train.diverse.jsonl` (train-only - see
      `dataset/README.md`), targeting a specific risk pattern: casual/deadpan tenant phrasing
      ("no biggie probably lol") paired with genuinely dangerous issues (broken exterior locks,
      gas/burning smells). The diversify pass's safety guard only blocks *inventing* escalation
      language on Low/Medium rows - nothing guarded the reverse, a true Emergency read as
      minimizing/casual - so these rows push against the model treating tone as a shortcut for
      actual severity instead of the message content.
- [x] Rent a RunPod GPU (RTX 2000 Ada, 16GB, ~$0.13/hr) and run `train.py --config config.yaml`
      (`seed0`), 2026-09-17. **ACCEPT**: `mean_field_accuracy` 0.537 -> 0.927 (gain +0.390, bar
      was 0.05), parse_rate 1.0 both. Per field: category 71.3% -> 98.0%, urgency 36.0% -> 87.3%.
- [x] Adapter downloaded and verified at `leaseline-training/runs/seed0/adapter/` (7 files,
      `adapter_model.safetensors` 36.9MB, config confirms rank 16/alpha 32/all-linear against
      `Qwen2.5-1.5B-Instruct`).
- [ ] **Known remaining edge cases** (read from `eval_tuned.json`, not just the aggregate score) -
      urgency is the harder field, and 3 genuinely hard misses remain: garbled slang ("stove
      stinks flem") with no literal gas/burning keyword, an ambiguous HVAC-vs-Electrical
      vent-near-water-heater phrasing, and one broken-lock phrasing variant still predicted Low
      instead of Emergency. Judgment call: good enough to proceed - these read as edge cases, not
      a systemic pattern, and urgency is a human-confirmed recommendation by design
      (`knowledge-base.md` section 4), not an autonomous action. Worth a keyword-based
      safety-net floor in the Phase 3 inference pipeline (force a minimum urgency on hard trigger
      phrases like "gas smell"/"won't lock", regardless of model output) as cheap insurance,
      independent of any further retraining.
- [x] Proceed to Phase 3 to actually deploy the adapter - see `leaseline-training`'s
      `deploy-inference-endpoint.md` for the step-by-step (merge -> Hugging Face upload ->
      Inference Endpoint -> wire into `leaseline`'s dashboard). Endpoint live and verified via
      `curl` as of 2026-09-18 - see Phase 3 below for what's actually done vs. still open.

## Phase 3 — Production inference, dashboard, auth, billing (inference live, rest not started)

Inference deployment done ahead of the Phase 0 demand gate since Phase 2 produced an ACCEPT
adapter worth standing up; dashboard/auth/billing still deliberately wait on confirmed demand.

- [x] Hugging Face account + upload the fine-tuned adapter. Merged (LoRA -> standalone model via
      `merge_adapter.py`) rather than deployed as a separate adapter - see
      `deploy-inference-endpoint.md`'s step 1 for the tradeoff. Pushed to a **private** repo,
      `<username>/leaseline-triage-v0`.
- [x] Deploy a Hugging Face Inference Endpoint (scale-to-zero, per the original cost plan) - live
      and confirmed working via a direct `curl` request as of 2026-09-18. Two real deploy bugs
      hit and fixed along the way, now permanently handled inside `merge_adapter.py` so a future
      re-deploy won't rediscover either:
      - **`Task` defaulted to `Custom`**, which crashed the container with `KeyError: "Unknown
        task custom"` - fine for a standard architecture like `Qwen2ForCausalLM`, just needed
        `Task` explicitly set to `Text Generation` on the endpoint, plus `merge_adapter.py` now
        writes a `README.md` with `pipeline_tag: text-generation` so the *next* endpoint's task
        auto-detects correctly instead of defaulting to Custom at all.
      - **Tokenizer load crash** (`AttributeError: 'list' object has no attribute 'keys'`) -
        Qwen's base `tokenizer_config.json` ships an `extra_special_tokens` *list* of unused
        Qwen2.5-**VL** (vision-language) tokens the deployed container's `transformers` version
        expects as a *dict*. `merge_adapter.py` now drops that key entirely on merge (harmless -
        `eos_token`/`<|im_start|>` etc. still work via their own fields / `tokenizer.json`).
- [x] Wire the endpoint into an actual product surface - `api/triage.js` added, 2026-09-18, same
      shape as `api/chat.js`. Handles the exact chat-template prompt shape, tolerant JSON
      extraction, a distinct 503 for scale-to-zero cold starts (vs. a generic error), and a
      narrow keyword safety-net floor (forces minimum `Emergency` on gas smell/sparking/flooding/
      broken-lock phrasing - deliberately not generic tone words like "ASAP", per the training
      data review's finding that tenants use those as filler for trivial issues too). Requires
      `HF_ENDPOINT_URL`/`HF_TOKEN` set in Vercel's dashboard (documented in `.env.example`) - not
      yet actually set there, so this exists in code but isn't live in production yet.
- [x] Build the actual dashboard UI - `dashboard.html`, 2026-09-18, restyled onto a Bootstrap
      admin theme (assets/admin-theme/) 2026-09-19 for a less "hand-rolled" look, brand fonts/
      colors kept consistent with `index.html`. Paste a message → see it triaged → edit the draft
      reply → **choose either** "Send via email" (`mailto:`, prefilled, tenant still reviews/sends
      it themselves in their own mail client - no transactional email service needed for this) or
      "Copy reply". Both actions are recorded against the ticket (see persistence below). Also
      unlinked/`noindex` on top of the auth below.
- [x] Supabase project (auth) - **minimal scope, real auth for one user, not a full account
      system**, fully set up and working end-to-end as of 2026-09-18. `api/triage.js` verifies the
      caller's session token server-side (`supabase.auth.getUser()`, extracted into
      `api/_lib/auth.js` and reused by every endpoint below) before doing anything - a login
      screen alone isn't real protection since the API itself has to check too. No signup flow -
      the one admin user was added manually via the Supabase dashboard.
- [x] **Ticket persistence** - `supabase/schema.sql`'s `tickets` table, 2026-09-19. Every triage is
      now a real row (ticket number, timestamp, category/urgency, the model's original draft vs.
      whatever was actually sent/copied after edits, status), not a stateless API response that
      vanishes on refresh - closes the gap against `knowledge-base.md`'s own claim that tickets
      are "stored so the property manager can review their history." `dashboard.html` shows a
      recent-tickets table. New endpoints: `api/tickets.js` (history), `api/ticket-action.js`
      (records send/copy + the final edited text). **Fixed a real access-control gap, same day**:
      both endpoints originally had no per-user scoping at all - `api/tickets.js` returned every
      user's tickets to whoever was logged in, and `api/ticket-action.js` would update any ticket
      by id with no ownership check. Both now filter/require `created_by = <the caller>` (already
      set correctly at creation time in `api/triage.js`, so no backfill needed) - deliberately
      different from `api/admin-tickets.js`, which correctly shows candidates across all users,
      since that's the entire point of the admin review panel.
- [x] **"Send via email" now actually sends** - `api/send-reply.js`, 2026-09-19. The original
      `mailto:` version recorded `status: 'sent'` the instant the button was clicked, regardless
      of whether a mail client even opened or anything was ever delivered - a real gap between
      the status and reality. Now sends server-side via Resend (same account/key already used for
      the training-candidate notification email) with a confirm dialog first, and only marks
      `sent` after a confirmed successful send. Verifies ticket ownership before sending, not
      after, so a wrong/foreign ticket id can't trigger a real email before the check runs.
- [x] **Inbound email - the "future inbox connection" tier from `knowledge-base.md`'s own
      roadmap, done** - `api/inbound-email.js`, 2026-09-19. A tenant's email now becomes a ticket
      automatically, no copy-pasting into `dashboard.html` required (that flow still exists,
      unchanged, as an alternative). Refactored the shared logic into
      `api/_lib/triage-engine.js` so `api/triage.js` and this both call the identical HF/safety-
      net/ticket-insert path rather than two copies drifting apart. Uses Resend's inbound email
      receiving (free `<id>.resend.app` address, no DNS setup needed to start) - webhook gives
      metadata only, body fetched via a separate Resend API call, signature verified via `svix`
      (new dependency) before anything is processed. **No per-customer routing yet** -
      `INBOUND_EMAIL_OWNER` is a single hardcoded account every received email attributes to;
      real per-customer routing needs an actual multi-account system first (Phase 3/4).
- [x] **Two production bugs found and fixed after deploying the above, 2026-09-18**:
      - **"model returned unparseable output" in prod, worked fine locally.** Root cause in
        `api/_lib/triage-engine.js`'s `extractJsonObj`: a multi-paragraph `draft_response`
        containing a literal, unescaped newline is valid-looking to a human but invalid JSON (raw
        control characters must be escaped inside a JSON string) - `JSON.parse` correctly rejected
        it. Rewrote the brace-depth scanner to track whether it's currently inside a quoted
        string, for two reasons: (1) a `{`/`}` inside string content must not be counted as
        structural, and (2) raw `\n`/`\r`/`\t` found *inside* a string are now escaped before
        parsing. Verified against the exact real failing payload from the error log. A matching
        latent bug likely exists in `leaseline-training`'s Python `evaluate.py` (`extract_json_obj`
        there is the same greedy-ish approach) - not fixed, out of scope, flagged for later.
      - **Inbound email webhook configured correctly in Vercel but no tickets appeared.** Not an
        env var omission - confirmed via direct `curl` to Resend's API that `RESEND_API_KEY`
        (sending-access only) 401s with `"This API key is restricted to only send emails"` when
        `api/inbound-email.js` calls `GET /emails/receiving/{id}` to fetch a received email's
        body. Resend API keys are either "Full access" or "Sending access" - no in-between, and
        the existing key was created sending-only for `analyze-tickets.js`/`send-reply.js`. Fixed
        by introducing a separate `RESEND_RECEIVING_API_KEY` (Full access) rather than widening
        the existing key, so the sending-only code paths keep least-privilege. **Also answered a
        specific question**: the `<id>.resend.app` receiving address shown in Resend's dashboard
        is not something our code needs - it's purely a Resend-side routing setting, and the
        webhook payload's `to` field isn't even read yet (no per-customer routing exists).
        Requires the user to create a new Full-access key in Resend's dashboard and set
        `RESEND_RECEIVING_API_KEY` in both `.env` and Vercel, then redeploy.
      - **Two more bugs found getting the webhook itself working, same session**: (1) the webhook
        was registered against the site root (`https://faultline-ruby.vercel.app`), not
        `/api/inbound-email` - a 405 on every event, found via `GET /webhooks` on Resend's API and
        fixed with a `PATCH` to the correct endpoint URL; (2) `RESEND_WEBHOOK_SECRET` in `.env` was
        a placeholder value that never got replaced with the real signing secret from Resend's
        dashboard - found the same way (`GET /webhooks/{id}` returns `signing_secret`), fixed by
        copying the real value into `.env` (still needs setting in Vercel too).
- [x] **Inbound email redesigned: inbox, not auto-ticket, 2026-09-18.** After the above was
      finally working end-to-end, realized the original design (webhook -> auto-triage -> ticket,
      no human in the loop at all) was wrong: receiving an email isn't the same as deciding it
      needs a reply, triage costs a real inference call, and a tenant can send multiple messages
      about different issues before earlier ones are resolved. Reworked into:
      - New `tenant_messages` table (`supabase/schema.sql`) - `api/inbound-email.js` now only
        inserts a `pending` row here; it no longer calls `api/_lib/triage-engine.js` at all.
      - New `api/tenant-messages.js` - lists the caller's own pending rows, oldest first (a
        tenant's earlier, still-unresolved message should get worked before a newer one).
      - `dashboard.html`'s new "Tenant inbox" card lists pending messages and auto-loads the
        oldest into the "Tenant message" window - `messageInput`/`tenantContactInput` filled in
        exactly like a manual paste, but nothing is submitted until the manager clicks Triage
        themselves. Clicking a different row loads that one instead.
      - `api/triage.js` gained an optional `tenant_message_id` - when the triage came from the
        inbox, this links the row to the new ticket, which is what makes it disappear from the
        pending list (`ticket_id is null` in the query) without yet marking it resolved.
      - `api/send-reply.js` marks the linked `tenant_messages` row `status: 'resolved'` only once
        a reply is actually sent - not at triage time - and `dashboard.html` clears the window and
        auto-loads the next oldest pending message right after, turning the whole thing into a
        FIFO queue: sent -> next one's already waiting.
      - Real bug caught while wiring this up: the initial `showForSession(initialSession)` call
        (fires immediately on page load if already signed in) reached into the new
        `loadTenantMessages()`/`loadIntoWindow()`, which read `messageInput`/`tenantContactInput`/
        etc - but those `const`s were declared *after* that call in the file, so it threw a
        temporal-dead-zone `ReferenceError` on any reload while logged in. Same bug class the
        `ticketsBody` comment already flagged earlier in the file; fixed by moving the session-
        check block down to after all the form element `const`s.
- [x] **Send status stuck at "new" investigated - not a bug.** Queried `tickets` directly and
      cross-checked Resend's send log: tickets created via the old paste flow all correctly showed
      `status: 'sent'` with a matching delivered record in Resend; tickets created via the new
      inbox flow were stuck at `new` with `updated_at === created_at` (no DB write ever happened)
      *and* no Resend record at all for that recipient. Conclusion: "Send via email" was never
      actually completed for those specific test tickets (likely abandoned mid-test while
      debugging the webhook itself) - `api/send-reply.js`'s update-to-`sent` logic is the same code
      already proven working on the paste-flow tickets, no fix needed.
- [x] **Multi-customer inbound email routing, 2026-09-19.** Real question raised while testing
      inbound email: Resend's sandbox `resend.dev` sending domain can only send to the account's
      own verified email (separate, deferred issue) - but the more structural one was "we'll have
      multiple property-manager customers, each needs tenants emailing a dedicated address that
      routes to THEM, not one hardcoded owner." Until now `INBOUND_EMAIL_OWNER` was a single env
      var every received email attributed to - fine for one customer, wrong for more than one.
      - New `customers` table (`supabase/schema.sql`): `name`, unique `local_part`, `owner_user_id`.
        Resend's free `<id>.resend.app` address (and a future verified custom domain, same way)
        accepts any local-part sent to it - multiple customers can share one receiving domain
        because the local-part, not the domain, is what's actually unique per customer.
      - `api/inbound-email.js` no longer reads `INBOUND_EMAIL_OWNER` at all - it now reads the
        webhook's `to`/`received_for` field, extracts the local-part, and looks up the owning
        customer (`findCustomerByAddress`). An email to an unrecognized local-part is dropped
        (logged, 200 so Resend doesn't retry forever) rather than falling back to a default owner.
      - New `api/admin-customers.js` (admin-only) - GET/POST/DELETE on `customers`, resolving
        `owner_email` to a real Supabase user id via the Admin API (`listUsers()`, same pattern as
        the old `findOwnerUserId`) since there's still no signup flow - an owner must already be an
        existing Supabase user.
      - `admin.html` gained a "Customers" panel (table + add form) so this doesn't require running
        a script by hand, unlike `scripts/set-admin-role.js`'s pattern for admin grants.
      - Removed `INBOUND_EMAIL_OWNER` from `.env`/`.env.example` entirely - clean cutover, not a
        fallback alongside the new table, to avoid two parallel routing mechanisms getting out of
        sync. **Breaking for existing local testing**: the `test` local-part used throughout this
        session's manual testing needs to be (re-)added via `admin.html`'s new panel before inbound
        email works again.
      - **Follow-up same day**: the owner's Supabase account email should stay reserved for
        sign-in/invites/business correspondence with us, not double as the tenant-facing address -
        but requiring a *separate* support local-part for every customer was needless friction for
        the common case. `api/admin-customers.js` now defaults `local_part` to the owner email's
        own local-part when the admin leaves the field blank (e.g. `owner@example.com` defaults to
        `owner`) - not literally reusing the same address (Resend can only receive mail for a
        domain it's configured to receive for, never an arbitrary customer's real domain without
        them pointing DNS at it), but the same "no extra setup decision required" effect. An
        explicit local-part is still honored when given, for a customer who wants something more
        memorable like `sunsetapartments`. `admin.html`'s form field is optional now, with a hint
        explaining the default.
      - **Another follow-up, same day**: two more refinements from a design-review conversation -
        (1) confirmed and documented explicitly that `local_part` is unique per customer at the DB
        level (the existing `unique` constraint already enforced this - a duplicate insert 23505s,
        handled with a specific error message), and that `owner_user_id` is always a real,
        validated Supabase user id, never a free-typed value; (2) new `api/admin-users.js`
        (admin-only, lists `{id, email}` for every Supabase user) backs a proper dropdown for
        admin.html's "Owner" field, replacing a free-text email input that could be typo'd - not a
        new security boundary, `api/admin-customers.js`'s POST already validated `owner_email`
        against `listUsers()` regardless. Also added a note to admin.html explaining that a
        customer who wants tenants to keep emailing their existing business address needs a
        forwarding rule set up on their own end (e.g. Gmail → Forwarding and POP/IMAP) pointed at
        their assigned local-part address - not something this app can do for them, since Resend
        can only receive mail for domains it's configured to receive for.
      - **Third follow-up, same day**: the owner dropdown was listing every Supabase user,
        including ones that don't make sense to pick for a NEW customer. `api/admin-users.js` now
        excludes (1) admins (`app_metadata.role === "admin"`) and (2) users who already own a
        customer - re-selecting an existing owner would silently merge a second local-part's
        tickets into their existing inbox rather than create a genuinely new customer, which is
        never what "add a customer" means here. `admin.html` also refreshes this dropdown after
        both adding and removing a customer, not just on page load, since eligibility changes
        immediately either way (removing a customer frees their owner back up; adding one removes
        that owner from future picks).
      - **Fourth follow-up, same day**: `admin.html` only ever showed a bare local-part, so the
        admin had to remember the actual receiving domain separately and combine it by hand before
        giving an address to a customer. New `RESEND_RECEIVING_DOMAIN` env var (display-only -
        `api/inbound-email.js`'s routing still matches on local-part alone regardless of domain, so
        this never affects actual routing, only what's shown). `api/admin-customers.js`'s GET
        response shape changed from a bare array to `{ customers, receiving_domain }` to carry it;
        `admin.html` now shows each row's actual full address (`local_part@receiving_domain`)
        instead of a bare local-part, and the explanatory text above the table fills in the real
        configured domain instead of generic placeholder text.
- [x] **Gated the dashboard on customer status, not just Supabase login, 2026-09-19.** Until now,
      any Supabase user (added manually via the Supabase dashboard) could sign into `dashboard.html`
      and triage messages, even if an admin had never linked them to a customer via `admin.html` -
      an orphaned account in practice (no local-part, no inbound routing, invisible in the
      Customers panel), but still fully able to create tickets.
      - New `requireCustomer()` in `api/_lib/auth.js` - like `requireAdmin`, but checks for a
        `customers` row with `owner_user_id` = the caller, not `app_metadata.role`. Every
        dashboard-facing endpoint now uses this instead of `requireUser`: `api/triage.js`,
        `api/tickets.js`, `api/ticket-action.js`, `api/send-reply.js`, `api/tenant-messages.js`.
        This is the actual enforcement - a signed-in non-customer now gets a 403 from all of them.
      - New `api/customer-status.js` (`{ is_customer }`) - purely informational, lets
        `dashboard.html` show a clean "contact your admin" screen instead of a raw 403 surfacing
        on the first triage attempt, same relationship as `admin.html`'s client-side role check vs.
        `requireAdmin`. `showForSession` became `async` to await this check before deciding
        whether to render the real dashboard or the new `#notCustomerScreen`.
      - **Immediate consequence**: the `customers` table is currently empty (confirmed via direct
        query), so this blocks every account, including local testing, until at least one customer
        row exists. Add one via `admin.html`'s Customers panel before testing the dashboard again.
- [x] **Docs: custom-DNS option + inbound-email flow chart, 2026-09-19.** Two documentation
      additions to `README.md`'s "Inbound email" section, no code changes:
      - Made explicit that a customer isn't stuck with the shared `<id>.resend.app` address - they
        can point their own domain's MX records at Resend (Resend dashboard → Domains → Add
        Domain) and use `maintenance@theirrealcompany.com`-style addresses instead. This was
        already technically true (local-part routing doesn't care which domain the mail arrived
        on) but wasn't called out as a customer-facing choice anywhere before now.
      - Added a Mermaid flow chart walking the entire inbound-email path end to end: both the
        shared-address and custom-domain branches converging at "Resend receives the email",
        through webhook verification, the customer lookup (and the dropped-email branch for an
        unrecognized local-part), the pending `tenant_messages` insert, dashboard.html's inbox,
        the manual Triage/review/Send steps, and the final `sent`/`resolved` status flip. Makes
        the "nothing is automatic until a human clicks Triage" design decision (see the earlier
        "Inbound email redesigned" entry) visible at a glance instead of only written prose.
- [x] **Root-caused a real deploy failure: Vercel Hobby's 12-function cap, 2026-09-19.** The owner
      dropdown (`api/admin-users.js`) and the customer-status gate (`api/customer-status.js`) -
      both added earlier the same day - never actually reached production, despite the user
      reporting the deploy as "successful." `api/*.js` had quietly grown to 13 route files
      (excluding `_lib`), one over the Hobby plan's 12-Serverless-Functions-per-deployment limit.
      What made this hard to see: the deployment the user was testing against showed **Ready**
      with only 11 functions live - it had silently reused a stale cached build from before those
      two files existed, rather than failing loudly. Running a fresh, cache-free deploy
      (`vercel deploy --prod --force`) surfaced the real error immediately: `"No more than 12
      Serverless Functions can be added to a Deployment on the Hobby plan."` Confirmed via
      `vercel inspect <url> --json`'s build output (only 11 lambdas, `admin-users` and
      `customer-status` both absent) and by checking that the missing files WERE correctly
      committed and pushed to `origin/main` (ruled out a git/push mistake before looking at Vercel
      itself).
      - Fixed by consolidating rather than dropping functionality: `api/admin-users.js`'s
        eligible-owner list folded into `api/admin-customers.js`'s existing GET response as a new
        `eligible_owners` field (`admin.html` now populates the dropdown from `loadCustomers()`'s
        response instead of a separate fetch); `api/customer-status.js` removed entirely -
        `dashboard.html`'s `checkIsCustomer()` now piggybacks on the `/api/tickets` call it was
        already about to make anyway, checking specifically for the `403` `requireCustomer()`
        returns, rather than a dedicated endpoint.
      - Back down to 11 functions - one under the cap, not sitting exactly at it, so there's a
        little headroom before this recurs. **Worth remembering for any future new `api/*.js`
        file**: check the function count first (`find api -maxdepth 1 -name "*.js" | grep -v
        _lib | wc -l`) - crossing 12 again will reproduce this exact silent-until-you-force-a-
        fresh-deploy failure mode.
- [x] **Four issues in one session, 2026-09-19:**
      1. **Admins got blocked by requireCustomer().** An admin signing into `dashboard.html` saw
         "your account isn't set up as a customer yet" - correct for a real non-customer account,
         wrong for an admin, who was never meant to need a `customers` row at all. Fixed:
         `requireCustomer()` (`api/_lib/auth.js`) now returns immediately for
         `app_metadata.role === "admin"`, before touching the `customers` table.
      2. **Invite emails redirect to localhost.** Not fixable in code - Supabase's public
         `/auth/v1/settings` endpoint doesn't expose it, confirming this lives in Authentication ->
         URL Configuration in the Supabase dashboard, not something the Admin API/service_role key
         can read or change. Root cause is almost certainly the project's default **Site URL**
         still being `http://localhost:3000` - every invite/magic-link email redirects there
         regardless of which environment actually sent it, since users are added through the
         dashboard's "Add user" button (no per-invite `redirectTo` override available there, only
         via `inviteUserByEmail()` programmatically, which nothing here calls). Needs the user to
         change Site URL to `https://faultline-ruby.vercel.app` and add it to Redirect URLs by
         hand - documented in README.md's "User & access management" section.
      3. **New tenant-message notification.** A tenant's email was correctly routed and saved as a
         pending `tenant_messages` row (confirmed via Resend's own delivery log), but the property
         manager had no way to know it arrived short of opening `dashboard.html` - nothing was
         ever coded to notify them. `api/inbound-email.js` now emails the resolved owner a short
         "new tenant message" notification right after saving the pending row (RESEND_API_KEY,
         sending-only), best-effort/non-fatal to the webhook itself. Same Resend sandbox
         restriction flagged elsewhere in this project applies - `onboarding@resend.dev` can only
         send to the account's own verified email until a real sending domain is verified.
      4. **Billing/usage scaffolding** - explicitly NOT real billing (no Stripe/LemonSqueezy
         integrated - deferred per progress.md's Phase 3 notes), just tracking and displaying
         usage against a plan:
         - New `api/_lib/billing.js`: `STANDARD_MONTHLY_PRICE_USD`/`BETA_MONTHLY_PRICE_USD`/
           `MONTHLY_TRIAGE_LIMIT`/`MAX_BETA_USERS` env vars (all optional, sensible defaults),
           `effectivePrice()`, `periodEnd()`, `countUsage()` (always computed live from `tickets`
           rows since `current_period_start`, never a separately incremented counter).
         - `customers` gained `is_beta`, `beta_locked_until`, `current_period_start`,
           `last_reminder_sent_at` columns. Beta status is capped at `MAX_BETA_USERS` and enforced
           server-side in `api/admin-customers.js`'s POST - requesting beta past the cap is
           silently downgraded to the standard rate, never rejected, per the explicit spec: adding
           a customer should never fail just because beta slots ran out.
         - `api/tickets.js`'s response shape changed from a bare array to `{ tickets, usage }` -
           `dashboard.html` shows a "Your plan" card (used/limit, price, reset date) from it; a
           customer's usage lookup failing, or an admin having no `customers` row at all, both just
           hide the card rather than error.
         - `admin.html`'s Customers table gained Plan/Usage/Renews columns and an "is_beta"
           checkbox on the add form, sourced from `api/admin-customers.js`'s GET response.
         - New `api/billing-reminders.js`, a second daily cron (`vercel.json`): rolls
           `current_period_start` forward a month once a period ends (which is what "resets"
           usage, since it's computed live), and emails a friendly "your plan period ends soon...
           disregard if already renewed" reminder `REMINDER_DAYS_BEFORE` (3) days out, at most once
           per period per customer. This is the 12th function - exactly at the Hobby cap, no
           headroom left (see the cap-consolidation entry just above).
         - **Overage is flagged, not enforced**: exceeding `MONTHLY_TRIAGE_LIMIT` mid-period shows
           a warning to both the customer and admin, but never blocks triage. Deliberate: this is a
           maintenance-triage app where a blocked emergency message is a real safety/liability
           risk, and there's no payment processor yet to actually charge overage anyway - once
           real billing exists, this is the natural place to add either a hard block or automatic
           overage billing.
         - **Requires the SQL to actually be run** - `supabase/schema.sql`'s new `alter table
           customers add column ...` statements for `is_beta`/`beta_locked_until`/
           `current_period_start`/`last_reminder_sent_at` were NOT applied automatically (confirmed
           via a direct query returning `column customers.is_beta does not exist`) - until run,
           `api/admin-customers.js`'s GET 500s and admin.html's Customers panel is broken.
- [x] **Resend sandbox restriction found blocking real tenant replies, 2026-09-19.** "Send via
      email" silently failed for an actual tenant address - confirmed via Resend's send log
      showing zero record of the attempt (rejected before delivery, not a bounce/error). Root
      cause: `onboarding@resend.dev` (the `from` in `send-reply.js` and three other files) is a
      Resend sandbox address that can only send to the account's own verified email - every prior
      "successful" send happened to go to that same address, never a genuinely different
      recipient, so this never surfaced until now. Not fixable in code - needs a real verified
      sending domain (Resend dashboard → Domains → Add Domain → DNS records). Logged as a TODO
      (not yet acted on - user is still deciding on a domain): whatever domain gets bought for the
      marketing site should double as the sending domain, since a mismatched one looks less
      trustworthy to recipients and weakens deliverability. Affects `api/send-reply.js`,
      `api/analyze-tickets.js`, `api/billing-reminders.js`, and `api/inbound-email.js`'s owner
      notification - all four need their `from:` updated together once a domain is verified.
- [x] **"Reopen" action + clearer sent/not-sent status on Recent tickets, 2026-09-19.** Until now,
      a triaged ticket that wasn't immediately sent or copied had no way back into the working
      panel - the manager had to remember to act on it in that same moment, or it was effectively
      stuck (visible in history, `status` shown as a bare 'new'/'sent'/'copied' string, no way to
      resume it). Fixed in `dashboard.html` only, no API changes (every field needed -
      `raw_message`, `category`, `urgency`, `draft_response`, `final_response`, `tenant_contact`,
      `status` - was already in `api/tickets.js`'s response):
      - Status badges now read as "Not sent" (amber)/"Sent" (green)/"Copied" (blue) instead of the
        raw status string.
      - Every row got a "Reopen" button - `reopenTicket()` repopulates the message box and Result
        panel (category/urgency/safety note/reply text) and sets `currentTicketId` to the existing
        ticket, so Send/Copy work again without a new AI call - it's already been triaged, reopening
        just re-exposes the actions. Deliberately available for `sent`/`copied` tickets too, not
        just `new` ones - a manager might legitimately want to send a follow-up on something
        already handled, not only recover something they forgot to act on.
      - Prefers `final_response` over `draft_response` when reopening, so resuming a
        previously-edited reply doesn't silently revert those edits back to the model's original.
- [x] **Configurable beta duration, 2026-09-19.** Beta lock length was hardcoded to exactly one
      year (`setFullYear(+1)` in `api/admin-customers.js`). New `BETA_DURATION_MONTHS` env var
      (`api/_lib/billing.js`, default 12) replaces the hardcoded value. Confirmed/documented the
      part that actually mattered to get right: `beta_locked_until` is computed ONCE, at grant
      time, from whatever `BETA_DURATION_MONTHS` is set to *then*, and stored as a fixed timestamp
      on that customer's own row - `effectivePrice()` only ever reads it back, never recomputes it
      from the current env var value. So raising or lowering `BETA_DURATION_MONTHS` later only
      affects customers granted beta AFTER the change; a customer who locked in 12 months keeps
      exactly 12 months even if the app owner changes the default to 18 the next day. This was
      already true structurally before this change (an absolute stored timestamp, not a formula
      re-evaluated live) - this just made the duration itself configurable instead of hardcoded,
      and added explicit comments in `billing.js`/`schema.sql`/`admin.html` spelling out why that
      matters, since it's easy to accidentally break by "simplifying" beta_locked_until into a
      computed property later.
- [x] **Cancellation plan + implementation, 2026-09-19.** Real design question: a customer already
      paid, then decides to cancel - what happens to remaining usage/access? **Chosen policy:
      cancel-at-period-end, no refund, no immediate cutoff, data kept.** They keep full access
      (including any remaining quota) until the period they already paid for ends, regardless of
      how much they've used - matches how virtually every flat-rate SaaS subscription works, and
      building real proration/refund logic would be pointless anyway with no payment processor
      integrated yet. After that period, no renewal, no more inbound routing, no more triage
      access - but nothing is ever deleted (tickets/tenant_messages/the customer row itself all
      stay, for records or a possible win-back).
      - `customers` gained `canceled_at` (historical record of when canceled) and `access_ends_at`
        (the actual cutoff - computed ONCE at cancel time as that period's `periodEnd()`, same
        "compute once, store it" pattern as `beta_locked_until`, so it can't drift if
        `current_period_start` is ever touched afterward for an unrelated reason).
      - New `isActive()` in `api/_lib/billing.js` - true whenever `access_ends_at` is unset or
        still in the future.
      - `requireCustomer()` (`api/_lib/auth.js`) now also rejects a customer whose access has
        ended, with a distinct message ("your subscription has ended") from "never set up as a
        customer" - this is the actual enforcement point, since every dashboard-facing endpoint
        already calls it.
      - `api/inbound-email.js`'s `findCustomerByAddress` also checks `isActive()` - a canceled
        customer past their end date stops receiving new `tenant_messages` rows instead of quietly
        accumulating messages nobody can act on anymore.
      - `api/billing-reminders.js` skips a canceled customer entirely (no period rollover - their
        access ends on its own via `access_ends_at`; no "your plan renews soon" reminder, since
        that framing would be wrong for someone who already asked to stop).
      - New `PATCH {id, action}` on `api/admin-customers.js` (no new file - already at the 12-
        function Hobby cap): `cancel` sets `access_ends_at` to the end of the CURRENT period, not
        now; `reactivate` clears both columns and, only if access had already lapsed, starts a
        fresh period from the moment of reactivation (nothing left to resume from the old one).
      - `admin.html`'s Customers table shows "Access ends `<date>`" (amber, still active) or
        "Ended `<date>`" (red, access already stopped) for a canceled customer instead of a normal
        renewal date, with Cancel/Reactivate buttons alongside the existing (unchanged, still
        permanent) Remove button.
      - `dashboard.html`'s "not a customer" screen now shows the server's actual reason (never set
        up vs. subscription ended) instead of always the same generic message.
      - **Still needs the schema applied** - same `is_beta`/etc. columns from the earlier billing
        entry above were confirmed STILL not run (`column customers.is_beta does not exist`,
        checked again), now joined by `canceled_at`/`access_ends_at`. `api/admin-customers.js`'s
        GET remains 500ing in production until all six `alter table` statements run.
- [x] **Real-tenant-data training pipeline** - closes the loop on `dataset/real_examples.jsonl`
      staying permanently empty, 2026-09-19:
      - `api/analyze-tickets.js`, a **daily Vercel Cron job** (`vercel.json`) - not hourly:
        Vercel's Hobby plan caps cron at once/day, an hourly schedule fails at deploy time on that
        tier. Asks Claude (reusing the existing `ANTHROPIC_API_KEY`, no new account) whether each
        unanalyzed ticket is redundant with already-well-covered patterns or a genuinely useful
        candidate, so not every raw message gets blindly saved as a training example.
      - Considered Celery for this and rejected it: Celery needs a persistent worker process,
        which is the opposite of what serverless is, and it's Python-only in an all-Node project.
        Vercel's own newer "Vercel Queues" primitive was the tempting native answer but is Beta,
        needs special permissions, and assumes Next.js App Router conventions this repo doesn't
        use - cron is the stable, GA fit for genuinely time-triggered (not user-triggered) work.
      - `admin.html` - a separate auth-gated page (same login as `dashboard.html`) listing
        candidates, where category/urgency/draft can be corrected before approving. Status flags
        exactly as requested: `unanalyzed` → `not_candidate` or `candidate` → `added_to_train`
        ("updated") or `added_to_gold` ("pushed to gold"). New endpoints: `api/admin-tickets.js`,
        `api/admin-update-ticket.js`.
      - **Honest limitation, not automated**: a Vercel function can't write to this git checkout,
        so admin approval only updates the database - `scripts/export_training_candidates.py` is
        the manual (idempotent, safe to re-run) step that actually appends approved rows into
        `dataset/real_examples.jsonl` (train) or `dataset/gold_candidates_to_review.jsonl` (gold
        candidates land here, not directly in `eval.diverse.jsonl` - that file staying a fixed,
        deliberately-hand-edited benchmark was the whole point of the earlier gold.jsonl review).
      - New env vars: `CRON_SECRET` (verifies cron requests are really from Vercel),
        `ADMIN_EMAIL`, `RESEND_API_KEY` (new account - free tier, needed because Formspree's
        form→email model doesn't fit "send FROM our code TO an address in `.env`").
- [ ] **Buy a real domain and verify it with Resend for sending** - blocking issue found
      2026-09-19: `api/send-reply.js`'s "Send via email" silently fails for any real tenant
      address, because `onboarding@resend.dev` (the current `from`) is a Resend sandbox address
      that can only send to the account's own verified email - confirmed via Resend's send log
      showing zero record of the attempt (rejected before delivery, not a bounce). Same
      restriction affects `api/analyze-tickets.js`, `api/billing-reminders.js`, and
      `api/inbound-email.js`'s owner-notification email - all four use the same sandbox `from`
      address. Fix: Resend dashboard → Domains → Add Domain → add the DNS records (SPF/DKIM) at
      the registrar → once verified, update the `from:` in all four files to use it. Whatever
      domain gets bought for the marketing site should be the one used here too (or a subdomain of
      it, e.g. `mail.<domain>`) - a mismatched sending domain looks less trustworthy to recipients
      and weakens deliverability versus one that matches the actual product's web presence.
- [ ] Stripe account (billing)
- [ ] Wire dashboard → inference endpoint → auth → billing - **auth part done above**; billing
      gating still not started (no Stripe account, no subscription check anywhere yet)
- [ ] Deploy dashboard on `app.<domain>` (same root domain as the marketing site, subdomain split
      — not a second domain; see chat history for the reasoning)

## Phase 4 — Launch (not started)

- [ ] Re-enable the beta waitlist once Phase 2/3 produce something real to show signups
- [ ] Email the waitlist, onboard first beta users
- [ ] Collect feedback, iterate on triage quality and draft-reply tone

---

## Housekeeping / infrastructure

- [x] Vercel serverless function for chat (`api/chat.js`), zero-config
- [x] `.env` / `.env.example` documented, `.env*` gitignored
- [x] `.vercelignore` added — keeps `scripts/`, `dataset/`, internal planning docs, and the
      announcement video/text out of the deployed site (they were being publicly served as
      static files before this)
- [x] **2026-09-17: two-repo split.** Project folder renamed `firstproject/` → `leaseline/`
      (git history intact). Fine-tuning code moved out entirely into a new sibling repo,
      [`../leaseline-training`](../leaseline-training) - standalone, no dependency on the
      ait-lab research project (see that repo's own commit history for the full rebuild:
      `prepare_data.py`/`train.py`/`evaluate.py` rewritten from scratch, own
      `requirements.txt`/`.pre-commit-config.yaml`). ait-lab itself is now fully clean of any
      Leaseline references - nothing there depends on this product or vice versa.
- [ ] Consider whether `README.md` itself should also be excluded from deployment (left in for
      now — no secrets in it, just setup instructions; low priority either way)
