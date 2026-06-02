import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * Service-role Supabase client — bypasses RLS, no cookies needed.
 * Use ONLY in server-side background execution (run engine, cron workers).
 * NEVER expose to client or use in user-facing API routes without careful auth checks.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Add them to apps/web/.env.local',
    )
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // VIKTIGT: tvinga 'no-store' på ALLA admin-anrop.
      // Next.js/Vercel Data Cache cachar annars Supabase GET-svar (t.ex.
      // platform_tokens) och serverar gamla värden — ett dött Instagram-token
      // (EAAW) levde kvar i cachen trots att DB-raden uppdaterats till IGAA,
      // och redeploys rensar inte Data Cache. Service-role-läsningar måste
      // alltid vara färska.
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}
