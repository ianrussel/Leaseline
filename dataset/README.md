# Leaseline maintenance-triage dataset (v0, synthetic)

Training data for fine-tuning Leaseline's category + urgency + draft-reply
model. This is a **first-pass, fully synthetic** dataset — see
[Limitations](#limitations) before fine-tuning on it as-is.

## Files

| File | Rows | Purpose |
|---|---|---|
| `train.jsonl` | 2,000 | templated base set (robotic phrasing — see "How this was built") |
| `eval.jsonl` | 150 | templated held-out eval set, same caveat |
| `train.diverse.jsonl` | 2,000 | **use this one for fine-tuning** — same labels, LLM-paraphrased text |
| `eval.diverse.jsonl` | 150 | **use this one for eval** — same pairing as above |
| `real_examples.jsonl` | 0 (template) | append real tenant messages here as outreach turns them up |

Regenerate the templated base with `python3 scripts/generate_dataset.py --train 2000 --eval 150`
(deterministic — same `--seed` always reproduces the same file), then re-run the diversification
pass below to rebuild the `.diverse.jsonl` files. Validate any regeneration with
`python3 scripts/validate_dataset.py <file> [<file> ...]`.

## Schema

```json
{
  "input": "its unit 8A the sink under the kitchen has been leaking for 2 days ...",
  "issues": [
    {"category": "Plumbing", "urgency": "High"}
  ],
  "draft_response": "Thanks for letting us know — we're prioritizing this ..."
}
```

`issues` is a list because one message can report more than one problem
(~12% of rows do) — the model's job is to split it into separately
triaged sub-issues, the same behavior shown on the landing page demo,
not just assign a single label per message.

**Taxonomy** — fixed, matches the categories/urgency badges already used
on the landing page (`index.html`); don't add a new label here without
updating both places:

- Categories: `Plumbing`, `Electrical`, `HVAC`, `Appliance`, `Pest`, `Structural`, `Noise`, `General`
- Urgency: `Emergency`, `High`, `Medium`, `Low`

**Why "Emergency" and not "Urgent" for the top tier:** tenants already overuse "urgent"/"ASAP" as
filler for objectively low-severity issues (confirmed empirically — see
`leaseline-training`'s `review_gold.py` scan, where ~20% of `gold.jsonl` rows use "ASAP"/"pronto"
language on issues correctly labeled Low/Medium). Naming the top label "Urgent" would collide with
that habit and make the model's output look like it's just echoing tenant tone rather than making
an independent severity call. "Emergency" is a narrower, objective bucket — immediate safety/
property-damage risk (see the definitions above) — and matches the term property-management
software and landlord-tenant law already use for this exact tier, rather than inventing new
vocabulary property managers would need to re-learn.

## How this was built

Templated generation (`scripts/generate_dataset.py`), not an LLM API call:
a bank of realistic issue phrases per category (each pre-labeled with the
urgency a property manager would actually give it), combined with
randomized unit numbers, room/floor fills, greetings, sign-offs, light
"typed in a hurry" noise, and a 12% chance of bundling two issues into one
message. Deterministic and free to regenerate or extend — add a line to
`ISSUE_BANK` in the script and every downstream tool picks it up.

Reply drafts are templated per urgency tier, not written per-example.

**Diversification pass** (`scripts/diversify_dataset.py`, done — all 2,150 rows across both
splits): a local Ollama model (`qwen2.5:3b-instruct`) rewrites each `input` message and
`draft_response` in a different natural voice, while the template-assigned `category`/`urgency`
labels are frozen and never touched by the model — it paraphrases, it never re-labels. A safety
guard rejects and falls back to the original text if a rewrite is an empty/exact-echo/wildly
different-length output, or if it invents escalation language ("immediate", "asap", etc.) on a
Low/Medium-urgency row that shouldn't have it — 88/2,000 train rows (4.4%) and 7/150 eval rows
(4.7%) fell back this way, which is expected and correct, not a failure. Per-row audit trail
(original vs. rewritten, which fell back) is in `train.diverse.audit.jsonl` /
`eval.diverse.audit.jsonl` — spot-check before trusting a re-run.

## Manual reinforcement rows (train-only, hand-authored, not from the generator)

`train.diverse.jsonl` has 8 rows appended by hand after the generator/diversify pipeline ran
(2026-09-17) - not reproducible by re-running `generate_dataset.py`/`diversify_dataset.py`, and
deliberately not counted in "2,000 template train rows" above. Same "train-only, never gold"
precedent as `real_examples.jsonl` - `eval.diverse.jsonl`/`gold.jsonl` are untouched.

Why: the first real fine-tuning run (`leaseline-training/runs/seed0`) scored 88% mean field
accuracy overall (ACCEPT), but reading the actual misses - not just the aggregate number - found
2 of 3 true-Emergency rows it got wrong shared a specific pattern: casual/deadpan tenant phrasing
("ain't locking right anymore lmao") on a genuinely dangerous issue (a broken exterior lock -
explicitly an Emergency example in `docs/knowledge-base.md`). The diversify pass's safety guard
only blocks *inventing* escalation language on Low/Medium rows - nothing guards the reverse, a
true Emergency getting paraphrased into minimizing, casual language. That's a plausible reason
the model leans on tone as a shortcut over content. These 8 rows pair casual/minimizing phrasing
("no biggie probably lol", "prob nothing but thought i'd mention it") with genuinely dangerous
content (broken locks, gas smell, a sparking outlet) to push against that shortcut directly.

`ISSUE_BANK` in `generate_dataset.py` also gained 2 new phrase entries (a second Structural
broken-lock phrasing, a gas-near-water-heater Appliance phrasing) so a *future* full regeneration
carries this signal forward too - but a full regeneration wasn't run now, since that would
require re-running the diversify pass and would reset `eval.diverse.jsonl`, invalidating the
already-reviewed `gold.jsonl` labels (see `leaseline-training`'s task README, "Reviewing
gold.jsonl") for no benefit - these 8 rows exist for training signal, not eval.

## Limitations (read before fine-tuning)

- **Templated files are scaffolding, not the training set.** `train.jsonl`/`eval.jsonl` are
  useful for inspecting the taxonomy or regenerating from scratch, but the formulaic phrasing
  described above is real — always fine-tune on the `.diverse.jsonl` files instead.
- **Diversified phrasing still isn't organic.** The rewrite pass adds real variation, but a
  3B local model paraphrasing templates is not the same as actual tenant messages — expect
  typos, dialect, sarcasm, and context this process still doesn't produce. Real examples
  (below) matter more than another diversification pass.
- **No real tenant data yet.** `real_examples.jsonl` is the drop point
  for actual messages collected during Phase 0 outreach (anonymize unit
  numbers/names before adding). Real examples matter more than more
  synthetic volume — prioritize folding these in over generating more
  templated rows.
- **Urgency judgment calls are the author's, not a property manager's.**
  Worth a sanity-check pass with an actual small landlord/PM before
  trusting the labels for anything beyond a v0 fine-tune.

## Related public datasets (not yet merged in)

Structurally similar (categorized + urgency-labeled support text), useful
as inspiration for phrasing diversity or as an additional training
signal, though none are property-management-specific:

- [Ataur77/ecommerce-customer-support](https://huggingface.co/datasets/Ataur77/ecommerce-customer-support) — categorized complaints with a `Low/Medium/Immediate` urgency label.
- [Tobi-Bueck/customer-support-tickets](https://huggingface.co/datasets/Tobi-Bueck/customer-support-tickets) — larger multi-category support-ticket set.
- [Kaggle: Customer Support Ticket Dataset](https://www.kaggle.com/datasets/suraj520/customer-support-ticket-dataset) — similar shape, different domain.

## Publishing to Hugging Face (next step, Phase 2)

```bash
pip install -U huggingface_hub
huggingface-cli login   # needs a free HF account + access token
huggingface-cli repo create leaseline-triage-v0 --type dataset --private
huggingface-cli upload leaseline-triage-v0 dataset/ . --repo-type dataset
```

Keep it **private** until the taxonomy and reply tone are locked in —
easy to iterate on a private repo, harder to un-publish a public one.
