// Server-only Supabase client with the publishable (anon) key — no session, no
// service role. Public endpoints use it to call the anon-granted RPCs, so they
// work wherever the site itself works (SUPABASE_SERVICE_ROLE_KEY not required).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let _client: ReturnType<typeof create> | undefined;

function create() {
  const url = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("supabase_not_configured");

  // New-style keys (sb_publishable_…) are not JWTs and must not go in Authorization.
  const opaque = key.startsWith("sb_publishable_");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (opaque && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export function getPublicSupabase() {
  if (!_client) _client = create();
  return _client;
}

/**
 * A client acting as the signed-in staff member behind `token` (their Supabase JWT),
 * so RLS and is_admin() apply to them. Needs only the public key, like the site itself.
 */
export function userSupabase(token: string) {
  const url = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("supabase_not_configured");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
  });
}
