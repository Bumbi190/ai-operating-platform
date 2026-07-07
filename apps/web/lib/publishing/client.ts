/**
 * lib/publishing/client.ts
 *
 * Per-destination Supabase service-client factory.
 *
 * Deliberately NOT lib/supabase/admin.createAdminClient() — that one is hardwired
 * to Omnira's own project. A publishing destination is a *different* database
 * (e.g. The Prompt). Each destination supplies its own env var names, so adding
 * a destination never touches this file.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SupabaseDestinationEnv {
  /** Name of the env var holding the destination project URL. */
  urlEnv: string
  /** Name of the env var holding the destination service-role key. */
  keyEnv: string
}

/**
 * Build a service-role client for a destination project.
 * Guards: required env present, and the URL is NOT Omnira's own project
 * (so a misconfiguration can never write into the control-plane DB).
 */
export function createDestinationClient({ urlEnv, keyEnv }: SupabaseDestinationEnv): SupabaseClient {
  const url = process.env[urlEnv]
  const key = process.env[keyEnv]

  if (!url || !key) {
    throw new Error(
      `[publishing] Missing destination credentials: set ${urlEnv} and ${keyEnv} in the environment.`,
    )
  }

  const omniraUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (omniraUrl && url === omniraUrl) {
    throw new Error(
      `[publishing] Destination ${urlEnv} points at Omnira's own Supabase URL — ` +
      `refusing to publish into the control-plane database.`,
    )
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Force fresh reads/writes; never serve from Next/Vercel data cache.
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}
