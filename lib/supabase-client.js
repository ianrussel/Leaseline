"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

// PUBLIC anon key + project URL - safe in client code by design (Supabase's protection model is auth +
// row-level security, not hiding this key). Never put the service_role key here; that one is
// server-side only (lib/server/auth.js). Env vars override the defaults if the project ever moves.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://pgoritqbhawsboikmrcz.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_s9yAHvQxKgym0hY0e16xaA_DP6__mJj";

let client;
export function getSupabase() {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

export async function authedFetch(url, options = {}) {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      ...(options.headers || {}),
    },
  });
}

// undefined = still checking, null = signed out, object = signed in.
export function useSession() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export const isAdmin = (session) => session?.user?.app_metadata?.role === "admin";
