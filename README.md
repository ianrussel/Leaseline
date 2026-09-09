# Faultline — Phase 0 Landing Page

Validation landing page for "Faultline," an AI maintenance-triage micro-SaaS
for small property managers. Static single-page site, no build step.

See the full venture plan: `imon-my-48-years-staged-frost.md` in this repo.

## Run it locally

Preview it before every deploy:

```bash
npm run dev
```

Opens at http://localhost:3000 — edit `index.html`, save, refresh the tab
to see the change (no build step, no restart needed).

## Waitlist submissions

The form posts to [Formspree](https://formspree.io) (free tier) and
arrives by email — manage or export entries at
https://formspree.io/forms. The endpoint is wired in via `FORM_ENDPOINT`
near the bottom of `index.html`; if you ever need to point it at a
different form, that's the one line to change, then redeploy
(`vercel --prod`).

## Deploy to Vercel

One-time setup:

```bash
npx vercel login
```

This emails you a verification link — click it in your browser to
authenticate the CLI.

Deploy:

```bash
npx vercel --prod
```

First run asks a few setup questions (link to a new project, keep
defaults). Every later `npx vercel --prod` redeploys the same project to
the same URL.

## After it's live

Per the Phase 0 plan:
- Post the link in r/PropertyManagement, r/Landlord, BiggerPockets, local
  property-manager Facebook/LinkedIn groups.
- Directly message 30–50 small property managers (2–20 units) asking if
  they'd pay for this.
- Gate to move forward with fine-tuning: 15–20 waitlist signups, or 5+
  verbal "I'd pay" commitments, within ~2 weeks.

## Phase 1 — training dataset

Built in parallel with Phase 0 deployment, so it's ready the moment the
validation gate is passed. See [`dataset/README.md`](dataset/README.md)
for the schema, taxonomy, and honest limitations.

```bash
python3 scripts/generate_dataset.py --train 2000 --eval 150   # (re)generate
python3 scripts/validate_dataset.py                            # QA: schema, dupes, leakage, distribution
```

Current dataset: 2,000 template train rows, 150 eval rows, 8 categories ×
4 urgency levels, ~12% multi-issue messages, zero schema errors or
duplicates. A local-LLM diversification pass (`scripts/diversify_dataset.py`,
paraphrases text/replies while freezing the template's category/urgency
labels as ground truth) completed on the eval set and on 860/2,000 train
rows before being interrupted — `dataset/train.diverse.jsonl` currently
has 860 rows, `dataset/eval.diverse.jsonl` has all 150. Re-run the script
to finish the remaining rows before a from-scratch fine-tune; the
existing 860 are real, usable, already-QA'd training data as-is.

## Chat widget (customer-facing FAQ bot)

A floating "Ask about Faultline" chat widget on the landing page answers
prospect questions grounded in `docs/knowledge-base.md` — see that file
for the full content and its own "keep this updated" note.

- **Backend**: `api/chat.js`, a zero-config Vercel serverless function
  (any file under `api/` becomes an endpoint automatically — no
  framework, no build step). It stuffs the whole knowledge base into the
  system prompt (small enough that a vector DB would be overkill) and
  calls the Claude API, with the knowledge base cached
  (`cache_control: ephemeral`) so repeat questions are cheap.
- **Required setup**: create an API key at
  [console.anthropic.com](https://console.anthropic.com/), then in the
  Vercel project add an environment variable
  `ANTHROPIC_API_KEY` = that key (Project → Settings → Environment
  Variables), then redeploy. Without it, the widget shows a clear "not
  configured yet" error instead of failing silently.
- **Local testing**: `npm run dev` (via `serve`) is static-only and does
  **not** run `api/chat.js` — the widget will show a connection error
  locally. Use `npx vercel dev` instead to test the full chat flow
  before deploying, or just verify after `vercel --prod`.
- **Known gap**: no rate limiting yet (would need a KV store like Upstash
  Redis — a separate account, not set up). Cost is bounded per-message
  (512 max output tokens, low reasoning effort, 2000-character input
  cap) but not per-visitor. Fine for beta-stage traffic; revisit if this
  ever gets meaningfully popular before real usage is proven.

## Phase 2 — fine-tuning

Runs on the existing `ait-lab` fine-tuning pipeline (config-driven,
RunPod-based), not custom code in this repo — see
`ait-lab/ai_training/trainings/task-faultline-triage/README.md` for the
full task writeup, the GPU-sizing rationale (a rented 16GB+ card is
plenty; the local machine's 4GB GPU doesn't clear even that), and a
ready-to-run RunPod notebook. Data prep (CPU-only) is already done and
committed there; `pipeline.py` (the actual GPU training run) is a manual
step — it costs real rented-GPU money and needs a human review of
`gold.jsonl` first, by that project's own design.
