"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetch, getSupabase, isAdmin, useSession } from "@/lib/supabase-client";
import UrgencyBadge, { CategoryBadge } from "@/components/UrgencyBadge";
import AppShell from "./AppShell";
import LoginScreen, { CenteredCard, Wordmark } from "./LoginScreen";

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

const STATUS_BADGES = {
  sent: ["Sent", "bg-success text-accent-contrast"],
  copied: ["Copied", "bg-urgency-low text-urgency-low-fg"],
  new: ["Not sent", "bg-urgency-medium text-urgency-medium-fg"],
};

const chip = "inline-block px-2 py-0.5 font-mono text-[11px] font-semibold";

async function patchSubscription(action) {
  const res = await authedFetch("/api/tickets", { method: "PATCH", body: JSON.stringify({ action }) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, error: data.error || `Request failed (${res.status})` };
}

// Cosmetic only - shows a clean screen instead of a raw 403 on the first triage attempt. The real
// enforcement is requireCustomer() (lib/server/auth.js), which every endpoint calls independently,
// so any outcome other than a 403 (including a network error) just proceeds to the dashboard.
async function checkIsCustomer() {
  try {
    const res = await authedFetch("/api/tickets");
    if (res.status !== 403) return null;
    const data = await res.json().catch(() => ({}));
    return {
      message:
        data.error ||
        "Your account isn't set up as a customer yet - contact your admin to get set up before you can triage anything.",
      code: data.code || null,
    };
  } catch {
    return null;
  }
}

export default function Dashboard() {
  const session = useSession();
  const [blocked, setBlocked] = useState(undefined); // undefined = checking, null = ok, object = blocked
  const [blockedError, setBlockedError] = useState(null);

  const checkAccess = useCallback(async () => setBlocked(await checkIsCustomer()), []);

  useEffect(() => {
    if (session) checkAccess();
    else setBlocked(undefined);
  }, [session, checkAccess]);

  if (session === undefined) return null;
  if (!session) return <LoginScreen subtitle="Triage - internal preview. Sign in to continue." />;
  if (blocked === undefined) return null;

  if (blocked) {
    return (
      <CenteredCard>
        <h1 className="mb-1 text-3xl"><Wordmark /></h1>
        <p className="mb-4 text-muted">{blocked.message}</p>
        {blockedError && <p className="mb-3 text-sm text-danger">{blockedError}</p>}
        {blocked.code === "subscription_ended" && (
          <button
            type="button"
            className="btn-primary mr-2"
            onClick={async () => {
              const r = await patchSubscription("renew");
              if (r.ok) checkAccess();
              else setBlockedError(r.error);
            }}
          >
            Renew subscription
          </button>
        )}
        <button type="button" className="btn-outline" onClick={() => getSupabase().auth.signOut()}>
          Sign out
        </button>
      </CenteredCard>
    );
  }

  return <TriageWorkspace session={session} />;
}

function TriageWorkspace({ session }) {
  const [tickets, setTickets] = useState(null); // null = loading, false = failed
  const [usage, setUsage] = useState(null);
  const [inbox, setInbox] = useState(null);

  const [message, setMessage] = useState("");
  const [tenantContact, setTenantContact] = useState("");
  const [autoFilled, setAutoFilled] = useState(false); // so a manual edit isn't clobbered by re-detection
  const [selectedInboxId, setSelectedInboxId] = useState(null);

  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { id, category, urgency, safety_override }
  const [reply, setReply] = useState("");
  const [note, setNote] = useState(null);

  // Read inside async callbacks that outlive a render (post-send auto-load).
  const messageRef = useRef("");
  const selectedRef = useRef(null);
  messageRef.current = message;
  selectedRef.current = selectedInboxId;

  const loadTickets = useCallback(async () => {
    try {
      const res = await authedFetch("/api/tickets");
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setTickets(data.tickets);
      setUsage(data.usage);
    } catch {
      setTickets(false);
    }
  }, []);

  const loadIntoWindow = useCallback((item) => {
    setMessage(item.body);
    setTenantContact(item.from_email);
    setAutoFilled(false); // the real sender address, not a guess
    setSelectedInboxId(item.id);
    setError(null);
    setResult(null);
  }, []);

  const loadInbox = useCallback(
    async (autoLoadOldest) => {
      try {
        const res = await authedFetch("/api/tenant-messages");
        if (!res.ok) throw new Error("failed");
        const items = await res.json();
        setInbox(items);
        // Only auto-load when the window is genuinely free - never clobber a message being reviewed.
        if (autoLoadOldest && items.length && !messageRef.current.trim() && !selectedRef.current) {
          loadIntoWindow(items[0]); // oldest first - see app/api/tenant-messages/route.js
        }
      } catch (err) {
        console.error("Failed to load tenant inbox:", err);
      }
    },
    [loadIntoWindow],
  );

  useEffect(() => {
    loadTickets();
    loadInbox(true);
  }, [loadTickets, loadInbox]);

  function flash(text) {
    setNote(text);
    setTimeout(() => setNote(null), 2500);
  }

  function onMessageChange(value) {
    setMessage(value);
    if (tenantContact.trim() && !autoFilled) return;
    const match = value.match(EMAIL_PATTERN);
    if (match) {
      setTenantContact(match[0]);
      setAutoFilled(true);
    } else if (autoFilled) {
      setTenantContact("");
      setAutoFilled(false);
    }
  }

  async function onTriage(e) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    const contact = tenantContact.trim();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await authedFetch("/api/triage", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          tenant_contact: contact || undefined,
          tenant_message_id: selectedInboxId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        return;
      }
      setResult({ id: data.id || null, category: data.category, urgency: data.urgency, safety_override: data.safety_override });
      setReply(data.draft_response || "");
      setNote(null);
      loadTickets();
      loadInbox(false); // refresh only - don't auto-load into a window being reviewed
    } catch {
      setError("Network error - is the server running?");
    } finally {
      setBusy(false);
    }
  }

  // Re-exposes Send/Copy against an EXISTING ticket - no new AI call. Prefers final_response (what
  // was actually sent/copied) over draft_response so edits aren't reverted.
  function reopenTicket(t) {
    setError(null);
    setMessage(t.raw_message);
    setTenantContact(t.tenant_contact || "");
    setAutoFilled(false);
    setSelectedInboxId(null);
    setResult({ id: t.id, category: t.category, urgency: t.urgency, safety_override: t.safety_override });
    setReply(t.final_response || t.draft_response || "");
    setNote(null);
    document.getElementById("result-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function onSend() {
    const to = tenantContact.trim();
    if (!to || !to.includes("@")) {
      setError("Enter the tenant's email above before sending.");
      return;
    }
    if (!result?.id) return; // triage succeeded but the ticket failed to save
    // A human should see exactly what's about to go out - keep the confirm step.
    if (!confirm(`Send this reply to ${to} now?`)) return;

    setError(null);
    setSending(true);
    try {
      const res = await authedFetch("/api/send-reply", {
        method: "POST",
        body: JSON.stringify({
          id: result.id,
          to,
          subject: `Re: your maintenance request (${result.category})`,
          body: reply,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        return;
      }
      flash("Email sent");
      loadTickets();
      // Sending is the "done" moment: clear the window and load the next oldest inbox item, so the
      // inbox works as a queue. Delayed so "Email sent" stays visible.
      setTimeout(() => {
        setMessage("");
        setTenantContact("");
        setAutoFilled(false);
        setResult(null);
        setSelectedInboxId(null);
        messageRef.current = "";
        selectedRef.current = null;
        loadInbox(true);
      }, 2500);
    } catch {
      setError("Network error - is the server running?");
    } finally {
      setSending(false);
    }
  }

  async function onCopy() {
    await navigator.clipboard.writeText(reply);
    flash("Copied");
    if (!result?.id) return;
    try {
      await authedFetch("/api/ticket-action", {
        method: "POST",
        body: JSON.stringify({ id: result.id, final_response: reply, status: "copied" }),
      });
      loadTickets();
    } catch (err) {
      console.error("Failed to record ticket action:", err); // non-fatal - the copy already happened
    }
  }

  async function onSubscription(action) {
    if (action === "cancel" && !confirm("Cancel your subscription? You keep full access until the end of your current billing period - no refund, nothing deleted.")) return;
    const r = await patchSubscription(action);
    if (r.ok) loadTickets();
    else setError(r.error);
  }

  const canceled = !!usage?.canceled_at;
  const menuItems = usage && (
    <li>
      {canceled ? (
        <button type="button" className="menu-item" onClick={() => onSubscription("renew")}>Renew subscription</button>
      ) : (
        <button type="button" className="menu-item" onClick={() => onSubscription("cancel")}>Cancel subscription</button>
      )}
    </li>
  );

  return (
    <AppShell
      title="Triage"
      active="triage"
      email={session.user.email}
      showTrainingReview={isAdmin(session)}
      menuItems={menuItems}
    >
      <div className="border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
        Unauthenticated visitors can&apos;t reach this - not linked from the public site either, on top of the login above.
      </div>

      {inbox && (
        <section className="card">
          <h3 className="card-title">
            Tenant inbox <span className={`${chip} ml-1 bg-muted text-surface`}>{inbox.length}</span>
          </h3>
          <p className="mb-2 text-sm text-muted">
            Emails received automatically, not yet triaged. The oldest one loads into the window below by itself - click
            any other row to work that one instead.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr><th className="th">Received</th><th className="th">From</th><th className="th">Subject</th><th className="th">Preview</th><th className="th" /></tr>
              </thead>
              <tbody>
                {inbox.length ? inbox.map((item) => (
                  <tr key={item.id} className="border-t border-line">
                    <td className="td whitespace-nowrap text-muted">{new Date(item.created_at).toLocaleString()}</td>
                    <td className="td">{item.from_email}</td>
                    <td className="td">{item.subject || "(no subject)"}</td>
                    <td className="td max-w-60 truncate">{item.body}</td>
                    <td className="td text-right"><button type="button" className="btn-outline" onClick={() => loadIntoWindow(item)}>Load</button></td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="td text-muted">Inbox empty.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[7fr_5fr]">
        <section className="card">
          <h3 className="card-title">Tenant message</h3>
          <form onSubmit={onTriage} className="flex flex-col gap-3">
            <textarea
              className="field-input"
              rows={5}
              required
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder="paste or type a tenant's maintenance message..."
            />
            <div>
              <label className="field-label" htmlFor="tenantContact">
                Tenant email <span>(optional - needed to use &quot;Send&quot;)</span>
              </label>
              <input
                id="tenantContact"
                type="email"
                className="field-input"
                placeholder="tenant@example.com"
                value={tenantContact}
                onChange={(e) => {
                  setTenantContact(e.target.value);
                  setAutoFilled(false); // a direct edit means it's no longer safe to overwrite
                }}
              />
              {autoFilled && (
                <p className="mt-1 text-xs text-muted">Filled in from an email address found in the message above - edit if wrong.</p>
              )}
            </div>
            <div><button type="submit" disabled={busy} className="btn-primary">{busy ? "Triaging..." : "Triage"}</button></div>
          </form>
          {error && <p className="mt-3 border border-danger px-3 py-2 text-sm text-danger">{error}</p>}
        </section>

        {result && (
          <section className="card" id="result-card">
            <h3 className="card-title">Result</h3>
            <div className="mb-3 flex gap-2">
              <CategoryBadge>{result.category}</CategoryBadge>
              <UrgencyBadge urgency={result.urgency} />
            </div>
            {result.safety_override && (
              <p className="mb-3 border border-warning px-3 py-2 text-sm">
                ⚠ Urgency raised automatically by the safety-net check, not the model&apos;s own read of this message.
              </p>
            )}
            <label className="field-label" htmlFor="replyText">Draft reply (edit either action uses this text)</label>
            <textarea id="replyText" className="field-input mb-2" rows={6} value={reply} onChange={(e) => setReply(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary" disabled={sending} onClick={onSend}>
                {sending ? "Sending..." : "Send via email"}
              </button>
              <button type="button" className="btn-outline" onClick={onCopy}>Copy reply</button>
              {note && <span className="text-sm text-muted">{note}</span>}
            </div>
            {!tenantContact.trim() && (
              <p className="mt-2 text-xs text-muted">No tenant email entered above yet - &quot;Send&quot; will ask for one before it does anything.</p>
            )}
          </section>
        )}
      </div>

      {usage && (
        <section className="card">
          <h3 className="card-title !mb-2">Your plan</h3>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{usage.used} / {usage.limit} triages</span>
            <div className="h-2 min-w-40 flex-1 bg-line" role="progressbar">
              <div
                className={`h-full ${usage.used > usage.limit ? "bg-warning" : "bg-accent"}`}
                style={{ width: `${Math.min(100, Math.round((usage.used / usage.limit) * 100))}%` }}
              />
            </div>
            <span className="text-sm text-muted">
              {canceled
                ? `Canceled · access ${usage.is_active ? "ends" : "ended"} ${new Date(usage.access_ends_at).toLocaleDateString()}`
                : `$${usage.price}/mo · renews ${new Date(usage.period_end).toLocaleDateString()}`}
            </span>
          </div>
          {usage.used > usage.limit && (
            <p className="mt-2 border border-warning px-3 py-2 text-sm">
              You&apos;ve used more triages than your plan&apos;s limit this period. This isn&apos;t blocked - nothing stops
              working - but let your admin know if this is a regular pattern.
            </p>
          )}
        </section>
      )}

      <section className="card">
        <h3 className="card-title">Recent tickets</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr><th className="th">#</th><th className="th">When</th><th className="th">Category</th><th className="th">Urgency</th><th className="th">Status</th><th className="th">Message</th><th className="th" /></tr>
            </thead>
            <tbody>
              {tickets === null && <tr><td colSpan={7} className="td text-muted">Loading...</td></tr>}
              {tickets === false && <tr><td colSpan={7} className="td text-muted">Couldn&apos;t load ticket history.</td></tr>}
              {tickets && !tickets.length && <tr><td colSpan={7} className="td text-muted">No tickets yet.</td></tr>}
              {tickets && tickets.map((t) => {
                const [label, style] = STATUS_BADGES[t.status] || STATUS_BADGES.new;
                return (
                  <tr key={t.id} className="border-t border-line">
                    <td className="td font-mono">{t.ticket_number}</td>
                    <td className="td whitespace-nowrap text-muted">{new Date(t.created_at).toLocaleString()}</td>
                    <td className="td"><CategoryBadge>{t.category}</CategoryBadge></td>
                    <td className="td"><UrgencyBadge urgency={t.urgency} flagged={t.safety_override} /></td>
                    <td className="td"><span className={`${chip} ${style}`}>{label}</span></td>
                    <td className="td max-w-64 truncate">{t.raw_message}</td>
                    <td className="td text-right"><button type="button" className="btn-outline" onClick={() => reopenTicket(t)}>Reopen</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
