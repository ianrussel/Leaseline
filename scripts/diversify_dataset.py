#!/usr/bin/env python3
"""
Diversification pass — rewrites `input` and `draft_response` text using
a local Ollama model, while the template-assigned `issues` (category +
urgency) stay frozen as ground truth. The model only paraphrases; it
never re-labels. This is what turns the templated v0 dataset into
something with natural language variation, without sacrificing the
label reliability that came from generating it with fixed templates
(see dataset/README.md for why the base set was built that way).

Requires Ollama running locally with the model pulled:
  ollama pull qwen2.5:3b-instruct

Usage:
  python3 scripts/diversify_dataset.py dataset/train.jsonl dataset/train.diverse.jsonl
  python3 scripts/diversify_dataset.py dataset/eval.jsonl dataset/eval.diverse.jsonl [--limit 20]

Writes <out>.audit.jsonl alongside the output — original vs. rewritten
text for every row, plus which rows fell back to the original because
the model's output looked unsafe to use. Spot-check the audit file
before trusting a run.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen2.5:3b-instruct"

MESSAGE_PROMPT = """Rewrite the following tenant maintenance complaint in a different, natural voice. Vary the wording and tone, but do NOT add, remove, or change any factual detail — keep the same issue(s), the same apparent urgency, and the same unit number if one is mentioned. Casual is fine: lowercase, imperfect grammar, like a real text message. Output ONLY the rewritten message, nothing else, no quotes around it.

Original message: {text}

Rewritten message:"""

REPLY_PROMPT = """Rewrite the following property manager's reply to a tenant in a different, natural professional voice. Vary the wording and sentence structure, but do NOT change what it promises or its urgency framing. Output ONLY the rewritten reply, nothing else, no quotes around it.

Original reply: {text}

Rewritten reply:"""


def call_ollama(prompt, temperature=0.8, max_retries=2, timeout=60):
    payload = json.dumps({
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": temperature},
    }).encode()
    req = urllib.request.Request(OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"})
    last_err = None
    for attempt in range(max_retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read())
                return data.get("response", "").strip()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last_err = e
            time.sleep(2)
    raise RuntimeError(f"Ollama call failed after retries: {last_err}")


def clean(text):
    text = text.strip()
    if len(text) >= 2 and text[0] == '"' and text[-1] == '"':
        text = text[1:-1].strip()
    for prefix in ("Rewritten message:", "Rewritten reply:"):
        if text.startswith(prefix):
            text = text[len(prefix):].strip()
    return text


URGENCY_RANK = {"Low": 0, "Medium": 1, "High": 2, "Emergency": 3}
# Words that imply more urgency than they should on a Low/Medium ticket.
# Small models asked to "keep the same urgency framing" drift toward
# these anyway — caught here rather than trusted to the prompt alone.
ESCALATION_WORDS = ["immediate", "immediately", "urgent", "urgently",
                     "right away", "asap", "emergency", "as soon as possible"]


def sane(original, rewritten, min_ratio=0.4, max_ratio=3.0):
    """Reject obviously broken rewrites — empty, an exact echo, or wildly
    off in length (a sign the model dropped or invented content)."""
    if not rewritten:
        return False
    if rewritten.strip().lower() == original.strip().lower():
        return False
    ratio = len(rewritten) / max(len(original), 1)
    return min_ratio <= ratio <= max_ratio


def urgency_not_inflated(reply_text, issues):
    """A Low/Medium-urgency reply shouldn't pick up 'immediate'/'urgent'/
    'asap' language just because the model likes those words."""
    max_urgency = max(URGENCY_RANK[i["urgency"]] for i in issues)
    if max_urgency <= URGENCY_RANK["Medium"]:
        low = reply_text.lower()
        return not any(w in low for w in ESCALATION_WORDS)
    return True


def diversify_row(row):
    orig_input = row["input"]
    orig_reply = row["draft_response"]
    issues = row["issues"]

    new_input = clean(call_ollama(MESSAGE_PROMPT.format(text=orig_input)))
    input_ok = sane(orig_input, new_input)
    final_input = new_input if input_ok else orig_input

    new_reply = clean(call_ollama(REPLY_PROMPT.format(text=orig_reply)))
    reply_ok = sane(orig_reply, new_reply) and urgency_not_inflated(new_reply, issues)
    final_reply = new_reply if reply_ok else orig_reply

    out_row = dict(row)
    out_row["input"] = final_input
    out_row["draft_response"] = final_reply

    audit = {
        "original_input": orig_input,
        "new_input": final_input,
        "input_fell_back": not input_ok,
        "original_reply": orig_reply,
        "new_reply": final_reply,
        "reply_fell_back": not reply_ok,
    }
    return out_row, audit


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input_path")
    ap.add_argument("output_path")
    ap.add_argument("--limit", type=int, default=None, help="only process the first N rows (for a quick pilot run)")
    args = ap.parse_args()

    with open(args.input_path) as f:
        rows = [json.loads(line) for line in f if line.strip()]
    if args.limit:
        rows = rows[: args.limit]

    total = len(rows)
    fallback_count = 0
    start = time.time()

    audit_path = args.output_path.rsplit(".jsonl", 1)[0] + ".audit.jsonl"

    with open(args.output_path, "w") as out_f, open(audit_path, "w") as audit_f:
        for i, row in enumerate(rows, 1):
            try:
                new_row, audit = diversify_row(row)
            except Exception as e:
                print(f"  [{i}/{total}] ERROR: {e} — keeping original row", flush=True)
                new_row = row
                audit = {"error": str(e)}
            if audit.get("input_fell_back") or audit.get("reply_fell_back"):
                fallback_count += 1
            out_f.write(json.dumps(new_row) + "\n")
            audit_f.write(json.dumps(audit) + "\n")
            out_f.flush()
            audit_f.flush()

            if i % 25 == 0 or i == total:
                elapsed = time.time() - start
                rate = i / elapsed
                eta_min = (total - i) / rate / 60 if rate > 0 else 0
                print(f"  [{i}/{total}] {rate:.2f} rows/sec, ETA {eta_min:.1f} min, "
                      f"{fallback_count} fallback(s) so far", flush=True)

    print(f"done -> {args.output_path} ({total} rows, {fallback_count} fell back to original text)")
    print(f"audit -> {audit_path}")


if __name__ == "__main__":
    main()
