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
            facebook-announcement.txt, the announcement video, and the ait-lab task folder/config —
            same scope as the Faultline→Leaseline rename already done once)
- [ ] **Deploy to Vercel production.** No `.vercel/project.json` exists yet — unclear if this has
      ever actually gone live via `vercel --prod`, as opposed to just `vercel dev` locally.
      Confirm/run `npx vercel --prod` after the rename lands.
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
- [ ] Fold real tenant messages into `dataset/real_examples.jsonl` as Phase 0 outreach turns them
      up (currently empty — matters more than the synthetic volume above)

## Phase 2 — Fine-tuning

Runs on the ait-lab fine-tuning pipeline, not custom code in this repo. Task code now lives at
`private/task-leaseline-triage/` (moved 2026-09-17, see that folder's README for the full
writeup and the shared-pipeline dependency).

- [x] Task set up: `task.type: extraction`, `Qwen/Qwen2.5-1.5B-Instruct`, judge-free/
      calibration-free scoring (category + urgency field accuracy)
- [x] `prepare_data.py` + `targets.py` run successfully (CPU, local) — verified working again
      after the folder move
- [x] RunPod notebook ready (`module_colab_leaseline.ipynb`)
- [ ] **Re-run `prepare_data.py`** — it was last run against the 860-row diversified train set;
      the source dataset is now the full 2,000 rows (see Phase 1). Re-running picks up all 2,000
      before the GPU spend below, rather than fine-tuning on the smaller snapshot.
- [ ] Human review of `gold.jsonl` (real product data, not a throwaway benchmark — this is the
      checkpoint before spending money)
- [ ] Set `confirmed: true` in `config_leaseline.yaml` (the ait-lab copy is authoritative)
- [ ] Rent a RunPod GPU (cheapest 16GB+ card is enough — see that task's README for why) and run
      `pipeline.py` — expect well under an hour of GPU time, a few dollars total
- [ ] Read the ACCEPT/REJECT gate result in `report.json`
- [ ] If ACCEPT: adapter is usable — proceed to Phase 3 to actually deploy it. If REJECT: read the
      per-field breakdown before deciding whether to adjust data, LR, or epochs and re-run

## Phase 3 — Production inference, dashboard, auth, billing (not started)

Deliberately not started yet — needs a fine-tuned model to actually deploy (Phase 2) and/or
confirmed demand (Phase 0 gate) before it's worth building. Needs several new accounts only the
project owner can create.

- [ ] Hugging Face account + upload the fine-tuned adapter
- [ ] Deploy a Hugging Face Inference Endpoint (scale-to-zero, per the original cost plan)
- [ ] Supabase project (auth + user accounts)
- [ ] Stripe account (billing)
- [ ] Build the actual dashboard UI (paste/forward a message → see it triaged, approve/edit/send)
- [ ] Wire dashboard → inference endpoint → auth → billing
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
- [x] `.vercelignore` added — keeps `private/`, `scripts/`, `dataset/`, internal planning docs,
      and the announcement video/text out of the deployed site (they were being publicly served
      as static files before this)
- [x] ait-lab fine-tuning task moved into this repo under `private/` for version control +
      privacy, paths updated and re-verified working after the move
- [ ] Consider whether `README.md` itself should also be excluded from deployment (left in for
      now — no secrets in it, just setup instructions; low priority either way)
