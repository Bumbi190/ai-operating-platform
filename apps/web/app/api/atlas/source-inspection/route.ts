/**
 * Preview-only Nova code observation. A deliberate POST by the platform operator,
 * NOT a model tool or a code-broker execution authority.
 *
 * Gate order: preview flag -> same-origin -> operator -> scoped project ->
 * pinned GitHub App -> verified repository id -> immutable SHA -> safe text.
 */
import { NextResponse } from 'next/server'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertProjectAllowed, getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'
import { parseSourceRequest } from '@/lib/atlas/source-inspection/policy'
import { inspectVerifiedSource } from '@/lib/atlas/source-inspection/github'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
function reply(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS })
}

async function boundedInput(request: Request): Promise<unknown> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return null
  const len = request.headers.get('content-length')
  if (len && (!/^\d+$/.test(len) || Number(len) > 768)) return null
  const reader = request.body?.getReader()
  if (!reader) return null
  let length = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > 768) {
      void reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  try {
    const str = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks.map(c => Buffer.from(c))),
    )
    return JSON.parse(str) as unknown
  } catch { return null }
}

export async function POST(request: Request) {
  // No production activation, even with a mistakenly copied pilot env value.
  if (process.env.VERCEL_ENV !== 'preview' || process.env.ATLAS_SOURCE_INSPECTION_MODE !== 'pilot') {
    return reply({ error: 'not_available' }, 404)
  }
  let target: URL
  try { target = new URL(request.url) }
  catch { return reply({ error: 'bad_origin' }, 403) }
  if (target.protocol !== 'https:' || request.headers.get('origin') !== target.origin) {
    return reply({ error: 'bad_origin' }, 403)
  }

  const operator = await resolvePlatformOperator()
  if (!operator.ok) return reply({ error: 'not_authorized' }, operator.reason === 'unauthenticated' ? 401 : 403)

  const input = parseSourceRequest(await boundedInput(request))
  if (!input) return reply({ error: 'invalid_request' }, 400)
  const db = createAdminClient()
  const allowedIds = await getAllowedProjectIds(db, operator.userId)
  if (allowedIds.length === 0) return reply({ error: 'not_found' }, 404)

  // Caller-supplied slug is NOT proof of ownership. Filter in the query itself.
  let sourceProjectId: string | null = null
  try {
    const { data, error } = await db.from('projects').select('id')
      .eq('slug', input.projectSlug)
      .in('id', scopeProjectFilter(allowedIds))
      .maybeSingle()
    if (error) return reply({ error: 'not_available' }, 503)
    sourceProjectId = typeof data?.id === 'string' ? data.id : null
  } catch { return reply({ error: 'not_available' }, 503) }
  if (!assertProjectAllowed(sourceProjectId, allowedIds)) return reply({ error: 'not_found' }, 404)

  const result = await inspectVerifiedSource(input)
  if (!result.ok) return reply({ error: result.code },
    result.code === 'source_denied' ? 422 : result.code === 'source_changed' ? 409 : 503)
  return reply({ ...result, policy: 'nova.source.read.v1' }, 200)
}
