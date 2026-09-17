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
| `api/chat.js` | Vercel serverless function backing the chat widget (Claude API + knowledge base) |
| `docs/knowledge-base.md` | Source of truth the chatbot answers from - read at runtime by `api/chat.js` |
| `docs/leaseline-knowledge-base.pdf` | Same content, rendered as a PDF (for feeding into an external RAG tool if needed) |
| `dataset/` | Training data + its own generator/validator scripts - see `dataset/README.md` |
| `scripts/` | `generate_dataset.py`, `validate_dataset.py`, `diversify_dataset.py` |
| `facebook-announcement.txt`, `leaseline-announcement.mp4` | Marketing copy/video drafted for launch |

Fine-tuning lives in a **separate sibling repo**, [`../leaseline-training`](../leaseline-training) -
see "Fine-tuning" below.

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

## Fine-tuning

Lives in a **separate repo**, [`../leaseline-training`](../leaseline-training) - not this one,
and not deployed anywhere. Standalone (own `requirements.txt`, own `prepare_data.py`/`train.py`/
`evaluate.py`, no dependency on any other project's pipeline code); the only thing it reads from
*this* repo is `dataset/` (as a sibling checkout, for its raw training data). See that repo's
README for the full task writeup, GPU sizing, and the RunPod notebook.
