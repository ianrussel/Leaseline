"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronDown, CreditCard, Menu, Wrench } from "lucide-react";
import { getSupabase } from "@/lib/supabase-client";
import { Wordmark } from "./LoginScreen";

// Sidebar + topbar shared by /dashboard and /admin. `menuItems` are extra account-menu buttons
// (e.g. cancel/renew subscription) shown above "Sign out".
export default function AppShell({ title, active, email, showTrainingReview, menuItems = null, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  const navLink = (isActive) =>
    `flex items-center gap-2.5 px-4 py-2.5 text-sm ${isActive ? "bg-accent text-accent-contrast" : "text-ink hover:bg-surface-2"}`;

  return (
    <div className="flex min-h-screen">
      <aside className={`${sidebarOpen ? "block" : "hidden"} w-56 shrink-0 border-r border-line bg-surface md:block`}>
        <div className="flex h-14 items-center border-b border-line px-4 text-lg">
          <Wrench size={18} className="mr-2" />
          <Wordmark />
        </div>
        <nav className="py-3">
          <div className="px-4 pb-1 font-mono text-[11px] uppercase tracking-wider text-muted">General</div>
          <Link href="/dashboard" className={navLink(active === "triage")}>
            <Wrench size={16} /> Triage
          </Link>
          {showTrainingReview && (
            <Link href="/admin" className={navLink(active === "admin")}>
              <Check size={16} /> Training review
            </Link>
          )}
          <span className="flex cursor-not-allowed items-center gap-2.5 px-4 py-2.5 text-sm text-muted" title="Not built yet - Stripe is on hold">
            <CreditCard size={16} /> Billing
          </span>
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-4">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Toggle menu" className="md:hidden" onClick={() => setSidebarOpen((v) => !v)}>
              <Menu size={20} />
            </button>
            <h2 className="hidden font-mono text-base font-semibold md:block">{title}</h2>
          </div>
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-2 text-ink"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              <span className="max-w-40 truncate font-mono text-xs text-muted">{email}</span>
              <ChevronDown size={14} />
            </button>
            {menuOpen && (
              <ul className="absolute right-0 top-full z-20 mt-2 min-w-48 border border-line bg-surface-2 py-1 shadow-lg">
                {menuItems}
                <li>
                  <button type="button" className="menu-item" onClick={() => getSupabase().auth.signOut()}>
                    Sign out
                  </button>
                </li>
              </ul>
            )}
          </div>
        </header>
        <main className="flex flex-col gap-4 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
