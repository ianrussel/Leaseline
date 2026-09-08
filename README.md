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
- Gate to move to Phase 1 (dataset + fine-tuning): 15–20 waitlist signups,
  or 5+ verbal "I'd pay" commitments, within ~2 weeks.
