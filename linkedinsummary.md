# LinkedIn Experience Draft - Leaseline

Add as an **Experience** entry (not just "Projects") - it carries more weight for
recruiter search and the skills algorithm.

- **Company:** Leaseline · Self-employed
- **Employment type:** Self-employed / Freelance
- **Title:** pick one depending on the role you're targeting (see variants below)

## Description

Built and deployed an AI-powered maintenance-triage SaaS for residential property
managers end-to-end - from fine-tuning the model to shipping the production web app.

- Fine-tuned a Qwen2.5-1.5B LLM (LoRA/PEFT) to classify tenant maintenance requests
  by category and urgency and draft reply text, trained on rented GPU compute and
  deployed via Hugging Face Inference Endpoints
- Built a serverless backend (Node.js on Vercel) with Supabase for auth, Postgres,
  and row-level security, including role-based access control for admin vs.
  customer users
- Designed a continuous-improvement data pipeline: a scheduled job uses Claude to
  auto-flag high-value real-world tickets as fine-tuning candidates, with a
  human-in-the-loop review UI before they're merged into the training set
- Implemented transactional and inbound email handling (Resend API, webhook
  signature verification) so tenant emails are ingested and triaged automatically
  with no manual data entry
- Added a safety-net rules layer on top of model output to catch emergency-severity
  issues (gas leaks, flooding, electrical hazards) the model might misclassify, and
  shipped a triage dashboard for property managers to review, edit, and send
  AI-drafted responses

## Skills

Python, PyTorch, Hugging Face Transformers/PEFT, LLM Fine-Tuning, Node.js, Vercel
Serverless Functions, Supabase (Postgres, Auth, RLS), REST APIs, Webhooks, Prompt
Engineering, Full-Stack Development, Product Development

## Title variants by target role

- **ML/AI-engineer roles:** lead title with "AI/ML Engineer" and move the
  fine-tuning/data-pipeline bullets to the top of the description.
- **Full-stack/product roles:** lead title with "Full-Stack Developer" and move the
  Vercel/Supabase/email-pipeline bullets to the top of the description.

---

# LinkedIn Experience Draft - DB Chat AI Agent (MCP)

A separate, real Experience entry - different employer/context than Leaseline. Fill in
company name, employment type (employee/contractor), and dates yourself; the
technical content below is verified directly against your own code, not guessed.

- **Company:** *(fill in - the "B&F Papers" / biblioteca client work)*
- **Employment type:** *(employee or contractor - fill in)*
- **Title:** pick one depending on the role you're targeting (see variants below)

## Description

Designed and shipped a production AI agent that lets non-technical staff ask
natural-language questions about a Postgres database, safely, with the LLM
deciding for itself which tools to call rather than following a fixed script.

- Built a custom MCP (Model Context Protocol) server exposing three tools
  (`list_tables`, `describe_table`, `run_query`) to an LLM agent - the model
  autonomously decides which to call and when, inspecting a table's schema before
  querying it rather than following a hardcoded sequence
- Used Anthropic's Tool Runner to drive the actual agent loop (plan → call a tool →
  read the result → decide the next step → repeat) rather than a single one-shot
  prompt/response - the model, not application code, controls what happens next
- Designed a multi-provider architecture (Anthropic, OpenAI, Gemini) behind one
  interface, so the same agent runs on any of the three depending on configuration
- Enforced defense-in-depth safety on an agent with real database access: a SQL
  guard restricting it to single, read-only SELECT statements, backed independently
  by a dedicated read-only database role - so even a bypassed guard still can't
  write to the database
- Deployed as an async Celery task with full audit logging (question asked,
  generated SQL, row count) behind a Django view - a real production feature, not a
  prototype

## Skills

Python, AI Agents, Agentic AI, Model Context Protocol (MCP), Anthropic API, Tool
Use / Function Calling, LLM Orchestration, Django, Celery, PostgreSQL, SQL,
Multi-Provider LLM Architecture, Production AI Systems

## Title variants by target role

- **AI/agentic-AI roles:** lead title with "AI Engineer" and lead the description
  with the MCP/tool-calling/agent-loop bullets (already first above).
- **Backend/platform roles:** lead title with "Backend Engineer" and move the
  Celery/Django/audit-logging/multi-provider-architecture bullets to the top.
