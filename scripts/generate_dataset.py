#!/usr/bin/env python3
"""
Synthetic training-data generator for Leaseline's maintenance-triage model.

Produces JSONL rows of the form:
  {
    "input": "<raw tenant message, as it would land in an inbox>",
    "issues": [{"category": "Plumbing", "urgency": "High"}, ...],
    "draft_response": "<the reply Leaseline should draft>"
  }

Why templated instead of calling an LLM: it's $0, instant, deterministic
(same --seed always reproduces the same file), and it's easy to extend —
add a line to ISSUE_BANK and every downstream script picks it up. It is
a first-pass dataset, not a finished one: see dataset/README.md for the
honest limitations (templated phrasing, no real tenant messages yet) and
what to do before actually fine-tuning on it.

Usage:
  python3 scripts/generate_dataset.py --train 2000 --eval 150
"""
import argparse
import hashlib
import json
import random
from pathlib import Path

CATEGORIES = [
    "Plumbing", "Electrical", "HVAC", "Appliance",
    "Pest", "Structural", "Noise", "General",
]
URGENCIES = ["Emergency", "High", "Medium", "Low"]

# category -> [(message template, urgency), ...]
# Templates use {days}/{room}/{floor}/{nearby} placeholders filled at
# generation time. Urgency is picked to match how a property manager
# would actually triage that specific phrasing, not the category as a
# whole (a slow drain and a burst pipe are both "Plumbing").
ISSUE_BANK = {
    "Plumbing": [
        ("the kitchen sink has been leaking under the cabinet for {days} days, water pooling near {nearby}", "High"),
        ("toilet in the {room} won't stop running", "Medium"),
        ("no hot water at all since this morning", "High"),
        ("water heater is making a loud banging noise", "Medium"),
        ("major pipe burst under the sink, water is going everywhere", "Emergency"),
        ("slow drain in the bathtub, water backs up when i shower", "Low"),
        ("outdoor spigot is dripping constantly", "Low"),
        ("toilet is clogged and won't flush at all", "High"),
    ],
    "Electrical": [
        ("the hallway light on the {floor} floor is still out from last week", "Low"),
        ("outlet in the {room} sparked when i plugged something in", "Emergency"),
        ("power keeps flickering in the whole unit", "High"),
        ("ceiling fan in the {room} makes a grinding noise", "Low"),
        ("half the outlets in the kitchen stopped working", "Medium"),
        ("breaker keeps tripping every time i use the microwave", "Medium"),
        ("burning smell coming from the outlet near {nearby}", "Emergency"),
    ],
    "HVAC": [
        ("no heat at all and it's freezing in here", "Emergency"),
        ("ac hasn't been cooling for {days} days", "High"),
        ("thermostat screen is blank, won't turn on", "Medium"),
        ("weird smell coming from the vents when the heat kicks on", "High"),
        ("furnace is making a loud clicking sound before it starts", "Medium"),
        ("vent in the {room} barely blows any air", "Low"),
    ],
    "Appliance": [
        ("stove smells like gas when i turn the burner on", "Emergency"),
        ("fridge stopped cooling, food is going bad", "High"),
        ("dishwasher won't drain, standing water inside", "Medium"),
        ("garbage disposal is jammed and making a buzzing noise", "Low"),
        ("oven door won't close all the way", "Low"),
        ("washing machine leaks a little onto the floor during the spin cycle", "Medium"),
        ("microwave sparks whenever i run it", "High"),
    ],
    "Pest": [
        ("saw a few roaches in the kitchen the last couple nights", "Medium"),
        ("mice got into the pantry, chewed through a cereal box", "High"),
        ("found a wasp nest starting on the balcony", "Medium"),
        ("ants coming in near the {room} window", "Low"),
        ("something's scratching in the walls at night, think it's a rodent", "High"),
    ],
    "Structural": [
        ("ceiling has a water stain that's getting bigger", "High"),
        ("front door doesn't lock properly anymore", "Emergency"),
        ("window in the {room} won't close all the way, cold air coming in", "Medium"),
        ("noticed a crack running across the wall in the {room}", "Medium"),
        ("balcony railing feels loose when i lean on it", "High"),
        ("ceiling tile fell down in the {room}", "Medium"),
    ],
    "Noise": [
        ("neighbors upstairs have been really loud every night this week", "Low"),
        ("there's a weird banging noise in the walls at night", "Medium"),
        ("building's fire alarm chirped randomly for an hour last night", "Medium"),
        ("someone's car alarm in the garage keeps going off", "Low"),
    ],
    "General": [
        ("mailbox lock is broken, key won't turn", "Low"),
        ("parking gate has been stuck open for {days} days", "Low"),
        ("garage door won't close all the way", "Medium"),
        ("smoke detector in the {room} keeps beeping, probably needs a battery", "Medium"),
        ("intercom for the front buzzer stopped working", "Low"),
    ],
}

ROOMS = ["kitchen", "bathroom", "bedroom", "hallway", "living room"]
FLOORS = ["1st", "2nd", "3rd"]
NEARBY = ["the dishwasher", "the cabinet", "the baseboard", "the water heater", "the stove"]
GREETINGS = ["hi ", "hey ", "hello ", "", "hi there ", "hey so "]
SIGNOFFS = ["", " thanks", " asap please", " when you get a chance", " let me know", " appreciate it"]

REPLY_OPENERS = {
    "Emergency": "Thanks for flagging this right away — this is urgent, so we're dispatching someone today.",
    "High": "Thanks for letting us know — we're prioritizing this and expect to have someone out within 24 hours.",
    "Medium": "Thanks for the heads up — we've logged this and will have someone take a look in the next few days.",
    "Low": "Thanks for letting us know — we've added this to the schedule for our next visit.",
}


def fill(template, rng):
    return template.format(
        days=rng.choice([1, 2, 3, 4, 5]),
        room=rng.choice(ROOMS),
        floor=rng.choice(FLOORS),
        nearby=rng.choice(NEARBY),
    )


def mangle(text, rng):
    """Light, realistic 'typed in a hurry' noise — not a grammar model,
    just enough variance that rows aren't stiffly uniform."""
    if rng.random() < 0.4:
        text = text[0].upper() + text[1:]
    if rng.random() < 0.3:
        text = text.replace(",", "")
    if rng.random() < 0.15:
        text = text.replace("'", "")
    return text


def pick_issue(rng, exclude_category=None):
    choices = [c for c in CATEGORIES if c != exclude_category] if exclude_category else CATEGORIES
    cat = rng.choice(choices)
    tmpl, urg = rng.choice(ISSUE_BANK[cat])
    return cat, tmpl, urg


def build_message(chosen, unit, rng):
    phrases = [fill(tmpl, rng) for _, tmpl, _ in chosen]
    greeting = rng.choice(GREETINGS)
    body = " also ".join(phrases)
    if rng.random() < 0.6:
        body = f"its unit {unit} {body}"
    text = f"{greeting}{body}{rng.choice(SIGNOFFS)}"
    return mangle(text.strip(), rng)


def build_reply(chosen):
    _, _, primary_urgency = chosen[0]
    reply = REPLY_OPENERS[primary_urgency]
    for cat, _, _ in chosen[1:]:
        reply += f" We've also logged the {cat.lower()} issue for the same visit."
    return reply


def generate_example(rng, multi_issue_rate=0.12):
    unit = f"{rng.randint(1, 40)}{rng.choice('ABCD')}"
    chosen = [pick_issue(rng)]
    if rng.random() < multi_issue_rate:
        chosen.append(pick_issue(rng, exclude_category=chosen[0][0]))
    return {
        "input": build_message(chosen, unit, rng),
        "issues": [{"category": c, "urgency": u} for c, _, u in chosen],
        "draft_response": build_reply(chosen),
    }


def unique_batch(rng, n, seen, max_attempts_factor=25):
    rows = []
    attempts = 0
    while len(rows) < n and attempts < n * max_attempts_factor:
        attempts += 1
        ex = generate_example(rng)
        h = hashlib.sha1(ex["input"].encode()).hexdigest()
        if h in seen:
            continue
        seen.add(h)
        rows.append(ex)
    return rows


def write_jsonl(rows, path):
    with open(path, "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", type=int, default=2000)
    ap.add_argument("--eval", type=int, default=150)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="dataset")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    seen = set()  # shared across train+eval so no message leaks between splits
    train_rows = unique_batch(rng, args.train, seen)
    eval_rows = unique_batch(rng, args.eval, seen)

    write_jsonl(train_rows, out_dir / "train.jsonl")
    write_jsonl(eval_rows, out_dir / "eval.jsonl")

    print(f"wrote {len(train_rows)} train rows -> {out_dir / 'train.jsonl'}")
    print(f"wrote {len(eval_rows)} eval rows -> {out_dir / 'eval.jsonl'}")
    if len(train_rows) < args.train or len(eval_rows) < args.eval:
        print("note: hit the uniqueness ceiling of the current templates before reaching the "
              "requested count — add more ISSUE_BANK entries to go further.")


if __name__ == "__main__":
    main()
