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
