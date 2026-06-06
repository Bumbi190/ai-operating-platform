/**
 * PR-0 / leak-harness — the three client roles, matching the real app clients.
 *
 *  - service() : service-role (bypasses RLS). Used ONLY for seed/teardown and for the
 *                negative self-test (proving B's data exists / is visible to admin).
 *  - asUser(t) : RLS-respecting client acting AS a signed-in user (Bearer access token).
 *                This is the primary leak-test vehicle — it must NOT see other projects.
 *  - anon()    : anon client with no session — must see nothing tenant-scoped.
 *
 * Measurement only. Authored in PR-0; runs against the Supabase test branch.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function service(): SupabaseClient {
  return createClient(URL, SERVICE, { auth: { persistSession: false } });
}

export function anon(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false } });
}

/** RLS-respecting client that carries a user's access token (acts as that user). */
export function asUser(accessToken: string): SupabaseClient {
  return createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function haveEnv(): boolean {
  return Boolean(URL && ANON && SERVICE);
}
