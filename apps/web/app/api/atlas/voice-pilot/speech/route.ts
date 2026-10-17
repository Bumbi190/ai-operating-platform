import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { createClient } from '@/lib/supabase/server'
import { availableSwedishVoices, streamSwedishSpeech } from '@/lib/atlas/voice-pilot/elevenlabs'
import { ATLAS_SWEDISH_VOICES, isAtlasSwedishVoice } from '@/lib/atlas/voice-pilot/voices'
import { PLATFORM_COMPAT_PROJECT } from '@/lib/cost/governed-spend'
import { GLOBAL_ONLY } from '@/lib/governance/execution-stop'
import { transcribeAtlasSwedishPcm } from '@/lib/media/elevenlabs'
import { PCM_MAX_BYTES } from '@/lib/atlas/voice-pilot/pcm'

// Supabase is eu-west-1: avoid transatlantic auth/context/budget round trips.
export const preferredRegion = 'dub1'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
const previewUnavailable = () => Response.json({ error: 'Rösttestet är inte tillgängligt här.' }, { status: 404 })
async function guard() {
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
export async function GET(request: Request) {
  const denial = await guard(); if (denial) return denial
  try {
    const voices = await availableSwedishVoices(request.signal)
    return Response.json({ voices: voices.map(key => ({ key, label: ATLAS_SWEDISH_VOICES[key].label })) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: 'Svenska röster kunde inte hämtas just nu.' }, { status: 503 }) }
}
export async function POST(request: Request) {
  const startedAt = Date.now()
  // Numeric timing only: never log prompts, transcripts, PCM, credentials or provider errors.
  const measure = (stage: 'transcription' | 'speech_headers', outcome: 'ok' | 'failed', units: { audioMs?: number; characters?: number }) => {
    const elapsedMs = Date.now() - startedAt
    const hint = request.headers.get('x-atlas-voice-end')
    const endReason = hint === 'pause' || hint === 'manual' || hint === 'limit' ? hint : 'unknown'
    console.info('[atlas-voice-trial]', { stage, outcome, elapsedMs, ...units, ...(stage === 'transcription' ? { endReason } : {}) })
    return elapsedMs
  }
  const denial = await guard(); if (denial) return denial
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Ogiltigt ursprung.' }, { status: 403 })
  const audio = request.headers.get('content-type')?.split(';')[0].trim() === 'audio/pcm'
  let bytes: Uint8Array
  try {
    // Bound actual bytes, not a caller-controlled Content-Length header.
    const reader = request.body?.getReader()
    if (!reader) return Response.json({ error: 'Text krävs.' }, { status: 400 })
    const chunks: Uint8Array[] = []; let size = 0
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break
      size += chunk.value.length
      if (size > (audio ? PCM_MAX_BYTES : 8192)) { await reader.cancel(); return Response.json({ error: audio ? 'Inspelningen är för lång.' : 'Texten är för lång.' }, { status: 413 }) }
      chunks.push(chunk.value)
    }
    bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  } catch { return Response.json({ error: 'Ogiltig rösttext.' }, { status: 400 }) }
  if (audio) {
    if (bytes.length < 3200 || bytes.length % 2) return Response.json({ error: 'Inspelningen kunde inte läsas.' }, { status: 400 })
    try {
      const text = await transcribeAtlasSwedishPcm({ project: PLATFORM_COMPAT_PROJECT, operation: 'Atlas Swedish transcription trial',
        // Personal operator input, before any chat/project tool is executed.
        execution: { context: 'OPERATOR_INTERACTIVE', scope: GLOBAL_ONLY },
      }, bytes, request.signal)
      const elapsedMs = measure('transcription', 'ok', { audioMs: bytes.length / 32 })
      return Response.json({ text }, { headers: { 'Cache-Control': 'no-store', 'Server-Timing': 'atlas_transcription;dur=' + elapsedMs } })
    } catch {
      measure('transcription', 'failed', { audioMs: bytes.length / 32 })
      return Response.json({ error: 'Talet kunde inte tolkas. Kontrollera åtkomst och budget eller försök igen.', code: 'ATLAS_TRANSCRIPTION_UNAVAILABLE' }, { status: 503 }) }
  }
  let value: unknown
  try { value = JSON.parse(new TextDecoder().decode(bytes)) }
  catch { return Response.json({ error: 'Ogiltig rösttext.' }, { status: 400 }) }
  const body = value as { text?: unknown; voice?: unknown } | null
  if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 600 || !isAtlasSwedishVoice(body.voice)) {
    return Response.json({ error: 'Välj svensk röst och en text på högst 600 tecken.' }, { status: 400 })
  }
  try {
    const response = await streamSwedishSpeech({
      project: PLATFORM_COMPAT_PROJECT, operation: 'Atlas Swedish voice trial',
      // Human operator listening to personal Atlas assistance, not executing a
      // project's work. Project actions retain their existing chat/tool scopes.
      execution: { context: 'OPERATOR_INTERACTIVE', scope: GLOBAL_ONLY },
    }, body.text.trim(), body.voice, request.signal)
    const elapsedMs = measure('speech_headers', 'ok', { characters: body.text.trim().length })
    response.headers.set('Server-Timing', 'atlas_speech_headers;dur=' + elapsedMs)
    return response
  }
  catch {
    measure('speech_headers', 'failed', { characters: body.text.trim().length })
    return Response.json({ error: 'Rösten kunde inte spelas. Kontrollera röståtkomst och budget och försök igen.', code: 'ATLAS_SWEDISH_VOICE_UNAVAILABLE' }, { status: 503 }) }
}
