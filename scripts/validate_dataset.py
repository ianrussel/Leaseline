#!/usr/bin/env python3
"""
QA pass for the generated dataset — run this after every regeneration
and before uploading anything to Hugging Face.

Checks:
  - every row has the required fields with the right types
  - category/urgency values are in the taxonomy
  - draft_response is non-empty
  - no duplicate "input" text, within a file or across train/eval
    (a duplicate across splits is train/eval leakage)
Then prints category and urgency distribution so an imbalance is
visible before it becomes a training problem.

Usage:
  python3 scripts/validate_dataset.py dataset/train.jsonl dataset/eval.jsonl
"""
import json
import sys
from collections import Counter
from pathlib import Path

CATEGORIES = {"Plumbing", "Electrical", "HVAC", "Appliance", "Pest", "Structural", "Noise", "General"}
URGENCIES = {"Emergency", "High", "Medium", "Low"}


def load(path):
    rows = []
    with open(path) as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"  ERROR {path}:{i} invalid JSON: {e}")
    return rows


def validate_rows(path, rows, errors):
    seen_here = set()
    for i, row in enumerate(rows, 1):
        loc = f"{path}:{i}"
        if not isinstance(row.get("input"), str) or not row["input"].strip():
            errors.append(f"{loc} missing/empty 'input'")
            continue
        if row["input"] in seen_here:
            errors.append(f"{loc} duplicate 'input' within file")
        seen_here.add(row["input"])

        issues = row.get("issues")
        if not isinstance(issues, list) or not issues:
            errors.append(f"{loc} missing/empty 'issues' list")
        else:
            for issue in issues:
                if issue.get("category") not in CATEGORIES:
                    errors.append(f"{loc} unknown category: {issue.get('category')!r}")
                if issue.get("urgency") not in URGENCIES:
                    errors.append(f"{loc} unknown urgency: {issue.get('urgency')!r}")

        if not isinstance(row.get("draft_response"), str) or not row["draft_response"].strip():
            errors.append(f"{loc} missing/empty 'draft_response'")
    return seen_here


def main():
    paths = sys.argv[1:] or ["dataset/train.jsonl", "dataset/eval.jsonl"]
    errors = []
    all_inputs = {}
    cat_counts = Counter()
    urg_counts = Counter()
    multi_issue = 0
    total_rows = 0

    for path in paths:
        if not Path(path).exists():
            errors.append(f"{path} does not exist")
            continue
        rows = load(path)
        total_rows += len(rows)
        inputs_here = validate_rows(path, rows, errors)

        for text in inputs_here:
            if text in all_inputs:
                errors.append(f"'{text[:60]}...' appears in both {all_inputs[text]} and {path} (leakage)")
            all_inputs[text] = path

        for row in rows:
            issues = row.get("issues") or []
            if len(issues) > 1:
                multi_issue += 1
            for issue in issues:
                cat_counts[issue.get("category")] += 1
                urg_counts[issue.get("urgency")] += 1

    print(f"checked {total_rows} rows across {len(paths)} file(s)\n")

    print("category distribution:")
    for cat in sorted(CATEGORIES):
        print(f"  {cat:<12} {cat_counts.get(cat, 0)}")

    print("\nurgency distribution:")
    for urg in ["Emergency", "High", "Medium", "Low"]:
        print(f"  {urg:<12} {urg_counts.get(urg, 0)}")

    print(f"\nmulti-issue messages: {multi_issue} ({multi_issue / total_rows:.1%} of rows)" if total_rows else "")

    if errors:
        print(f"\n{len(errors)} problem(s) found:")
        for e in errors[:50]:
            print(f"  - {e}")
        if len(errors) > 50:
            print(f"  ... and {len(errors) - 50} more")
        sys.exit(1)

    print("\nno schema errors, no duplicates, no train/eval leakage.")


if __name__ == "__main__":
    main()
