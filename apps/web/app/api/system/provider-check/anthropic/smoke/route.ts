import { NextResponse } from 'next/server'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { getAnthropic, estimateAnthropicSek } from '@/lib/ai/anthropic'
import { isSpendGateEnforced } from '@/lib/cost/spend-gate-flag'
import { getRates } from '@/lib/cost/rates'
import { PLATFORM_COMPAT_PROJECT, SpendRefusedError } from '@/lib/cost/governed-spend'
import { GLOBAL_ONLY } from '@/lib/governance/execution-stop'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 20

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'same-origin',
}
const model = 'claude-haiku-4-5-20251001' as const
const maxTokens = 24
const hardCeilingSek = 3
// Deliberately ONE lifetime spend identity, not a fresh key per click/day.
const oneShotKey = 'omnira-anthropic-production-smoke-20261023-v1'
const prompt = {
  model,
  max_tokens: maxTokens,
  system: 'Respond with only the uppercase word READY.',
  messages: [{ role: 'user' as const, content: 'Give the required one-word status.' }],
}

function json(status: string, httpStatus: number, info: Record<string, unknown> = {}) {
  return NextResponse.json(
    { provider: 'anthropic', status, ...info },
    { status: httpStatus, headers },
  )
}
async function operatorAllowed() {
  const operator = await resolvePlatformOperator()
  if (!operator.ok) return {
    response: json('access_denied', operator.reason === 'unauthenticated' ? 401 : 403),
  }
  return { response: null }
}

/** Static owner-only page. Reading it cannot cause inference or any spend. */
export async function GET() {
  const access = await operatorAllowed()
  if (access.response) return access.response
  const html = `<!doctype html><html lang="sv"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Anthropic — engångstest</title></head><body style="max-width:650px;margin:8vh auto;padding:24px;font:16px system-ui;line-height:1.5;background:#0a1521;color:#f2f6fa">
<h1>Anthropic – litet engångstest</h1>
<p>Omnira gör högst ett budgetstyrt anrop till Claude Haiku med ett fast, kort meddelande. Inga nyhetsjobb, publiceringar, Dream-cykler eller videogenereringar startas.</p>
<p>Testet använder Omniras ordinarie budgetgräns och kräver att den är strikt aktiverad. Maximal reserverad kostnad: 3 SEK. Den verkliga kostnaden för ett kort svar väntas vara avsevärt lägre. Samma engångsidentitet används för alla försök och ett genomfört anrop kan inte beställas igen.</p>
<form method="POST"><button type="submit" style="font:inherit;background:#17b7c6;color:#03151b;border:0;border-radius:6px;padding:13px 18px;cursor:pointer">Kör ett budgetstyrt AI-test</button></form>
<p>Efter testet visas enbart teknisk status och antal tokens, aldrig API-nycklar eller leverantörens råsvar.</p>
</body></html>`
  return new Response(html, { status: 200, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } })
}

/** One explicit action, with a pinned single spend identity. */
export async function POST(request: Request) {
  const access = await operatorAllowed()
  if (access.response) return access.response

  // Neither cross-site forms nor caller-controlled model/prompt/options are allowed.
  const expectedOrigin = new URL(request.url).origin
  if (request.headers.get('origin') !== expectedOrigin) return json('access_denied', 403)
  if (Number(request.headers.get('content-length') ?? '0') > 0) {
    return json('invalid_request', 400)
  }
  const submitted = await request.text()
  if (submitted.length > 0) return json('invalid_request', 400)
  if (!isSpendGateEnforced()) return json('budget_gate_not_enforced', 503)

  try {
    const estimatedSek = await estimateAnthropicSek(prompt, await getRates())
    if (!Number.isFinite(estimatedSek) || estimatedSek <= 0 || estimatedSek > hardCeilingSek) {
      return json('cost_ceiling_refused', 503)
    }

    const client = getAnthropic({
      project: PLATFORM_COMPAT_PROJECT,
      execution: { context: 'OPERATOR_INTERACTIVE', scope: GLOBAL_ONLY },
      agent: 'Provider Diagnostics',
      operation: 'Anthropic Production Smoke',
      idempotencyKey: oneShotKey,
    })
    const answer = await client.messages.create(prompt)
    const generated = answer.content.filter(item => item.type === 'text').map(item => item.text).join('').trim()
    const usage = answer.usage
    const verified = answer.stop_reason === 'end_turn'
      && generated.length > 0
      && Number.isInteger(usage.input_tokens) && usage.input_tokens > 0
      && Number.isInteger(usage.output_tokens) && usage.output_tokens > 0
    return json(verified ? 'inference_verified' : 'inference_incomplete', verified ? 200 : 502, {
      inferenceVerified: verified,
      billableGenerationPerformed: true,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      model,
    })
  } catch (error) {
    if (error instanceof SpendRefusedError) return json('spend_refused', 409)
    // Never log/serialize the raw SDK error, request, provider text or API key.
    return json('provider_unavailable', 503)
  }
}
