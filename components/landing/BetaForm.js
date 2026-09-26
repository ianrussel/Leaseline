"use client";

import { useState } from "react";

// Submissions post to this project's Formspree form (free tier) and arrive by email.
// Manage/export them at https://formspree.io/forms
const FORM_ENDPOINT = "https://formspree.io/f/mjyvaqqb";

const UNITS = ["1–10", "11–50", "51–200", "200+"];
const METHODS = ["Text or email", "Property management software", "Paper or phone calls", "Other"];

export default function BetaForm({ fallbackEmail }) {
  const [state, setState] = useState("idle"); // idle | submitting | done | error
  const [ticketNumber, setTicketNumber] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setState("submitting");
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: "POST",
        body: new FormData(e.currentTarget),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("bad response");
      setTicketNumber(10483 + Math.floor(Math.random() * 500));
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="border border-line bg-surface p-7">
        <span className="field-label">Ticket #LL-{ticketNumber} received</span>
        <h3 className="font-display text-3xl font-extrabold">You&apos;re on the list.</h3>
        <p className="mt-2">
          We review beta requests in the order they arrive and email you directly when a spot opens - usually
          within a few days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 border border-line bg-surface p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required autoComplete="name" className="field-input" />
        </div>
        <div>
          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="field-input" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="units">Units you manage</label>
          <select id="units" name="units" className="field-input">
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="method">How you handle requests today</label>
          <select id="method" name="method" className="field-input">
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={state === "submitting"}
          className="bg-accent px-5 py-2.5 font-mono text-sm font-semibold text-accent-contrast hover:bg-accent-hover disabled:opacity-60"
        >
          {state === "submitting" ? "Submitting…" : "Submit ticket"}
        </button>
        <span className="font-mono text-xs text-muted">We&apos;ll email you when a beta spot opens.</span>
      </div>
      <div role="status" aria-live="polite" className="font-mono text-xs text-danger">
        {state === "error" &&
          `Something went wrong - email us directly at ${fallbackEmail} and we'll add you by hand.`}
      </div>
    </form>
  );
}
