import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { createClient } from '@/lib/supabase/server'

const previewUnavailable = () => Response.json({ error: 'Rösttestet är inte tillgängligt här.' }, { status: 404 })
export async function guardAtlasVoiceAccess() {
  if (process.env.VERCEL_ENV !== 'preview' && process.env.NODE_ENV !== 'development') return previewUnavailable()
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
    const db = await createClient()
    const { data: membership, error: membershipError } = await (db as any)
      .from('omnira_organization_memberships').select('role, revoked_at')
      .eq('user_id', auth.userId).maybeSingle()
    // Preserve middleware containment, including legacy verified owners.
    // An allowlisted operator email never overrides collaborator revocation.
    if (membershipError || !membership || membership.revoked_at !== null && membership.role !== 'collaborator') {
      const { data: owned, error: ownershipError } = await db.from('projects')
        .select('id').eq('owner_id', auth.userId).limit(1)
      if (ownershipError || !owned?.length) return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!membershipError && membership?.role === 'collaborator') return Response.json({ error: 'Forbidden' }, { status: 403 })
    return null
  }
  let result: Response | null
  try {
    result = await Promise.race([authorize(), new Promise<Response>(resolve => {
      timer = setTimeout(() => resolve(unavailable()), 5000)
    })])
  } catch { result = unavailable() }
  finally { clearTimeout(timer) }
  console.info('[atlas-voice-access]', { elapsedMs: Date.now() - startedAt, status: result?.status ?? 200 })
  return result
}
