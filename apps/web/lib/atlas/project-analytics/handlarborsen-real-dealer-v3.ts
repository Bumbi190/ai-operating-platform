import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import {
  HANDLARBORSEN_PROJECT_ID,
  HANDLARBORSEN_METRICS_URL,
  resolveMetricsCredential,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'

export type RealDealerMetricsV3 =
  | { status: 'available'; observedAt: string; registered: number; verified: number;
      testOrganisations: number; internalOrganisations: number; unclassifiedOrganisations: number }
  | { status: 'unavailable'; reason: 'not_permitted' | 'credential_unavailable' |
      'source_unavailable' | 'invalid_contract' | 'stale' }

const MAX_AGE_MS = 26 * 60 * 60 * 1000
const MAX_BODY_BYTES = 16_384
function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Owner-scoped, fixed-host, aggregate-only v3 read. Never falls back to legacy v1/v2. */
export async function readRealDealerMetricsV3(
  allowedProjectIds: string[],
  now: Date = new Date(),
): Promise<RealDealerMetricsV3> {
  if (!assertProjectAllowed(HANDLARBORSEN_PROJECT_ID, allowedProjectIds))
    return { status: 'unavailable', reason: 'not_permitted' }

  const credential = resolveMetricsCredential()
  if (!credential.ok) return { status: 'unavailable', reason: 'credential_unavailable' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(HANDLARBORSEN_METRICS_URL + '?schema_version=3', {
      method: 'GET',
      headers: { authorization: 'Bearer ' + credential.token, accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (response.status !== 200) return { status: 'unavailable', reason: 'source_unavailable' }
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
      return { status: 'unavailable', reason: 'invalid_contract' }
    const reader = response.body?.getReader()
    if (!reader) return { status: 'unavailable', reason: 'invalid_contract' }
    const chunks: Uint8Array[] = []
    let bytes = 0
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > MAX_BODY_BYTES) return { status: 'unavailable', reason: 'invalid_contract' }
      chunks.push(next.value)
    }
    const body = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
    const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      return { status: 'unavailable', reason: 'invalid_contract' }
    const data = raw as Record<string, unknown>
    const observedAt = data.observed_at
    if (data.status !== 'ok' || data.schema_version !== 3 ||
      data.definition_id !== 'handlarborsen-real-external-v3' ||
      data.data_scope !== 'classified_real_external_dealers' ||
      typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt)))
      return { status: 'unavailable', reason: 'invalid_contract' }
    const skew = now.getTime() - Date.parse(observedAt)
    if (!Number.isFinite(skew) || skew < -60_000 || skew > MAX_AGE_MS)
      return { status: 'unavailable', reason: 'stale' }
    const metrics = data.metrics
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics))
      return { status: 'unavailable', reason: 'invalid_contract' }
    const valueOf = (key: string): unknown => {
      const entry = (metrics as Record<string, unknown>)[key]
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
      const metric = entry as Record<string, unknown>
      return metric.status === 'ok' ? metric.value : null
    }
    const registered = valueOf('companies_registered_total')
    const verified = valueOf('companies_verified_total')
    const tests = data.excluded_test_organisations
    const internal = data.excluded_internal_organisations
    const unknown = data.unclassified_organisations
    if (!nonnegative(registered) || !nonnegative(verified) || verified > registered ||
      !nonnegative(tests) || !nonnegative(internal) || !nonnegative(unknown))
      return { status: 'unavailable', reason: 'invalid_contract' }
    return { status: 'available', observedAt, registered, verified,
      testOrganisations: tests, internalOrganisations: internal, unclassifiedOrganisations: unknown }
  } catch {
    return { status: 'unavailable', reason: 'source_unavailable' }
  } finally {
    clearTimeout(timeout)
  }
}
