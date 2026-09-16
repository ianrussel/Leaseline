# Leaseline maintenance-triage: the module's first real-product task

**Moved 2026-09-17** from `ait-lab/ai_training/trainings/task-leaseline-triage/` into
`firstproject/private/` so this task's code lives alongside the product it trains for, under
this repo's own version control, without being part of the deployed site (`private/` is listed
in `.vercelignore`). It still depends on the shared ait-lab fine-tuning pipeline
(`common.py`/`run.py`/`pipeline.py`/etc.) - that's genuinely external, shared infrastructure used
by many unrelated tasks there, so it stayed put; `prepare_data.py` here points back to it via an
absolute path. `config_leaseline.yaml` in this folder is a point-in-time **mirror** for private
record-keeping - the authoritative copy `pipeline.py`/`targets.py` actually run against still
lives at `ait-lab/ai_training/trainings/module/config_leaseline.yaml`. If you edit one, edit both
or they'll drift.

Every other task in this project (meaning: in the ait-lab fine-tuning pipeline) runs against a
public benchmark or research corpus
(unix/drafting, banking77, xlam function-calling, Server Fault tags, Tobi-Bueck support
tickets). This one is different: it's the training data for an actual small SaaS product
currently in beta (`personal/passiveincome/firstproject`, an AI maintenance-triage tool for
small property managers). See that project's `dataset/README.md` for the full generation
method and honest limitations - templated phrasing, formulaic reply openers, no real tenant
data yet, ~43% smaller than its own target size because a background diversification pass got
interrupted mid-run (860/2000 rows).

## Task shape: `task.type: extraction`

From a tenant's raw message, extract two closed-set fields - `category` (8 values) and
`urgency` (4 values) - and draft a reply. Same task type as `config_extraction.yaml`
(ticket type/queue/priority), reused with zero pipeline code changes: `common.field_accuracy`
grades `category`+`urgency` (both 100%-filled, closed-set, exactly the shape that task type was
built for); `draft_response` rides along in the training target so the model still learns to
produce it, but isn't graded - open-ended text would just score wrong against exact-match
field comparison, the same reasoning that kept free-text fields out of
`task-ticket-extraction`'s own `FIELDS` list.

~12% of source messages report more than one issue (the product's "multi-issue splitting"
landing-page feature). This task grades only the primary (first) issue; any others ride along
under `additional_issues` in the training target so the model keeps seeing the full shape, just
not as part of the objective gate metric. A cleaner multi-label treatment is a real follow-up,
not required to get a first useful adapter.

**Honesty note carried over from `config_extraction.yaml`'s own history:** `task.type:
extraction` had code but had never actually been run anywhere in this project before this task
(see `handover/README.md`'s "Still open" section, written before either config ran). Treat this
run as also exercising that code path for the first time - not as reusing something
proven-reliable elsewhere first.

## A real incident from building this, worth keeping here

The first attempt at `prepare_data.py` was run without checking for `FT_DATA_DIR` first.
`.bashrc` exports it globally (`/data/ait-lab/ft-data/module-data`) as a **shared** folder every
task's data lands in unless overridden - it silently overwrote `module-serverfault-tags`' live
`gold.jsonl`/`train_raw.jsonl` (10,714 real rows, an already-ACCEPTed, documented result).
Recovered byte-identical from `handover/module-serverfault-tags/data/` since that task was
already archived - but it would not have been recoverable if it hadn't been. **Always run this
task's scripts with an explicit override**, never the bare default:

```bash
export FT_DATA_DIR=/data/ait-lab/ft-data/leaseline-data
export FT_OUT_DIR=/data/ait-lab/ft-data/leaseline-runs
```

## Files

- `prepare_data.py` - reads `../../dataset/train.diverse.jsonl` + `eval.diverse.jsonl` directly
  (now a plain sibling two levels up, since this task moved in next to the product itself - no
  download, no corpus prep, the source project already did its own generation, diversification,
  and QA). Builds `gold.jsonl` (150 rows, all of the source project's held-out eval set) and
  `train_raw.jsonl` (860 rows).
- `config_leaseline.yaml` - **mirror only**, see the move note above. The run config:
  `Qwen/Qwen2.5-1.5B-Instruct`, no judge, no teacher (`targets.mode: none` - the labels are the
  source generator's own values).

## GPU sizing (the actual "which rented GPU" answer)

`Qwen2.5-1.5B-Instruct` QLoRA (4-bit) is far smaller than anything else this project has
trained - the 3B-scale configs elsewhere here already fit a **free Colab T4**  per
`module/README.md`. This task's base is half that size. A rented GPU is only needed because the
local machine's GPU (RTX 3050, 4GB) doesn't clear even that bar (see `MODEL_NOTES.md`'s "needs
more than a 4GB GPU comfortably" line) - not because the model itself is large. On RunPod, the
**cheapest available 16GB+ card** (RTX A4000/A5000 community-cloud tier, roughly $0.20-0.40/hr
at time of writing) is comfortably enough; there is no reason to rent anything in the
24GB-and-up tier this project's larger tasks needed. With 860 train rows, up to 3 epochs, 2
seeds, expect well under an hour of GPU time - a few dollars, not tens.

## How to run it

Local (CPU, already done as of this writing - see the two commands' output in this project's
chat history). `prepare_data.py` runs from its new home here; `targets.py` still runs from
inside the ait-lab checkout since that's where the shared pipeline scripts live:

```bash
export FT_DATA_DIR=/data/ait-lab/ft-data/leaseline-data
export FT_OUT_DIR=/data/ait-lab/ft-data/leaseline-runs

# from this folder (firstproject/private/task-leaseline-triage/):
python prepare_data.py

# then from the ait-lab checkout:
cd ~/projects/ait-lab/ai_training/trainings/module
python targets.py --config config_leaseline.yaml   # mode: none, passes train_raw through
#   review data-leaseline/gold.jsonl by hand (real product data, not a throwaway benchmark)
#   set confirmed: true in config_leaseline.yaml (the ait-lab copy - keep the mirror here in sync)
```

Then on a rented GPU (see `~/projects/ait-lab/ai_training/trainings/module/reference/RUNPOD.md`
for the general RunPod workflow, and `module_colab_leaseline.ipynb` in this folder for a
ready-to-run notebook using it - its own instructions scp this folder's files up to the pod):

```bash
# still from ~/projects/ait-lab/ai_training/trainings/module:
python pipeline.py --config config_leaseline.yaml
```

## What a result here would mean

Judge-free, calibration-free, same as every `extraction`/`structured`/`classification` task in
this project - `mean_field_accuracy` (category+urgency) is computed directly, no LLM opinion
involved. An ACCEPT would mean the fine-tuned adapter reliably out-classifies the base model on
the two fields that actually drive the product's triage decision. It says nothing objective
about `draft_response` quality (never graded here) - that still wants a human read-through
before shipping, same caveat `dataset/README.md` already carries.
