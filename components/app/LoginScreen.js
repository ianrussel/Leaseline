"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase-client";

export function Wordmark({ className = "" }) {
  return <span className={`font-display font-black tracking-[0.02em] ${className}`}>LEASELINE</span>;
}

// Single admin/customer users are added manually via the Supabase dashboard - no public signup flow.
export default function LoginScreen({ subtitle }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const { error } = await getSupabase().auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <CenteredCard>
      <h1 className="mb-1 text-3xl"><Wordmark /></h1>
      <p className="mb-5 text-sm text-muted">{subtitle}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="username" className="field-input" />
        </div>
        <div>
          <label className="field-label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="field-input" />
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
      {error && <p className="mt-3 border border-danger px-3 py-2 text-sm text-danger">{error}</p>}
    </CenteredCard>
  );
}

export function CenteredCard({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-[420px] border border-line bg-surface p-7 shadow-sm">{children}</div>
    </div>
  );
}
