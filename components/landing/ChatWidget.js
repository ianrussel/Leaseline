"use client";

import { useEffect, useRef, useState } from "react";

// Posts to /api/chat (app/api/chat/route.js), which needs ANTHROPIC_API_KEY set to actually answer;
// without it the error state below shows rather than failing silently.
const GREETING =
  "Hi! I'm here to answer questions about Leaseline - pricing, how the triage works, what's available today vs. on the roadmap, anything like that. What do you want to know?";

const BUBBLE = {
  bot: "self-start bg-surface-2 border border-line",
  user: "self-end bg-accent text-accent-contrast",
  error: "self-start border border-danger text-danger",
  pending: "self-start italic text-muted",
};

export default function ChatWidget({ contactEmail }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([{ role: "bot", text: GREETING }]);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", text }, { role: "pending", text: "Thinking…" }]);

    let reply;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      reply = res.ok ? { role: "bot", text: data.reply } : { role: "error", text: data?.error || "Something went wrong." };
    } catch {
      reply = { role: "error", text: `Could not reach the chat assistant - email ${contactEmail} instead.` };
    }
    setMessages((m) => [...m.filter((x) => x.role !== "pending"), reply]);
    setBusy(false);
    inputRef.current?.focus();
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded="false"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-accent px-4 py-3 font-mono text-sm font-semibold text-accent-contrast shadow-lg hover:bg-accent-hover max-sm:bottom-4 max-sm:right-4"
      >
        <span className="size-2 rounded-full bg-accent-contrast" />
        Ask about Leaseline
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Leaseline chat assistant"
      className="fixed bottom-6 right-6 z-50 flex h-[480px] max-h-[80vh] w-[360px] max-w-[calc(100vw-2rem)] flex-col border border-line bg-surface shadow-xl max-sm:bottom-4 max-sm:right-4"
    >
      <div className="flex items-start justify-between border-b border-line px-4 py-3">
        <div>
          <div className="font-display text-lg font-extrabold tracking-wide">Ask Leaseline</div>
          <div className="font-mono text-[11px] text-muted">Usually replies in a few seconds</div>
        </div>
        <button type="button" aria-label="Close chat" onClick={() => setOpen(false)} className="text-2xl leading-none text-muted hover:text-ink">
          &times;
        </button>
      </div>
      <div ref={listRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] whitespace-pre-wrap px-3 py-2 text-[14.5px] leading-snug ${BUBBLE[m.role]}`}>
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-line p-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          maxLength={2000}
          autoComplete="off"
          placeholder="Ask a question..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          className="field-input"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="bg-accent px-4 font-mono text-sm font-semibold text-accent-contrast hover:bg-accent-hover disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
