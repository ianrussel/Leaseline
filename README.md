# Faultline — Phase 0 Landing Page

Validation landing page for "Faultline," an AI maintenance-triage micro-SaaS
for small property managers. Static single-page site, no build step.

See the full venture plan: `imon-my-48-years-staged-frost.md` in this repo.

## Before you share the link

The waitlist form posts to [Formspree](https://formspree.io) (free tier).
It's currently pointed at a placeholder endpoint, so submissions won't be
captured until you:

1. Create a free account at formspree.io and add a new form.
2. Copy the endpoint it gives you (`https://formspree.io/f/xxxxxxxx`).
3. Open `index.html`, find `FORM_ENDPOINT` near the bottom, and paste your
   real endpoint in.
4. Redeploy (`vercel --prod`).

Until then, a submission shows a graceful fallback asking people to email
you directly — nothing breaks, it just won't auto-collect.

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
