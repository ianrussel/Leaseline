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

Current dataset: 2,000 train / 150 eval rows, 8 categories × 4 urgency
levels, ~12% multi-issue messages, zero schema errors or duplicates.
Fully synthetic (templated, not LLM-generated) — spot-check
`dataset/README.md`'s limitations section, and start folding real tenant
messages into `dataset/real_examples.jsonl` as Phase 0 outreach turns
them up, before treating this as fine-tune-ready.
