#!/usr/bin/env python3
"""Pulls admin-approved real tenant tickets out of Supabase and into the training data files.

The admin review flow (admin.html -> api/admin-update-ticket.js) only ever updates the `tickets`
table in Supabase - a Vercel serverless function has no filesystem access to this git checkout,
so it can't write dataset/real_examples.jsonl itself. This script is the other half: run it
locally whenever admin.html has new approvals to pull down.

Two destinations, on purpose not the same one:
  - training_status='added_to_train' -> appended directly to dataset/real_examples.jsonl
    (train-only, per that file's own long-standing "never gold" rule - see prepare_data.py in
    leaseline-training and dataset/README.md).
  - training_status='added_to_gold'  -> written to dataset/gold_candidates_to_review.jsonl
    instead of eval.diverse.jsonl directly. gold.jsonl is a fixed benchmark every training run is
    compared against (see leaseline-training's README, "Reviewing gold.jsonl") - folding a new
    row in changes what future runs are scored against, so that step stays a deliberate manual
    edit to eval.diverse.jsonl, not something this script does automatically. This just collects
    the candidates in one place so you're not hunting through the tickets table for them.

Idempotent: only fetches rows where exported_at is still null, and sets it immediately after a
successful write - safe to re-run on a cron/whenever, never double-appends.

Usage:
    export SUPABASE_URL=https://xxxx.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=eyJ...    # the SECRET key - same one api/*.js uses server-side
    python3 scripts/export_training_candidates.py
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

REAL_EXAMPLES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dataset", "real_examples.jsonl")
GOLD_CANDIDATES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dataset", "gold_candidates_to_review.jsonl")


def api_request(path, method="GET", body=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal" if method == "PATCH" else "",
    }
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def fetch_unexported(training_status):
    path = (
        f"tickets?training_status=eq.{training_status}&exported_at=is.null"
        f"&select=id,raw_message,category,urgency,draft_response"
    )
    return api_request(path)


def mark_exported(ticket_id):
    api_request(f"tickets?id=eq.{ticket_id}", method="PATCH", body={"exported_at": datetime.now(timezone.utc).isoformat()})


def to_dataset_row(ticket):
    return {
        "input": ticket["raw_message"],
        "issues": [{"category": ticket["category"], "urgency": ticket["urgency"]}],
        "draft_response": ticket["draft_response"],
    }


def export_rows(training_status, out_path, label):
    rows = fetch_unexported(training_status)
    if not rows:
        print(f"[export] no new '{training_status}' rows")
        return 0

    with open(out_path, "a") as f:
        for ticket in rows:
            f.write(json.dumps(to_dataset_row(ticket)) + "\n")
            mark_exported(ticket["id"])

    print(f"[export] wrote {len(rows)} row(s) to {out_path} ({label})")
    return len(rows)


def main():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise SystemExit(
            "[export] set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the secret key, same one "
            "api/*.js uses server-side) before running this."
        )

    train_count = export_rows("added_to_train", REAL_EXAMPLES_PATH, "train-only")
    gold_count = export_rows("added_to_gold", GOLD_CANDIDATES_PATH, "needs manual review before eval.diverse.jsonl")

    if gold_count:
        print(
            f"[export] {gold_count} row(s) waiting in {GOLD_CANDIDATES_PATH} - "
            f"these are NOT in eval.diverse.jsonl yet. Review each by hand and add it there "
            f"yourself (see leaseline-training's README, 'Reviewing gold.jsonl'), then re-run "
            f"leaseline-training/private/task-leaseline-triage/prepare_data.py."
        )
    if train_count:
        print(
            f"[export] {train_count} row(s) added to real_examples.jsonl - re-run "
            f"leaseline-training's prepare_data.py to fold them into data/train.jsonl."
        )
    if not train_count and not gold_count:
        print("[export] nothing new to export.")


if __name__ == "__main__":
    main()
