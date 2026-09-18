# LinkedIn Experience Draft — Leaseline

Add as an **Experience** entry (not just "Projects") — it carries more weight for
recruiter search and the skills algorithm.

- **Company:** Leaseline · Self-employed
- **Employment type:** Self-employed / Freelance
- **Title:** pick one depending on the role you're targeting (see variants below)

## Description

Built and deployed an AI-powered maintenance-triage SaaS for residential property
managers end-to-end — from fine-tuning the model to shipping the production web app.

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
