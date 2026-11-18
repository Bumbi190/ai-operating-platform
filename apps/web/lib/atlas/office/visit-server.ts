import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createVisitHandlers, type VisitRPC } from './visits'

export const officeVisitHandlers = createVisitHandlers({
  async owner() {
    const client = await createClient()
    const user = await client.auth.getUser()
    if (user.error || !user.data.user) return null
    const claims = await client.auth.getClaims()
    if (claims.error || !claims.data || claims.data.claims.sub !== user.data.user.id
        || claims.data.claims.role !== 'authenticated' || typeof claims.data.claims.session_id !== 'string') return null
    return { ownerId: user.data.user.id, sessionId: claims.data.claims.session_id }
  },
  async rpc(name, args) {
    // Only these three reviewed functions, until generated database types are updated.
    const db = createAdminClient()
    const call = db.rpc.bind(db) as unknown as (name: VisitRPC, args: Record<string, string | null>) => Promise<{ data: unknown; error: unknown }>
    const result = await call(name, args)
    if (result.error) throw new Error('Office metadata unavailable')
    return result.data
  },
})
