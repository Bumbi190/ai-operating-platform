import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { createClient } from '@/lib/supabase/server'
import { atlasVoiceLiveEnabled, atlasVoicePreviewEnabled } from './deployment'

const previewUnavailable = () => Response.json({ error: 'Rösttestet är inte tillgängligt här.' }, { status: 404 })
export async function resolveAtlasVoiceAccess(options: { expectedUserId?: string; strict?: boolean } = {}): Promise<Response | { userId: string }> {
  if (!atlasVoicePreviewEnabled() && !atlasVoiceLiveEnabled()) return previewUnavailable()
  const strict = options.strict || atlasVoiceLiveEnabled()
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  const unavailable = () => Response.json({
    error: 'Åtkomstkontrollen svarade inte. Försök igen om en stund.',
    code: 'ATLAS_VOICE_AUTH_UNAVAILABLE',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  // Reads only inside the race. A late auth result can never dispatch paid work.
  const authorize = async () => {
    const auth = await resolvePlatformOperator()
    if (!auth.ok) return Response.json({ error: 'Logga in som operatör för att prova rösten.' }, { status: auth.reason === 'unauthenticated' ? 401 : 403 })
    if (options.expectedUserId && auth.userId !== options.expectedUserId) return Response.json({ error: 'Forbidden' }, { status: 403 })
    const db = await createClient()
    const { data: membership, error: membershipError } = await (db as any)
      .from('omnira_organization_memberships').select('role, revoked_at')
      .eq('user_id', auth.userId).maybeSingle()
    if (strict && membershipError) return unavailable()
    if (strict && membership?.revoked_at) return Response.json({ error: 'Forbidden' }, { status: 403 })
    // Preserve middleware containment, including legacy verified owners.
    // An allowlisted operator email never overrides collaborator revocation.
    if (membershipError || !membership || membership.revoked_at !== null && membership.role !== 'collaborator') {
      const { data: owned, error: ownershipError } = await db.from('projects')
        .select('id').eq('owner_id', auth.userId).limit(1)
      if (strict && ownershipError) return unavailable()
      if (ownershipError || !owned?.length) return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!membershipError && membership?.role === 'collaborator') return Response.json({ error: 'Forbidden' }, { status: 403 })
    return { userId: auth.userId }
  }
  let result: Response | { userId: string }
  try {
    result = await Promise.race([authorize(), new Promise<Response>(resolve => {
      timer = setTimeout(() => resolve(unavailable()), 5000)
    })])
  } catch { result = unavailable() }
  finally { clearTimeout(timer) }
  console.info('[atlas-voice-access]', { elapsedMs: Date.now() - startedAt, status: result instanceof Response ? result.status : 200 })
  return result
}

/** Existing batch/probe interface and legacy containment remain compatible. */
export async function guardAtlasVoiceAccess() {
  const result = await resolveAtlasVoiceAccess()
  return result instanceof Response ? result : null
}
