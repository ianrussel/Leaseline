"""Build the Leaseline maintenance-triage dataset (task.type: extraction) - a real product's
data, not a public benchmark, unlike every other task in this project. Source: the synthetic
(and partially LLM-diversified) dataset built for github.com-free local project
`personal/passiveincome/firstproject` (a solo-developer property-management SaaS beta) - see
that project's `dataset/README.md` for the full generation method and honest limitations
(templated phrasing, formulaic reply openers, no real tenant data yet).

Fields extracted per message: `category` (8 values: Plumbing, Electrical, HVAC, Appliance, Pest,
Structural, Noise, General) and `urgency` (4 values: Emergency, High, Medium, Low) - both
closed-set and 100%-filled by construction (the source generator assigns them), same
100%-fill-rate discipline as task-ticket-extraction's field selection. `draft_response` rides
along in the training target (the model should still learn to produce it) but is deliberately
NOT one of the graded `fields` - it's open-ended text, and field_accuracy's exact-match scoring
would just call it wrong nearly every time, corrupting the metric the same way including it in
task-ticket-extraction's FIELDS would have. ~12% of source rows report more than one issue in
one message (the project's landing-page "multi-issue splitting" feature) - this task grades only
the PRIMARY (first) issue's category/urgency, same simplification task-ticket-extraction would
face if a ticket could belong to two queues at once; the training target still carries any
remaining issues under `additional_issues` so the model keeps seeing the full shape, it's just
not part of the objective gate metric.

Moved into firstproject/private/ (2026-09-17) so this task's own code lives with the product it
serves and isn't part of the deployed site (see ../../.vercelignore). It still plugs into the
shared ait-lab fine-tuning pipeline (common.py, run.py, pipeline.py, gate.py, etc.) - that pipeline
is genuinely external/shared infrastructure used by many unrelated tasks there, so it was not
copied in here; the absolute-path references below point back to it. If that checkout ever moves,
update AIT_LAB_MODULE_DIR below.

Run this script from anywhere (it no longer needs to sit next to module/ - CPU is fine, no
download, just reads local files):
    python prepare_data.py
Writes gold.jsonl + train_raw.jsonl to wherever config_leaseline.yaml's data resolves to (see the
FT_DATA_DIR safety note in that config - always override it, never run against the shared default).
targets.mode: none - the labels are the source generator's own values (template-assigned, then
partially paraphrased by a local LLM under a frozen-label guard - see that project's
scripts/diversify_dataset.py), no teacher rewrite needed here, same bring-your-own shape as
task-ticket-extraction.
"""

import argparse
import json
import os
import random
import sys

# External, shared pipeline - not part of this project, not copied in. See module note above.
AIT_LAB_MODULE_DIR = os.path.expanduser("~/projects/ait-lab/ai_training/trainings/module")
sys.path.insert(0, AIT_LAB_MODULE_DIR)
import common as c

# The source project's own dataset - now a sibling two levels up from this file's new home
# (firstproject/private/task-leaseline-triage/prepare_data.py -> firstproject/dataset).
DEFAULT_SOURCE_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "dataset")

FIELDS = ["category", "urgency"]   # graded fields - both closed-set, 100% filled by construction
CATEGORIES = ["Plumbing", "Electrical", "HVAC", "Appliance", "Pest", "Structural", "Noise", "General"]
URGENCIES = ["Emergency", "High", "Medium", "Low"]

SEED = 0
N_GOLD = 150   # all of eval.diverse.jsonl - already held out by the source project, never re-split here

INSTRUCTION = (
    "You are Leaseline, an AI maintenance-triage assistant for property managers. Read the "
    "tenant's message and identify the primary issue's category and urgency, and draft a short "
    "reply. Categories: Plumbing, Electrical, HVAC, Appliance, Pest, Structural, Noise, General. "
    "Urgency: Emergency, High, Medium, Low. Reply with ONLY a single JSON object, no prose, no "
    "markdown fences - e.g. {\"category\": \"Plumbing\", \"urgency\": \"High\", "
    "\"draft_response\": \"...\"}."
)


def to_messages(text, target=None):
    msgs = [{"role": "system", "content": INSTRUCTION}, {"role": "user", "content": text}]
    if target is not None:
        msgs.append({"role": "assistant", "content": json.dumps(target)})
    return msgs


def build_target(row):
    issues = row["issues"]
    primary, rest = issues[0], issues[1:]
    target = {
        "category": primary["category"],
        "urgency": primary["urgency"],
        "draft_response": row["draft_response"],
    }
    if rest:
        target["additional_issues"] = rest
    return target


def load_rows(path):
    rows = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def main():
    # Points at the ait-lab checkout's copy - the one `pipeline.py`/`targets.py` actually run
    # against from within trainings/module/. config_leaseline.yaml sitting alongside this script
    # is a point-in-time mirror for private record-keeping only; if the two ever drift, the
    # ait-lab copy is authoritative. Override with --config to use the local mirror instead.
    default_cfg = os.path.join(AIT_LAB_MODULE_DIR, "config_leaseline.yaml")
    ap = c.config_arg()
    ap.set_defaults(config=default_cfg)
    ap.add_argument("--source-dir", default=DEFAULT_SOURCE_DIR,
                    help="Leaseline project's dataset/ folder (train.diverse.jsonl + eval.diverse.jsonl)")
    args = ap.parse_args()
    cfg = c.load_config(args.config)
    out = c.data_dir(cfg)
    random.seed(SEED)

    train_src = os.path.join(args.source_dir, "train.diverse.jsonl")
    gold_src = os.path.join(args.source_dir, "eval.diverse.jsonl")
    for p in (train_src, gold_src):
        if not os.path.exists(p):
            raise SystemExit(f"[prepare] missing source file: {p} - is --source-dir correct?")

    train_source_rows = load_rows(train_src)
    gold_source_rows = load_rows(gold_src)
    print(f"[prepare] loaded {len(train_source_rows)} train rows from {train_src}")
    print(f"[prepare] loaded {len(gold_source_rows)} gold rows from {gold_src}")
    if len(train_source_rows) < 2000:
        print(f"[prepare] NOTE: source train file has {len(train_source_rows)} rows, not the "
             f"full 2000 the source project generated - its diversification pass was "
             f"interrupted mid-run (see that project's chat history / TRAINING-LOG equivalent). "
             f"Using what's there; this is a real, usable v0 training set, just smaller than "
             f"the source project's full target.")

    # sanity: every row's fields are in the known closed sets before anything gets written
    bad = 0
    for r in train_source_rows + gold_source_rows:
        for issue in r["issues"]:
            if issue["category"] not in CATEGORIES or issue["urgency"] not in URGENCIES:
                bad += 1
    if bad:
        raise SystemExit(f"[prepare] {bad} issue(s) outside the known category/urgency sets - "
                         f"fix the source data before training on it, don't silently drop them")

    gold_rows = gold_source_rows[:N_GOLD]
    gold = []
    for r in gold_rows:
        target = build_target(r)
        record = {k: target[k] for k in FIELDS}
        gold.append({
            "messages": to_messages(r["input"]),
            "target_record": record,
            "fields": FIELDS,
            "full_target": target,   # kept for human review / future non-gated metrics; not read by field_accuracy
        })

    train_raw = [{"messages": to_messages(r["input"], build_target(r))} for r in train_source_rows]

    c.write_jsonl(c.data_path(cfg, "gold"), gold)
    c.write_jsonl(c.data_path(cfg, "train_raw"), train_raw)

    print(f"[prepare] wrote gold={len(gold)}, train_raw={len(train_raw)} -> {out}")
    print(f"[prepare] next: cd {AIT_LAB_MODULE_DIR} && python targets.py --config "
         f"config_leaseline.yaml (mode: none passes train_raw through unchanged), review "
         f"gold.jsonl by hand, set confirmed: true, run pipeline.py")


if __name__ == "__main__":
    main()
