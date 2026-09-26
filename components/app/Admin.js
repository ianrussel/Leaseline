"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authedFetch, isAdmin, useSession } from "@/lib/supabase-client";
import AppShell from "./AppShell";
import LoginScreen from "./LoginScreen";

const CATEGORIES = ["Plumbing", "Electrical", "HVAC", "Appliance", "Pest", "Structural", "Noise", "General"];
const URGENCIES = ["Emergency", "High", "Medium", "Low"];

const chip = "inline-block px-2 py-0.5 font-mono text-[11px] font-semibold";

// Real enforcement is server-side (requireAdmin() in lib/server/auth.js) - the redirect for a
// signed-in non-admin is just a courtesy. /dashboard never redirects a non-admin away, so no loop.
export default function Admin() {
  const session = useSession();
  const router = useRouter();
  const admin = isAdmin(session);

  useEffect(() => {
    if (session && !admin) router.replace("/dashboard");
  }, [session, admin, router]);

  if (session === undefined) return null;
  if (!session) return <LoginScreen subtitle="Training review - admin only. Sign in to continue." />;
  if (!admin) return null;

  return (
    <AppShell title="Training review" active="admin" email={session.user.email} showTrainingReview>
      <div className="border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
        Real tenant messages the daily analysis job (<code>app/api/analyze-tickets</code>) flagged as worth a look -
        redundant ones are auto-skipped and never show up here. Edit any field before approving; approving only updates
        the database, it doesn&apos;t touch <code>dataset/real_examples.jsonl</code> or <code>eval.diverse.jsonl</code>{" "}
        directly - run <code>scripts/export_training_candidates.py</code> afterward for that.
      </div>
      <Candidates />
      <Customers />
    </AppShell>
  );
}

function Candidates() {
  const [tickets, setTickets] = useState(null); // null = loading, false = failed

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/admin-tickets");
      if (!res.ok) throw new Error("failed");
      setTickets(await res.json());
    } catch {
      setTickets(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (tickets === null) return <p className="text-sm text-muted">Loading...</p>;
  if (tickets === false) return <p className="text-sm text-muted">Couldn&apos;t load training candidates.</p>;
  if (!tickets.length) return <p className="text-sm text-muted">No training candidates yet.</p>;

  return tickets.map((t) => <CandidateCard key={t.id} ticket={t} onDone={load} />);
}

function CandidateCard({ ticket: t, onDone }) {
  const [category, setCategory] = useState(t.category);
  const [urgency, setUrgency] = useState(t.urgency);
  const [draft, setDraft] = useState(t.draft_response || "");
  const done = t.training_status === "added_to_train" || t.training_status === "added_to_gold";

  async function act(training_status) {
    await authedFetch("/api/admin-update-ticket", {
      method: "POST",
      body: JSON.stringify({ id: t.id, training_status, category, urgency, draft_response: draft }),
    });
    onDone();
  }

  return (
    <section className={`card ${done ? "opacity-60" : ""}`}>
      <div className="mb-2 flex items-start justify-between">
        <span className="font-mono text-xs text-muted">#{t.ticket_number} - {new Date(t.created_at).toLocaleString()}</span>
        <span className={`${chip} bg-muted text-surface`}>{t.training_status}</span>
      </div>
      <p className="mb-3">{t.raw_message}</p>
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <div>
          <label className="field-label">Category</label>
          <select className="field-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Urgency</label>
          <select className="field-input" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
            {URGENCIES.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <label className="field-label">Draft response</label>
      <textarea className="field-input mb-3" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="bg-success px-3 py-1.5 font-mono text-xs font-semibold text-accent-contrast" onClick={() => act("added_to_train")}>
          Add to training set
        </button>
        <button type="button" className="bg-warning px-3 py-1.5 font-mono text-xs font-semibold text-accent-contrast" onClick={() => act("added_to_gold")}>
          Add to gold
        </button>
        <button type="button" className="btn-outline" onClick={() => act("not_candidate")}>Not useful</button>
      </div>
    </section>
  );
}

function Customers() {
  const [data, setData] = useState(null); // null = loading, false = failed
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/admin-customers");
      if (!res.ok) throw new Error("failed");
      setData(await res.json());
    } catch {
      setData(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id, action, failMessage) {
    const res = await authedFetch("/api/admin-customers", { method: "PATCH", body: JSON.stringify({ id, action }) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || failMessage);
      return;
    }
    load();
  }

  async function remove(id) {
    if (!confirm("Remove this customer? Inbound email to their address will stop being routed - existing tickets are unaffected.")) return;
    await authedFetch("/api/admin-customers", { method: "DELETE", body: JSON.stringify({ id }) });
    load(); // also refreshes the owner dropdown - that owner is eligible again now
  }

  async function cancel(id) {
    if (!confirm("Cancel this customer? They keep full access until the end of their current period, then access stops - no refund, nothing deleted.")) return;
    patch(id, "cancel", "Failed to cancel.");
  }

  async function onAdd(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError(null);
    setAdding(true);
    try {
      const res = await authedFetch("/api/admin-customers", {
        method: "POST",
        body: JSON.stringify({
          name: String(f.get("name")).trim(),
          local_part: String(f.get("local_part")).trim(),
          owner_email: String(f.get("owner_email")).trim(),
          is_beta: f.get("is_beta") === "on",
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || `Request failed (${res.status})`);
        return;
      }
      form.reset();
      load();
    } catch {
      setError("Network error - is the server running?");
    } finally {
      setAdding(false);
    }
  }

  const domain = data?.receiving_domain;
  const customers = data?.customers;

  return (
    <section className="card">
      <h3 className="card-title !mb-2">Customers</h3>
      <div className="mb-3 flex flex-col gap-3 text-sm text-muted">
        <p>
          Each row&apos;s local-part routes inbound email - a tenant emailing{" "}
          <code>&lt;local-part&gt;@{domain || "your Resend receiving domain"}</code> becomes a pending message in that
          customer&apos;s owner&apos;s inbox (see <code>app/api/inbound-email</code>). Leave local-part blank to default to
          the owner email&apos;s own name (e.g. <code>owner@example.com</code> → <code>owner</code>) - the owner&apos;s account
          email itself stays reserved for sign-in and business correspondence with us, never used as the literal
          tenant-facing address. Give it an explicit value (e.g. <code>sunsetapartments</code>) when a customer wants
          something more memorable. Owner must already be a Supabase user (Authentication → Users → Add user) - there&apos;s
          no signup flow yet. Each local-part is exclusive to one customer - the database rejects a duplicate outright,
          it&apos;s never silently shared or reassigned.
        </p>
        <p>
          <strong>If a customer wants tenants to keep emailing their existing business address</strong> instead of learning
          a new one: that&apos;s only possible via a forwarding rule set up on their end (e.g. Gmail → Settings → Forwarding
          and POP/IMAP → forward to their local-part address here), not something this app can do for them - Resend can only
          receive mail for domains it&apos;s configured to receive for, never an arbitrary customer&apos;s real inbox provider.
        </p>
        <p>
          <strong>Plan/usage columns are informational only</strong> - no payment processor is integrated yet (Stripe is on
          hold), so nothing here charges anyone or blocks a customer from triaging past their limit (unless{" "}
          <code>ENFORCE_USAGE_LIMITS</code> is on). Beta status locks in <code>BETA_MONTHLY_PRICE_USD</code> for{" "}
          <code>BETA_DURATION_MONTHS</code> (default 12) from when it&apos;s granted - changing that env var later only affects
          customers granted beta afterward, since the exact expiry date is recorded on that customer&apos;s own row - and is
          capped at <code>MAX_BETA_USERS</code> total - requesting beta past the cap silently falls back to the standard rate
          rather than failing the add.
        </p>
      </div>

      <div className="mb-3 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {["Name", "Inbound address", "Owner", "Plan", "Usage", "Renews / ends", ""].map((h) => (
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data === null && <tr><td colSpan={7} className="td text-muted">Loading...</td></tr>}
            {data === false && <tr><td colSpan={7} className="td text-muted">Couldn&apos;t load customers.</td></tr>}
            {customers && !customers.length && <tr><td colSpan={7} className="td text-muted">No customers yet.</td></tr>}
            {customers?.map((c) => {
              const stillBeta = c.is_beta && c.beta_locked_until && new Date(c.beta_locked_until) > new Date();
              const overLimit = c.triages_used > c.triage_limit;
              const canceled = !!c.access_ends_at;
              return (
                <tr key={c.id} className="border-t border-line">
                  <td className="td">{c.name}</td>
                  <td className="td font-mono text-xs">{domain ? `${c.local_part}@${domain}` : c.local_part}</td>
                  <td className="td text-muted">{c.owner_email || "(unknown user)"}</td>
                  <td className="td">
                    <span className={`${chip} ${stillBeta ? "bg-warning text-accent-contrast" : "border border-line"}`}>
                      {stillBeta ? "Beta" : "Standard"}
                    </span>{" "}
                    <span className="text-muted">${c.effective_price}/mo</span>
                  </td>
                  <td className={`td ${overLimit ? "font-bold text-danger" : ""}`}>{c.triages_used} / {c.triage_limit}</td>
                  <td className="td">
                    {canceled ? (
                      <span className={c.is_active ? "text-warning" : "text-danger"}>
                        {c.is_active ? "Access ends" : "Ended"} {new Date(c.access_ends_at).toLocaleDateString()}
                      </span>
                    ) : (
                      new Date(c.period_end).toLocaleDateString()
                    )}
                  </td>
                  <td className="td whitespace-nowrap text-right">
                    {canceled ? (
                      <button type="button" className="btn-outline text-success" onClick={() => patch(c.id, "reactivate", "Failed to reactivate.")}>Reactivate</button>
                    ) : (
                      <button type="button" className="btn-outline text-warning" onClick={() => cancel(c.id)}>Cancel</button>
                    )}{" "}
                    <button type="button" className="btn-outline text-danger" onClick={() => remove(c.id)}>Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={onAdd} className="grid items-end gap-2 sm:grid-cols-[3fr_3fr_3fr_2fr_1fr]">
        <div>
          <label className="field-label" htmlFor="customerName">Name</label>
          <input id="customerName" name="name" type="text" required placeholder="Sunset Apartments" className="field-input" />
        </div>
        <div>
          <label className="field-label" htmlFor="customerLocalPart">Local-part <span>(optional)</span></label>
          <input id="customerLocalPart" name="local_part" type="text" placeholder="defaults to owner email's name" className="field-input" />
        </div>
        <div>
          <label className="field-label" htmlFor="customerOwnerEmail">Owner</label>
          <select id="customerOwnerEmail" name="owner_email" required defaultValue="" className="field-input">
            <option value="" disabled>Choose a user...</option>
            {(data?.eligible_owners || []).map((u) => <option key={u.email} value={u.email}>{u.email}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="is_beta" /> Beta rate
        </label>
        <button type="submit" disabled={adding} className="btn-primary">{adding ? "Adding..." : "Add"}</button>
      </form>
      {error && <p className="mt-3 border border-danger px-3 py-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
