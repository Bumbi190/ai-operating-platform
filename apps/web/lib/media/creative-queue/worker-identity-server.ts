/**
 * SERVER-ONLY construction boundary. Not imported by any public route and
 * not enabled in production until operator-controlled enrollment and schema
 * review. Service-role credentials stay on the server, never on media worker.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  makeCreativeIdentityDbAdapter,
  type CreativeIdentityDb,
} from './worker-identity-adapter'

export function createDormantCreativeWorkerIdentityDeps() {
  // The generated database.types.ts intentionally lacks the unapplied P10
  // schema. Cast only at this boundary; remove after schema is reviewed,
  // migrated in staging and generated Supabase types have been regenerated.
  const db = createAdminClient() as unknown as CreativeIdentityDb
  return makeCreativeIdentityDbAdapter(db)
}
