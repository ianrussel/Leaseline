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
