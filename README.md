# Faultline - Phase 0 Landing Page

Validation landing page for "Faultline," an AI maintenance-triage micro-SaaS
for small property managers. Static single-page site, no build step.

See the full venture plan: `imon-my-48-years-staged-frost.md` in this repo.

## Environment variables

Read by `api/chat.js`:

| Variable | Required | Where it's used | Get it from |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes, for the chat widget to answer | `api/chat.js` (`new Anthropic()` reads it automatically - never hardcode a key in code) | [console.anthropic.com](https://console.anthropic.com/) → API Keys → Create Key |
| `CHAT_LOG_FORMSPREE_ENDPOINT` | No - chat works without it | `api/chat.js` forwards every question+answer to this Formspree endpoint, which emails it to you (the widget has no other storage) | Reuse the waitlist form's endpoint, or create a second Formspree form to keep chat logs separate |

**Local:** copy `.env.example` to `.env` and fill in the real key:

```bash
cp .env.example .env
```

`.env` is gitignored - it never gets committed. `npx vercel dev` (see
below) loads it automatically; nothing else needs to source it.

**Deployed on Vercel:** `.env` is local-only and is **not** picked up by
a deploy - the same key has to be added separately in the dashboard:
**Project → Settings → Environment Variables** → add `ANTHROPIC_API_KEY`
→ check all three environments (Production/Preview/Development) → save
→ redeploy (env var changes only apply to the *next* deploy). Without
it, the chat widget shows a clear "not configured yet" error instead of
failing silently - that error means this step hasn't been done yet.

## Run it locally

Two different local servers, for two different things:

```bash
npm run dev       # static file server (serve) - fast, but api/chat.js does NOT run
npx vercel dev     # full local Vercel environment - runs api/chat.js too, reads .env
```

Use `npm run dev` (http://localhost:3000) for everyday landing-page
edits - no build step, refresh to see changes. Use `npx vercel dev` when
testing anything that touches the chat widget, since `npm run dev`'s
static server can't execute the serverless function at all (the widget
will show a connection error under it even with a valid key).

## Waitlist submissions

The form posts to [Formspree](https://formspree.io) (free tier) and
arrives by email - manage or export entries at
https://formspree.io/forms. The endpoint is wired in via `FORM_ENDPOINT`
near the bottom of `index.html`; if you ever need to point it at a
different form, that's the one line to change, then redeploy
(`vercel --prod`).

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
the same URL.

## After it's live

Per the Phase 0 plan:
- Post the link in r/PropertyManagement, r/Landlord, BiggerPockets, local
  property-manager Facebook/LinkedIn groups.
- Directly message 30–50 small property managers (2–20 units) asking if
  they'd pay for this.
- Gate to move forward with fine-tuning: 15–20 waitlist signups, or 5+
  verbal "I'd pay" commitments, within ~2 weeks.

## Phase 1 - training dataset

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
rows before being interrupted - `dataset/train.diverse.jsonl` currently
has 860 rows, `dataset/eval.diverse.jsonl` has all 150. Re-run the script
to finish the remaining rows before a from-scratch fine-tune; the
existing 860 are real, usable, already-QA'd training data as-is.

## Chat widget (customer-facing FAQ bot)

A floating "Ask about Faultline" chat widget on the landing page answers
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
- **Every question gets emailed to you** (optional, on by default once
  configured): set `CHAT_LOG_FORMSPREE_ENDPOINT` and every question+answer
  pair forwards there silently - nothing in the widget itself indicates
  this to whoever's chatting. Formspree's free tier caps submissions per
  month, so a busy week of chat traffic could hit that cap faster than
  the waitlist form alone would.
- **Known gap**: no rate limiting yet (would need a KV store like Upstash
  Redis - a separate account, not set up). Cost is bounded per-message
  (512 max output tokens, low reasoning effort, 2000-character input
  cap) but not per-visitor. Fine for beta-stage traffic; revisit if this
  ever gets meaningfully popular before real usage is proven.

## Phase 2 - fine-tuning

Runs on the existing `ait-lab` fine-tuning pipeline (config-driven,
RunPod-based), not custom code in this repo - see
`ait-lab/ai_training/trainings/task-faultline-triage/README.md` for the
full task writeup, the GPU-sizing rationale (a rented 16GB+ card is
plenty; the local machine's 4GB GPU doesn't clear even that), and a
ready-to-run RunPod notebook. Data prep (CPU-only) is already done and
committed there; `pipeline.py` (the actual GPU training run) is a manual
step - it costs real rented-GPU money and needs a human review of
`gold.jsonl` first, by that project's own design.
