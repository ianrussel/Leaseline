# Plan: "Maintenance Triage API" — Property Management Micro-SaaS (Passive Income Venture)

## Context

Imon is a 48-year-old self-taught full-stack developer (started at 34) currently freelancing in AI model fine-tuning/training. He wants to convert his fine-tuning skillset into a **passive income** product rather than trading more hours for money. He is a generalist (no industry expertise) but is comfortable with the Hugging Face ecosystem.

Decisions already made (via clarifying questions):
- **Business model**: Option B — Micro-SaaS API (fine-tuned model behind a "scale-to-zero" endpoint, sold as a subscription/usage-based API).
- **First niche**: **Property Management** — an AI "Maintenance Triage" API that parses tenant/maintenance complaints, categorizes urgency, and drafts a work order or tenant response. E-commerce support ticket triage is the explicit **second** niche to build once #1 is validated or plateaus (same architecture, swappable dataset/model).
- **Time**: 20+ hrs/week — treat this as a near full-time push for the first 1–2 months.
- **Budget**: **$0 upfront.** Nothing gets spent (no domain, no GPU rental, no paid tools) until real demand is proven. Every phase below is sequenced so spending only happens after a validation gate is passed.

The goal of this plan is to give Imon a concrete, week-by-week path from "idea" to "first paying customer," with explicit dollar amounts and go/no-go gates so he never risks money before he has evidence.

---

## Phase 0 — Validate Demand Before Writing Any Code ($0, Week 1–2)

Goal: prove 15–20 property managers/landlords actually want this before touching Hugging Face.

1. **Landing page ($0)**: One page, free tier of Vercel/Netlify or even a static GitHub Pages site.
   - Headline: *"AI-Powered Maintenance Triage — Categorize tenant complaints and draft work orders in 2 seconds."*
   - 3 bullet value props (saves time, reduces missed emergencies like burst pipes, consistent professional replies).
   - CTA: "Join the Beta" → Google Form or Formspree (free) capturing email + "how do you currently manage maintenance requests?" (property management software, email, text, spreadsheet).
2. **Distribution ($0)**: Post in r/PropertyManagement, r/Landlord, BiggerPockets forums, local property manager Facebook groups, LinkedIn (search "property manager" + local area), and indie hacker communities (IndieHackers, Reddit r/SaaS).
3. **Direct outreach (free, just time)**: Since Imon has 20+ hrs/week, cold DM/email 30–50 small property management companies (2–20 units range — the underserved segment big PMS software ignores) asking one question: *"How do you currently triage maintenance requests, and would you pay $X/mo for an AI tool that auto-categorizes and drafts responses?"*
4. **Gate to pass before Phase 1**: 15–20 waitlist signups OR 5+ people saying "yes I'd pay" in direct conversations, with a rough sense of what they'd pay ($20–$100/mo range is typical for micro-SaaS targeting SMBs). If this gate fails after 2 weeks of real effort, pivot the *message* (try urgency-based framing, try a different sub-segment like vacation rentals/Airbnb hosts) before pivoting the niche entirely.

---

## Phase 1 — Build the Dataset ($0, Week 2–3, can overlap with Phase 0 outreach)

Goal: 1,000–5,000 clean (complaint → category + urgency + draft response) examples, since that's the sweet spot for QLoRA fine-tuning per the earlier cost analysis.

1. **Sourcing (all free)**:
   - Public datasets: search Hugging Face Datasets Hub and Kaggle for "customer complaints," "maintenance requests," "facilities management," "tenant complaints" — even loosely related sets can be reshaped.
   - Synthetic generation: use a free/cheap LLM (e.g., a free-tier hosted model or local Ollama model on his own machine — $0, uses his own hardware) to generate realistic synthetic maintenance complaints across categories (plumbing, electrical, HVAC, pest, structural, noise, appliance) and urgency levels (emergency/high/medium/low), then have it also generate the ideal categorized output + draft response. This is the standard "teacher model generates training data for a smaller fine-tuned model" pattern.
   - Real examples from Phase 0 outreach: if any property managers share sample complaint text (with permission, anonymized), fold these in — real-world text improves quality a lot.
2. **Format**: JSONL, one line per example:
   ```json
   {"input": "The kitchen sink has been leaking under the cabinet for two days...", "category": "Plumbing", "urgency": "High", "draft_response": "Thank you for reporting this..."}
   ```
3. **Cleaning/QA**: dedupe, balance categories (don't let "plumbing" dominate), spot-check 5–10% manually for quality since Imon has the software background to script validation (schema checks, length checks, category-label consistency).
4. **Output**: a versioned dataset repo, kept **private** on Hugging Face (free tier covers private repos) until ready to decide on the "sell the dataset separately" side-option later.

---

## Phase 2 — Fine-Tune ($2–$20 one-time, only after Phase 0 gate is passed)

This is the **first dollar spent** in the whole plan, and it's small and one-time (re-runs cost the same again if he improves the dataset later).

1. **Model choice**: start with a 7–8B open model (Mistral-7B or Llama-3.1-8B) — the documented "sweet spot" for QLoRA on a single consumer-class GPU.
2. **Method**: QLoRA (4-bit) — needs ~16–24GB VRAM, so a single rented Nvidia L4/A10G is enough (no need for expensive multi-GPU).
3. **Where**: Hugging Face AutoTrain (simplest, less code) or a custom Axolotl/PEFT script on a rented Hugging Face Space GPU or RunPod instance, pay-as-you-go at roughly $0.70–$1.00/hr.
4. **Estimated cost**: a 3–5k example dataset trains in ~2–3 hours → **$2–$10** for the first successful run. Budget up to $20 total to allow for one or two iteration/debug runs.
5. **Output**: a LoRA adapter, stored in a private Hugging Face model repo. Evaluate against a held-out set of ~100 examples (accuracy on category/urgency labels, human read-through of draft responses for tone/correctness) before deploying.

---

## Phase 3 — Deploy the "Scale to Zero" Architecture ($0 idle, pay-per-use only)

Reuse the architecture already outlined and validated as low-risk:

```
[Landing/Dashboard] → Next.js on Vercel (free tier)
        │
[Auth + Billing]     → Supabase (free tier) + Stripe (no monthly fee, 2.9%+$0.30/txn)
        │
[Inference]          → Hugging Face Inference Endpoint, "Scale to Zero" after 15 min idle
        │
[Fine-tuned model]   → Llama/Mistral 8B + LoRA adapter from Phase 2
```

1. **Dashboard**: simple upload-a-complaint-text or paste-email box → returns category, urgency, and a draft response. Later: email/API integration so property managers can forward emails directly (bigger differentiator, build after first paying customers, not before).
2. **Billing**: Stripe Checkout for a simple monthly plan (e.g., $29–$49/mo for up to N requests, overage billed per-call) — matches the $20-$100/mo willingness-to-pay range validated in Phase 0.
3. **Cost control**: Scale-to-zero means idle cost is $0; the endpoint only spins up (30–60s cold start) when a customer actually uses it, so early-stage costs track revenue almost exactly.
4. **Domain**: defer the ~$10/yr custom domain purchase until Phase 0's waitlist is real and he's ready to onboard beta users — keeps the "$0 until validated" rule intact; a vercel.app subdomain is fine for the beta.

---

## Phase 4 — Launch to the Waitlist & Get First Paying Customers

1. Email everyone from the Phase 0 waitlist: "Beta is live, here's early-bird pricing (e.g., 50% off for first 3 months) in exchange for feedback."
2. Aim for 5–10 paying beta customers before broad marketing. Use their feedback to fix the dataset/model (common misclassifications) — this is the only "maintenance" loop, and it's light (spot-fix dataset, re-run a cheap fine-tune).
3. Once stable with paying customers and positive feedback, expand distribution: SEO-optimized landing page content ("how to triage maintenance requests faster"), property management Facebook groups/forums, and referral incentives (a free month for referring another property manager).

---

## Phase 5 — Reuse the Pipeline for E-Commerce Support (Second Niche)

Once Property Management is either generating steady MRR or plateaus, reuse the exact same architecture for the already-discussed second niche (E-Commerce Support ticket triage: tag tickets, extract order numbers, draft policy-compliant replies). Only the dataset and fine-tune change — landing page, auth/billing, and scale-to-zero inference pattern are copy-paste. This is the "build once, template it" payoff of choosing a general architecture up front.

---

## Budget Summary (kept at $0 until Phase 0 gate passes)

| Phase | Cost | When |
|---|---|---|
| 0: Validation | $0 | Weeks 1–2 |
| 1: Dataset | $0 (own machine/free tiers) | Weeks 2–3 |
| 2: Fine-tuning | $2–$20 (one-time) | Only after Phase 0 gate passes |
| 3: Deploy | $0 idle / pay-per-use after launch | Week 4+ |
| Domain | ~$10/yr | Deferred to beta launch |
| Stripe | 2.9%+$0.30/txn | Only on real transactions |

**Total risked before any validated demand: $0.** Total to get to a working, billable MVP after validation: roughly $10–$30.

---

## Timeline (20+ hrs/week pace)

- **Weeks 1–2**: Phase 0 validation (landing page, outreach, waitlist).
- **Weeks 2–3**: Phase 1 dataset build (overlaps with ongoing outreach).
- **Week 3–4**: Phase 2 fine-tune + evaluate (only if gate passed).
- **Week 4–5**: Phase 3 build dashboard/auth/billing, deploy inference endpoint.
- **Week 5–6**: Phase 4 beta launch to waitlist, iterate on feedback.
- **Month 2–3+**: Grow to first paying customers, then start Phase 5 (e-commerce niche) in parallel once Property Management is stable.

## Success Metrics / Go-No-Go Gates

1. Phase 0 gate: 15–20 waitlist signups or 5+ verbal "I'd pay" commitments in 2 weeks.
2. Phase 2 gate: fine-tuned model hits acceptable accuracy on held-out category/urgency labels and drafts responses a human would send with light editing.
3. Phase 4 gate: 5–10 paying beta customers within first month of launch, <10% churn after the first billing cycle.

## Next Immediate Action

Build the Phase 0 landing page and waitlist form this week, and start direct outreach to 30–50 small property managers — nothing else in this plan should start until that validation signal comes back.
