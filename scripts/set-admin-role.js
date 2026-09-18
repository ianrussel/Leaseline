#!/usr/bin/env node
// One-off local script to grant/revoke app_metadata.role="admin" on a Supabase user.
//
// Why this exists: the Supabase dashboard's Users page has no editable app_metadata field at
// all - only the Admin API can set it, which needs the service_role key server-side. This is
// that one-off tool, run locally, rather than something built into any page (a page that could
// grant admin access would itself need to be admin-gated, which is circular for the very first
// admin).
//
// Usage (from this folder's parent, i.e. the leaseline repo root):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/set-admin-role.js user@example.com
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/set-admin-role.js user@example.com --revoke
//
// Both env vars are already in your .env - e.g.:
//   set -a && source .env && set +a && node scripts/set-admin-role.js user@example.com

import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [, , email, flag] = process.argv;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !email) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/set-admin-role.js <email> [--revoke]");
  process.exit(1);
}

// createClient() initializes a Realtime client internally regardless of whether it's used (not
// used here at all) - on Node < 22 (no native WebSocket) that init throws unless a WebSocket
// implementation is supplied explicitly. Same fix as api/_lib/auth.js.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { realtime: { transport: ws } });

// listUsers() paginates (50/page by default) - fine at this project's current scale (a handful
// of users); would need to page through if that ever changes.
const { data, error } = await supabase.auth.admin.listUsers();
if (error) {
  console.error("Failed to list users:", error.message);
  process.exit(1);
}

const user = data.users.find((u) => u.email === email);
if (!user) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}

const revoke = flag === "--revoke";
const newAppMetadata = { ...user.app_metadata };
if (revoke) {
  delete newAppMetadata.role;
} else {
  newAppMetadata.role = "admin";
}

const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
  app_metadata: newAppMetadata,
});

if (updateError) {
  console.error("Failed to update user:", updateError.message);
  process.exit(1);
}

console.log(
  `${revoke ? "Revoked" : "Granted"} admin role for ${email} (id: ${user.id}). ` +
  `They need to sign out and back in on admin.html for it to take effect.`
);
