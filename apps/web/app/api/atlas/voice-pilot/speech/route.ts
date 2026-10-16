import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { availableSwedishVoices, streamSwedishSpeech } from '@/lib/atlas/voice-pilot/elevenlabs'
import { ATLAS_SWEDISH_VOICES, isAtlasSwedishVoice } from '@/lib/atlas/voice-pilot/voices'
import { PLATFORM_COMPAT_PROJECT } from '@/lib/cost/governed-spend'
import { GLOBAL_ONLY } from '@/lib/governance/execution-stop'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
const unavailable = () => Response.json({ error: 'Rösttestet är inte tillgängligt här.' }, { status: 404 })
async function guard() {
  if (process.env.VERCEL_ENV !== 'preview' && process.env.NODE_ENV !== 'development') return unavailable()
  const auth = await resolvePlatformOperator()
  if (!auth.ok) return Response.json({ error: 'Logga in som operatör för att prova rösten.' }, { status: auth.reason === 'unauthenticated' ? 401 : 403 })
  return null
}
export async function GET(request: Request) {
  const denial = await guard(); if (denial) return denial
  try {
    const voices = await availableSwedishVoices(request.signal)
    return Response.json({ voices: voices.map(key => ({ key, label: ATLAS_SWEDISH_VOICES[key].label })) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: 'Svenska röster kunde inte hämtas just nu.' }, { status: 503 }) }
}
export async function POST(request: Request) {
  const denial = await guard(); if (denial) return denial
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Ogiltigt ursprung.' }, { status: 403 })
  let value: unknown
  try {
    // Bound actual bytes, not a caller-controlled Content-Length header.
    const reader = request.body?.getReader()
    if (!reader) return Response.json({ error: 'Text krävs.' }, { status: 400 })
    const chunks: Uint8Array[] = []; let size = 0
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break
      size += chunk.value.length
      if (size > 8192) { await reader.cancel(); return Response.json({ error: 'Texten är för lång.' }, { status: 413 }) }
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    value = JSON.parse(new TextDecoder().decode(bytes))
  } catch { return Response.json({ error: 'Ogiltig rösttext.' }, { status: 400 }) }
  const body = value as { text?: unknown; voice?: unknown } | null
  if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 600 || !isAtlasSwedishVoice(body.voice)) {
    return Response.json({ error: 'Välj svensk röst och en text på högst 600 tecken.' }, { status: 400 })
  }
  try { return await streamSwedishSpeech({
    project: PLATFORM_COMPAT_PROJECT, operation: 'Atlas Swedish voice trial',
    // Human operator listening to personal Atlas assistance, not executing a
    // project's work. Project actions retain their existing chat/tool scopes.
    execution: { context: 'OPERATOR_INTERACTIVE', scope: GLOBAL_ONLY },
  }, body.text.trim(), body.voice, request.signal) }
  catch { return Response.json({ error: 'Rösten kunde inte spelas. Kontrollera röståtkomst och budget och försök igen.', code: 'ATLAS_SWEDISH_VOICE_UNAVAILABLE' }, { status: 503 }) }
}
