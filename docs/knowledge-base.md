# Faultline — Knowledge Base

*Internal source document for a customer-facing RAG chatbot. Update this
file whenever the product, pricing, or roadmap changes — a chatbot built
on it is only as accurate as what's written here. "Faultline" is a
working name pending a possible rename (Leaseline is the front-runner);
find-and-replace this doc when that's decided.*

---

## 1. What is Faultline?

Faultline is an AI maintenance-triage tool for small property managers
and landlords. It reads incoming tenant maintenance requests — texts,
emails, whatever's already landing in an inbox — and automatically:

1. Identifies what's actually wrong (the **category**),
2. Judges how urgent it is (the **urgency**),
3. Drafts a professional reply the property manager can send as-is, edit,
   or escalate to a vendor.

It does not auto-send anything on its own. A person reviews and approves
every draft before it goes out.

**Who it's for:** independent landlords and small property management
companies (roughly 2–200 units) who currently triage maintenance
requests by hand — reading texts/emails, deciding what's urgent, and
typing replies themselves.

**Who it's not for:** large enterprise property management firms with
existing dedicated maintenance-coordination software and staff — Faultline
is built for the smaller operators those tools tend to ignore.

**Current stage:** in active development, not yet open to beta signups.
The AI triage engine is still being built and tested; there is no live
waitlist form or product access right now. It is an independent,
solo-developer-built project, not a funded company with a large team.
Anyone interested in being notified when beta access opens should email
the address in Section 10 — that's the only way to get on the radar for
early access at this stage.

---

## 2. How it works

**Step 1 — Forward it in.** Paste a tenant's message, forward the email,
or (in a future version) connect an inbox — whatever's already landing
gets routed into Faultline as-is. No special formatting required.

**Step 2 — Triaged in about 2 seconds.** Faultline returns a category,
an urgency level, and a drafted reply. If a single message reports more
than one problem, it splits them into separate, individually-triaged
sub-issues instead of forcing everything into one label.

**Step 3 — You approve, it's sent.** The property manager can send the
draft as-is, edit it first, or escalate directly to a vendor. Nothing
is sent automatically without a person's action.

---

## 3. Category taxonomy

Faultline classifies each reported issue into one of eight categories:

| Category | Covers |
|---|---|
| Plumbing | Leaks, clogs, water heaters, low/no water pressure, running toilets |
| Electrical | Outlets, breakers, lighting, wiring issues, sparking/burning smells |
| HVAC | Heating, air conditioning, thermostats, vents, furnaces |
| Appliance | Stoves, fridges, dishwashers, washers/dryers, garbage disposals |
| Pest | Insects, rodents, wasp nests, general infestation reports |
| Structural | Doors, windows, walls, ceilings, railings, locks |
| Noise | Neighbor noise, unexplained building sounds, alarms |
| General | Anything that doesn't fit the above — mailboxes, gates, intercoms, etc. |

A single tenant message can contain issues from more than one category
(e.g. a leak *and* a broken light) — Faultline reports each one
separately rather than picking just one label for the whole message.

---

## 4. Urgency levels

Faultline assigns one of four urgency levels **per issue**, not per
message:

- **Emergency** — immediate safety or property-damage risk: gas smells,
  active flooding/burst pipes, no heat in freezing weather, sparking
  outlets, broken exterior locks. Faultline recommends same-day
  dispatch.
- **High** — significant but not immediately dangerous: no hot water,
  a fridge that's stopped cooling, a growing ceiling water stain.
  Recommended response window: within 24 hours.
- **Medium** — needs attention but can wait a few days: a running
  toilet, a jammed disposal, a loose railing, minor pest sightings.
- **Low** — routine, can be handled on the next regular visit: a
  burned-out hallway bulb, a dripping outdoor spigot, general noise
  complaints.

Urgency is a *recommendation* based on the wording of the message. The
property manager always makes the final call and can override it before
sending or dispatching.

---

## 5. Pricing

**Right now:** nothing to pay — there's no live product or beta access
to buy yet (see Section 1). The pricing below is the plan for once beta
opens, not something available today.

**During the beta (once it opens):** free. No credit card required to
join.

**Planned pricing after beta** (subject to change as the product
develops — always quote current pricing from the live site, not this
document, if there's ever a mismatch): plans starting at $29/month for
up to 100 triaged tickets, with no per-unit fees and no setup cost.

**Beta users:** anyone who joins during the beta period will lock in
that introductory ("founder") pricing for as long as they stay
subscribed after the beta ends.

There is no long-term contract planned. Cancellation terms beyond that
haven't been formally published yet since the product hasn't launched.

---

## 6. Getting started

There's no signup flow to walk through right now — the product is still
in development and the waitlist form on the landing page is currently
off (replaced with an "in development" status message). The only
available step today is emailing the address in Section 10 to ask to be
notified when beta access opens. Once beta does open, the plan is: join
via a short form (name, email, roughly how many units managed, and how
maintenance requests are currently handled), requests reviewed in the
order they arrive, then paste or forward a maintenance message to see it
triaged — no integration or software installation required to try it.

---

## 7. Data handling and privacy

Faultline processes the text of maintenance messages submitted to it
(by paste, forward, or future inbox connection) in order to generate the
category, urgency, and draft reply. That text, along with the resulting
tickets, is stored so the property manager can review their history.

**Being direct about what this is and isn't, since prospects will ask:**

- This is an independent, beta-stage project — not a large company with
  a dedicated security or compliance team.
- There is currently no third-party security certification (e.g. SOC 2)
  and no formal compliance program (e.g. GDPR/CCPA processes) in place.
  If that's a hard requirement for a prospective customer, beta is not
  yet the right stage for them, and they should say so rather than
  assume compliance that hasn't been established.
- Property managers should avoid pasting highly sensitive personal data
  (SSNs, financial account numbers, etc.) into a maintenance request —
  none of that is needed to triage a plumbing or electrical issue.
- Questions about data handling should go to the contact email in
  Section 10 rather than being answered by assumption.

---

## 8. Integrations and roadmap

**Available today:** paste-in or forward-in of a maintenance message
through the Faultline dashboard.

**Not available yet — do not claim these as current features:**

- Direct inbox auto-forwarding/connection
- Integration with property management platforms (e.g. Buildium,
  AppFolio, Propertyware, or similar)
- A mobile app
- SMS/text-message auto-ingestion
- Multi-user team accounts / role-based permissions

These are reasonable directions the product may grow into, but as of
this document's writing none of them exist. If a prospect asks about a
specific integration not listed here as available, the honest answer is
"not yet — it's not built" rather than a vague "yes" or invented
timeline.

---

## 9. Known limitations

- The AI's category and urgency calls can be wrong, especially on
  ambiguous or unusually-worded messages. That's why every draft goes
  through a human review step before sending — it's a drafting
  assistant, not an autonomous decision-maker.
- It currently handles English-language text messages; it has not been
  tested on other languages.
- It's a beta product built and maintained by one developer — support
  response times reflect that (see Section 10), not a staffed support
  team.

---

## 10. Support and contact

For account issues, billing questions, feedback, or anything not
covered in this document: **ianrussel537@gmail.com**

Because this is a solo-developer beta project, support is not staffed
24/7 — expect a response within a few business days, not instantly.

---

## 11. Frequently asked questions

**Is this a real, existing company?**
Faultline is a real product being actively built by an independent
software developer — currently in development, not yet in beta. It is
not a large company or a funded startup with a team.

**Does Faultline replace my property management software?**
No. It's a focused tool for one job — triaging maintenance requests and
drafting replies. It doesn't handle rent collection, leasing, accounting,
or the other things a full property management platform does.

**What happens if the AI gets the category or urgency wrong?**
Every draft is reviewed by the property manager before anything is sent
or dispatched — nothing goes out automatically. If a category or
urgency looks wrong, the property manager can correct it before acting
on it.

**Can I edit the drafted reply before it's sent?**
Yes — the draft can be sent as-is, edited, or the issue can be escalated
directly to a vendor instead of sending a tenant reply at all.

**Do you integrate with [specific property management software]?**
Not currently. See Section 8 for what's available today versus what's
on the roadmap.

**How much does it cost?**
Nothing yet — there's no live product or beta to pay for right now.
See Section 5 for the planned pricing once beta opens; always confirm
current pricing on the live site since plans can change before launch.

**Is there a contract or minimum commitment?**
Nothing to commit to yet since there's no live product. No long-term
contract is planned; cancellation terms will be published once beta
opens.

**Is my tenant data secure?**
See Section 7 for a direct, non-oversold answer — there is currently no
formal security certification, and prospects with strict compliance
requirements should treat beta as not yet meeting that bar.

**How is "urgency" decided?**
See Section 4 — urgency is assigned per issue based on the wording of
the message (e.g. "gas smell" reads as Emergency, "hallway light's been
out" reads as Low), and the property manager can always override it.

**Can one message report more than one issue?**
Yes — Faultline splits a message that reports multiple problems into
separate tickets, each triaged on its own (see Section 2 and Section 3).

**How do I manage more than one property?**
There is no dedicated multi-property management view in the beta yet;
each ticket is tracked individually regardless of how many properties a
user manages.

**How do I sign up?**
There's no signup available right now — the product is in development
and the waitlist form is currently off (see Section 6). Email the
address in Section 10 to ask to be notified when beta access opens.

**Who do I contact with a question this document doesn't answer?**
ianrussel537@gmail.com (Section 10). Don't guess or invent an answer —
say the information isn't available yet and offer to have the developer
follow up directly.
