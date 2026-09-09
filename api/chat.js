// Vercel serverless function (zero-config: any file under /api becomes an endpoint).
// POST { message: string } -> { reply: string }
//
// Requires an ANTHROPIC_API_KEY environment variable set in the Vercel project settings
// (Project -> Settings -> Environment Variables). Get one at https://console.anthropic.com/.
// Without it, every request fails with a clear 500 rather than a silent wrong answer.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// Read once per cold start, cached across warm invocations of the same instance.
const KNOWLEDGE_BASE = fs.readFileSync(
  path.join(process.cwd(), "docs", "knowledge-base.md"),
  "utf-8",
);

const SYSTEM_PROMPT = `You are the chat assistant on Faultline's beta landing page, answering \
questions from prospective customers (small property managers and landlords).

Answer ONLY using the knowledge base below - it is the single source of truth for what Faultline \
is, does, costs, and doesn't do yet. If something isn't covered in it, say plainly that you don't \
know and point them to ianrussel537@gmail.com rather than guessing or inventing an answer. Never \
claim a feature, integration, or certification that isn't listed as available in the knowledge base.

If asked something with nothing to do with Faultline (general trivia, coding help, unrelated \
requests), politely decline and redirect to what you can actually help with: questions about \
Faultline.

Keep answers short - 2 to 4 sentences, plain conversational text, no markdown formatting, no \
headers or bullet lists unless genuinely listing multiple short items.

=== FAULTLINE KNOWLEDGE BASE ===
${KNOWLEDGE_BASE}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { message } = req.body || {};
  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "Missing 'message' in request body" });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: "Message too long (max 2000 characters)" });
    return;
  }

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 512,
      output_config: { effort: "low" }, // simple FAQ lookup - low effort is the documented sweet spot here
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: message.trim() }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    res.status(200).json({ reply: textBlock ? textBlock.text : "" });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic auth error - check ANTHROPIC_API_KEY in Vercel env vars:", error.message);
      res.status(500).json({ error: "The chat assistant isn't configured yet - missing or invalid API key." });
    } else if (error instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "Getting a lot of questions right now - try again in a moment." });
    } else if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", error.status, error.message);
      res.status(502).json({ error: "The chat assistant is temporarily unavailable - try again shortly." });
    } else {
      console.error("Unexpected chat handler error:", error);
      res.status(500).json({ error: "Something went wrong on our end." });
    }
  }
}
