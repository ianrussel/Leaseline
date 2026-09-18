// Shared helper for api/*.js - not itself a route. The actual "triage a message and save a
// ticket" logic, extracted so api/triage.js (dashboard, authenticated user) and
// api/inbound-email.js (webhook, no user session at all) both go through the exact same path
// rather than two copies of the HF call / safety net / ticket insert drifting apart over time.

import { supabaseAdmin } from "./auth.js";

const HF_ENDPOINT_URL = process.env.HF_ENDPOINT_URL;
const HF_TOKEN = process.env.HF_TOKEN;

// Exact same system instruction as leaseline-training's prepare_data.py INSTRUCTION constant -
// this has to match what the model was actually trained on, or output quality silently degrades
// without erroring. If that constant ever changes, mirror the change here too.
const SYSTEM_PROMPT =
  "You are Leaseline, an AI maintenance-triage assistant for property managers. Read the " +
  "tenant's message and identify the primary issue's category and urgency, and draft a short " +
  "reply. Categories: Plumbing, Electrical, HVAC, Appliance, Pest, Structural, Noise, General. " +
  "Urgency: Emergency, High, Medium, Low. Reply with ONLY a single JSON object, no prose, no " +
  'markdown fences - e.g. {"category": "Plumbing", "urgency": "High", ' +
  '"draft_response": "..."}.';

// Qwen2.5's chat template, built by hand since there's no tokenizer.apply_chat_template()
// available in a Node function - mirrors exactly what worked in the manual curl test from
// deploy-inference-endpoint.md step 5.
function buildPrompt(tenantMessage) {
  return (
    `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n` +
    `<|im_start|>user\n${tenantMessage}<|im_end|>\n` +
    `<|im_start|>assistant\n`
  );
}

// Finds the first balanced {...} block by counting brace depth, rather than a greedy regex
// (`/\{[\s\S]*\}/`) that matches to the LAST `}` in the text - that broke on real output like
// `{"category": ..., "draft_response": "..."}}`, where the HF endpoint's generation included one
// stray extra closing brace after an otherwise well-formed object. A greedy match grabs both
// braces and produces invalid JSON even though the actual object was fine. This also tolerates
// prose or a code fence around the object, same intent as evaluate.py's extract_json_obj.
//
// Tracks whether it's currently inside a quoted string for two reasons, both hit by real model
// output, not hypothetical:
//   1. A `{`/`}` appearing inside a string value (e.g. draft_response prose) must not be counted
//      as structural - otherwise brace depth gets thrown off by content, not structure.
//   2. A multi-paragraph draft_response can contain a literal, unescaped newline - valid-looking
//      to a human, but invalid JSON (control characters must be escaped inside a string per the
//      JSON spec). JSON.parse correctly rejects this and there's no way to ask it to tolerate it,
//      so raw \n/\r/\t found *inside* a string are escaped here before parsing - this only
//      touches characters already inside quotes, so it can't corrupt otherwise-valid JSON.
function extractJsonObj(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escapedNext = false;
  let sanitized = "";

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    sanitized += inString && ch === "\n" ? "\\n"
               : inString && ch === "\r" ? "\\r"
               : inString && ch === "\t" ? "\\t"
               : ch;

    if (inString) {
      if (escapedNext) escapedNext = false;
      else if (ch === "\\") escapedNext = true;
      else if (ch === '"') inString = false;
      continue; // brace-depth tracking below only applies outside strings
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(sanitized);
        } catch {
          return null;
        }
      }
    }
  }
  return null; // never closed - truncated output
}

// Narrow, high-precision safety net - the exact Emergency examples already documented in
// docs/knowledge-base.md ("gas smells, active flooding/burst pipes, ... sparking outlets, broken
// exterior locks"), not generic urgency-sounding tone words like "ASAP"/"urgent". Deliberately
// excludes tone words: leaseline-training's gold.jsonl review found tenants use those as filler
// for trivial issues just as often as real emergencies (see review_gold.py) - keying on tone
// would reintroduce exactly the bias that training data fix worked to remove. This only fires on
// the message actually describing one of these specific physical hazards, independent of what
// the model itself predicted.
const EMERGENCY_TRIGGERS = [
  /\bgas\b[^.]{0,20}\bsmell|\bsmell[^.]{0,20}\bgas\b/i,
  /\bspark(ing|ed)?\b/i,
  /\bflood(ing|ed)?\b|\bburst pipe\b/i,
  /(won'?t|wont|can'?t|cant|doesn'?t|does not)\s+lock|lock[^.]{0,15}(broken|busted|snapped|not working)/i,
];

function hasEmergencyTrigger(message) {
  return EMERGENCY_TRIGGERS.some((re) => re.test(message));
}

/**
 * Runs a tenant message through the fine-tuned model and saves the result as a ticket.
 * Returns { ok: true, ticket: {...} } or { ok: false, status, error } - callers translate that
 * into their own response shape (an HTTP JSON response for api/triage.js, a log line for
 * api/inbound-email.js).
 */
export async function runTriage({ message, tenantContact, userId }) {
  if (!HF_ENDPOINT_URL || !HF_TOKEN) {
    console.error("runTriage: HF_ENDPOINT_URL/HF_TOKEN not set in Vercel env vars.");
    return { ok: false, status: 500, error: "The triage assistant isn't configured yet." };
  }

  const tenantMessage = message.trim();

  let hfResponse;
  try {
    hfResponse = await fetch(HF_ENDPOINT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: buildPrompt(tenantMessage),
        parameters: { max_new_tokens: 256, return_full_text: false },
      }),
    });
  } catch (error) {
    console.error("runTriage: unexpected error calling HF endpoint:", error.message);
    return { ok: false, status: 500, error: "Something went wrong on our end." };
  }

  if (hfResponse.status === 503) {
    // Scale-to-zero cold start - the endpoint is booting, not broken.
    return { ok: false, status: 503, error: "The triage assistant is starting up - try again in a moment." };
  }
  if (!hfResponse.ok) {
    const body = await hfResponse.text();
    console.error("runTriage: HF Inference Endpoint error:", hfResponse.status, body);
    return { ok: false, status: 502, error: "The triage assistant is temporarily unavailable - try again shortly." };
  }

  const data = await hfResponse.json();
  const rawOutput = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
  const parsed = rawOutput ? extractJsonObj(rawOutput) : null;

  if (!parsed || !parsed.category || !parsed.urgency) {
    console.error("runTriage: model returned unparseable output:", rawOutput);
    return { ok: false, status: 502, error: "Couldn't triage that message - try rephrasing it." };
  }

  let safetyOverride = false;
  if (parsed.urgency !== "Emergency" && hasEmergencyTrigger(tenantMessage)) {
    console.warn("runTriage: safety-net override forcing Emergency for message:", tenantMessage);
    parsed.urgency = "Emergency";
    safetyOverride = true;
  }

  const { data: ticket, error: insertError } = await supabaseAdmin
    .from("tickets")
    .insert({
      raw_message: tenantMessage,
      category: parsed.category,
      urgency: parsed.urgency,
      draft_response: parsed.draft_response || "",
      safety_override: safetyOverride,
      tenant_contact: tenantContact || null,
      created_by: userId,
    })
    .select("id, ticket_number")
    .single();

  if (insertError) {
    // The triage itself succeeded - the model call is the expensive/slow part. Reporting it
    // without a ticket id rather than failing outright means a DB hiccup doesn't waste a
    // perfectly good triage result.
    console.error("runTriage: failed to save ticket:", insertError.message);
    return {
      ok: true,
      ticket: { ...parsed, safety_override: safetyOverride, id: null, ticket_number: null },
    };
  }

  return {
    ok: true,
    ticket: { ...parsed, safety_override: safetyOverride, id: ticket.id, ticket_number: ticket.ticket_number },
  };
}
