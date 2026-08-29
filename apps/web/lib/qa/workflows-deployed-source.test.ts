/**
 * Read-only deployed-source verification.
 *
 * The incident this exists for: the shared manifest was merged and the objects
 * uploaded, but one consumer was never redeployed. The gate said YES while the
 * allowlist said NO. So the tests weigh heavily on partial drift — one current,
 * one stale — and on never reading a partial success as a pass.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import {
  MANIFEST_CONSUMERS, checkConsumerCurrent, checkConsumersInSync,
  checkDeployedManifestMatchesExpected, readAllConsumers, readDeployedFunction,
  verifyDeployedSource, type ConsumerReport,
} from '@/lib/workflows/adapters/familje-stunden/deployed-source'
import { findCheck } from '@/lib/workflows/adapters/familje-stunden/checks'
import { CRITICAL_CHECK_KEYS, severityFor } from '@/lib/workflows/escalation'
import { familjeStundenAdapter } from '@/lib/workflows/adapters/familje-stunden'

const NOW = '2026-10-20T12:00:00.000Z'

/** A deployed manifest body. Two consumers built from one commit are identical. */
const manifestBody = (months = ['2026-08', '2026-09', '2026-10']) =>
  `export const PROTECTED_ASSETS: Record<string, Record<string, string>> = {\n` +
  months.map(m => `  "${m}": {\n    mp3: "x/${m}.mp3",\n  },`).join('\n') +
  `\n};\n`

const HASH = (s: string) => createHash('sha256').update(s).digest('hex')

function fnResponse(over: Record<string, unknown> = {}, body = manifestBody()) {
  return {
    version: 8, status: 'ACTIVE', verify_jwt: true, ezbr_sha256: 'a'.repeat(64),
    files: [
      { name: 'functions/sign-protected-asset/index.ts', content: '// entry' },
      { name: 'functions/_utils/protectedManifest.ts', content: body },
    ],
    ...over,
  }
}
const ok = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 })

function withCreds() {
  process.env.FAMILJE_STUNDEN_MANAGEMENT_TOKEN = 'not-a-real-token'
  process.env.FAMILJE_STUNDEN_PROJECT_REF = 'testref'
}
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.FAMILJE_STUNDEN_MANAGEMENT_TOKEN
  delete process.env.FAMILJE_STUNDEN_PROJECT_REF
  delete process.env.FAMILJE_STUNDEN_EXPECTED_MANIFEST_SHA256
})

/** Build reports directly, so drift shapes are expressed without HTTP. */
const report = (slug: string, body: string, over: Record<string, unknown> = {}): ConsumerReport => ({
  slug,
  read: {
    ok: true,
    facts: {
      slug, version: 8, status: 'ACTIVE', verifyJwt: true, bundleHash: 'a'.repeat(64),
      manifestHash: HASH(body), manifestMonthKeys: ['2026-08', '2026-09', '2026-10'],
      observedAt: NOW, ...over,
    },
  },
})
const failedReport = (slug: string, failure: string): ConsumerReport => ({
  slug, read: { ok: false, failure: failure as never, detail: 'd' },
})

// ── Consumer set ─────────────────────────────────────────────────────────────

describe('the canonical consumer set', () => {
  it('matches the Familje-Stunden verification script', () => {
    expect([...MANIFEST_CONSUMERS]).toEqual(['sign-protected-asset', 'get-protected-ebook'])
  })
})

// ── E. Shared-consumer drift ─────────────────────────────────────────────────

describe('shared manifest consumer agreement', () => {
  const CURRENT = manifestBody()
  const STALE = manifestBody(['2026-08', '2026-09'])   // October never deployed

  it('PASSES when both consumers carry an identical manifest', () => {
    const e = checkConsumersInSync(
      [report('sign-protected-asset', CURRENT), report('get-protected-ebook', CURRENT)], NOW)
    expect(e.result).toBe('pass')
  })

  it('FAILS when the FIRST is current and the second is stale', () => {
    const e = checkConsumersInSync(
      [report('sign-protected-asset', CURRENT), report('get-protected-ebook', STALE)], NOW)
    expect(e.result).toBe('fail')
    expect(e.observed).toMatch(/DISAGREE/)
  })

  it('FAILS when the SECOND is current and the first is stale', () => {
    // The symmetric case. A verifier that checked only one would pass here.
    const e = checkConsumersInSync(
      [report('sign-protected-asset', STALE), report('get-protected-ebook', CURRENT)], NOW)
    expect(e.result).toBe('fail')
  })

  it('PASSES when both are stale in the SAME way — agreement is not currency', () => {
    // Deliberate: this check answers "were they deployed together", not "are
    // they right". `deployed_manifest_matches_expected` answers the second.
    const e = checkConsumersInSync(
      [report('sign-protected-asset', STALE), report('get-protected-ebook', STALE)], NOW)
    expect(e.result).toBe('pass')
  })

  it('never passes on a partial read — one match proves nothing about the other', () => {
    const e = checkConsumersInSync(
      [report('sign-protected-asset', CURRENT), failedReport('get-protected-ebook', 'service_unavailable')], NOW)
    expect(e.result).toBe('blocked')
    expect(e.result).not.toBe('pass')
  })

  it('a consumer deployed without the shared manifest is an authoritative FAIL', () => {
    const e = checkConsumersInSync(
      [report('sign-protected-asset', CURRENT), failedReport('get-protected-ebook', 'manifest_absent')], NOW)
    expect(e.result).toBe('fail')
    expect(e.failure_kind).toBe('authoritative_fail')
  })

  it('a missing credential is blocked, never pass and never fail', () => {
    const e = checkConsumersInSync(
      [failedReport('sign-protected-asset', 'credential_missing'),
       failedReport('get-protected-ebook', 'credential_missing')], NOW)
    expect(e.result).toBe('blocked')
    expect(e.failure_kind).toBe('credential_missing')
  })
})

// ── Expected-hash comparison ─────────────────────────────────────────────────

describe('deployed manifest vs pinned expectation', () => {
  const BODY = manifestBody()

  it('is blocked when nothing is pinned — never inferred from local source', () => {
    const e = checkDeployedManifestMatchesExpected([report('a', BODY), report('b', BODY)], NOW)
    expect(e.result).toBe('blocked')
    expect(e.detail.missing_config).toBe('FAMILJE_STUNDEN_EXPECTED_MANIFEST_SHA256')
  })

  it('PASSES when every consumer matches the pin', () => {
    process.env.FAMILJE_STUNDEN_EXPECTED_MANIFEST_SHA256 = HASH(BODY)
    const e = checkDeployedManifestMatchesExpected([report('a', BODY), report('b', BODY)], NOW)
    expect(e.result).toBe('pass')
  })

  it('FAILS when the pin moved — old deployed source is now stale', () => {
    process.env.FAMILJE_STUNDEN_EXPECTED_MANIFEST_SHA256 = HASH(manifestBody(['2026-11']))
    const e = checkDeployedManifestMatchesExpected([report('a', BODY), report('b', BODY)], NOW)
    expect(e.result).toBe('fail')
    expect(e.observed).toMatch(/2 consumer\(s\) deployed with a different manifest/)
  })

  it('FAILS naming only the stale consumer when one matches', () => {
    process.env.FAMILJE_STUNDEN_EXPECTED_MANIFEST_SHA256 = HASH(BODY)
    const e = checkDeployedManifestMatchesExpected(
      [report('sign-protected-asset', BODY), report('get-protected-ebook', manifestBody(['2026-08']))], NOW)
    expect(e.result).toBe('fail')
    expect(e.observed).toMatch(/get-protected-ebook/)
  })
})

// ── Per-consumer currency ────────────────────────────────────────────────────

describe('per-consumer currency', () => {
  const BODY = manifestBody()

  it('passes an active, JWT-verified consumer', () => {
    expect(checkConsumerCurrent(report('sign-protected-asset', BODY), 'k', NOW).result).toBe('pass')
  })

  it('a version bump with the SAME manifest is not drift', () => {
    // A redeploy of unchanged code is routine; only content decides.
    const a = checkConsumerCurrent(report('x', BODY, { version: 8 }), 'k', NOW)
    const b = checkConsumerCurrent(report('x', BODY, { version: 9 }), 'k', NOW)
    expect(a.result).toBe('pass')
    expect(b.result).toBe('pass')
    expect((a.detail as { manifest_sha256: string }).manifest_sha256)
      .toBe((b.detail as { manifest_sha256: string }).manifest_sha256)
  })

  it('FAILS when verify_jwt is off — that is an exposure, not a config nit', () => {
    const e = checkConsumerCurrent(report('x', BODY, { verifyJwt: false }), 'k', NOW)
    expect(e.result).toBe('fail')
    expect(e.observed).toMatch(/WITHOUT verify_jwt/)
  })

  it('FAILS when the function is not ACTIVE', () => {
    expect(checkConsumerCurrent(report('x', BODY, { status: 'REMOVED' }), 'k', NOW).result).toBe('fail')
  })

  it('a timeout is blocked, never pass', () => {
    expect(checkConsumerCurrent(failedReport('x', 'network_timeout'), 'k', NOW).result).toBe('blocked')
  })

  it('a malformed response is an error, never pass', () => {
    expect(checkConsumerCurrent(failedReport('x', 'malformed_response'), 'k', NOW).result).toBe('error')
  })
})

// ── Reader ───────────────────────────────────────────────────────────────────

describe('the deployed reader', () => {
  it('reports credential_missing without configuration', async () => {
    const r = await readDeployedFunction('sign-protected-asset', NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure).toBe('credential_missing')
  })

  it('issues GET only, to the Management API, with a bearer token', async () => {
    withCreds()
    const calls: { url: string; init: RequestInit }[] = []
    const r = await readDeployedFunction('sign-protected-asset', NOW, {
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init }); return ok(fnResponse())
      }) as unknown as typeof fetch,
    })
    expect(r.ok).toBe(true)
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url).toBe('https://api.supabase.com/v1/projects/testref/functions/sign-protected-asset')
  })

  it('hashes the DEPLOYED manifest, not anything local', async () => {
    withCreds()
    const body = manifestBody()
    const r = await readDeployedFunction('x', NOW, {
      fetchImpl: (async () => ok(fnResponse({}, body))) as unknown as typeof fetch,
    })
    expect(r.ok && r.facts.manifestHash).toBe(HASH(body))
    expect(r.ok && r.facts.manifestMonthKeys).toEqual(['2026-08', '2026-09', '2026-10'])
  })

  it('treats a bundle with no shared manifest as manifest_absent', async () => {
    withCreds()
    const r = await readDeployedFunction('x', NOW, {
      fetchImpl: (async () => ok({ version: 1, files: [{ name: 'functions/x/index.ts', content: '' }] })) as unknown as typeof fetch,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure).toBe('manifest_absent')
  })

  it('classifies HTTP errors and bad bodies separately', async () => {
    withCreds()
    const s = await readDeployedFunction('x', NOW, {
      fetchImpl: (async () => new Response('', { status: 403 })) as unknown as typeof fetch,
    })
    expect(!s.ok && s.failure).toBe('unexpected_status')
    const m = await readDeployedFunction('x', NOW, {
      fetchImpl: (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch,
    })
    expect(!m.ok && m.failure).toBe('malformed_response')
  })

  it('bounds the request and reports a timeout', async () => {
    withCreds()
    const r = await readDeployedFunction('x', NOW, {
      fetchImpl: (async () => { throw Object.assign(new Error('a'), { name: 'AbortError' }) }) as unknown as typeof fetch,
    })
    expect(!r.ok && r.failure).toBe('network_timeout')
  })

  it('reads every consumer even when the first fails', async () => {
    withCreds()
    let n = 0
    const reports = await readAllConsumers(NOW, {
      fetchImpl: (async () => { n += 1; return n === 1 ? new Response('', { status: 500 }) : ok(fnResponse()) }) as unknown as typeof fetch,
    })
    expect(reports).toHaveLength(2)
    expect(reports[0].read.ok).toBe(false)
    expect(reports[1].read.ok).toBe(true)
  })

  it('verifyDeployedSource emits all four checks', async () => {
    withCreds()
    const e = await verifyDeployedSource(NOW, {
      fetchImpl: (async () => ok(fnResponse())) as unknown as typeof fetch,
    })
    expect(e.map(x => x.check_key)).toEqual([
      'shared_manifest_consumers_in_sync', 'deployed_manifest_matches_expected',
      'sign_protected_asset_source_current', 'get_protected_ebook_source_current',
    ])
    expect(e.every(x => x.result !== 'pass' || x.authoritative_system === 'familje-stunden')).toBe(true)
  })
})

// ── F/G/H. Catalogue, escalation, integration ────────────────────────────────

describe('catalogue and escalation wiring', () => {
  it('every deployed-source check is AUTOMATED, never attested', () => {
    for (const key of ['shared_manifest_consumers_in_sync', 'deployed_manifest_matches_expected',
      'sign_protected_asset_source_current', 'get_protected_ebook_source_current']) {
      expect(findCheck('edge_deploy', key)!.allowed_provenance, key).toEqual(['automated'])
    }
  })

  it('every deployed-source check is graded CRITICAL', () => {
    for (const key of ['shared_manifest_consumers_in_sync', 'deployed_manifest_matches_expected',
      'sign_protected_asset_source_current', 'get_protected_ebook_source_current']) {
      expect(CRITICAL_CHECK_KEYS, key).toContain(key)
      expect(severityFor('verification_failed', key), key).toBe('critical')
    }
  })

  it('consumer agreement is re-checked at release and after it', () => {
    expect(findCheck('approval_release', 'shared_manifest_consumers_in_sync')).not.toBeNull()
    expect(findCheck('post_release_qa', 'shared_manifest_consumers_in_sync')).not.toBeNull()
  })

  it('edge_deploy is now a verifiable state', () => {
    expect(familjeStundenAdapter.verifiableStates()).toContain('edge_deploy')
  })
})

// ── J. Negative architecture ─────────────────────────────────────────────────

const CODE = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const SRC = '../workflows/adapters/familje-stunden/deployed-source.ts'

describe('the verifier cannot change anything', () => {
  it('issues no write verb', () => {
    const code = CODE(SRC)
    expect(code).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'/)
    expect(code).toMatch(/method:\s*'GET'/)
  })

  it('has no deploy, update, delete or rollback ACTION', () => {
    // Targets actions, not vocabulary: `readDeployedFunction` and
    // `deployed_manifest_matches_expected` are read-only names that legitimately
    // contain "deploy". What must be absent is anything that CHANGES a function.
    const code = CODE(SRC)
    expect(code).not.toMatch(/\bdeployFunction\b|\.deploy\(|functions[ /]deploy/)
    expect(code).not.toMatch(/\brollback\b|\bupdateFunction\b|\bdeleteFunction\b/i)
    expect(code).not.toMatch(/\bupload\b/i)
    expect(code).not.toMatch(/createSignedUrl|\.storage\b|\.from\(/)
    // The Management API is reached at exactly one path shape, and it is a read.
    const endpoints = [...code.matchAll(/\/v1\/projects\/[^`'"]*/g)].map(m => m[0])
    expect(endpoints).toEqual(['/v1/projects/${projectRef}/functions/${slug}'])
  })

  it('never names a service role or resolves storage paths', () => {
    const code = CODE(SRC)
    expect(code.toLowerCase()).not.toContain('service_role')
    expect(code).not.toMatch(/resolveAssetPath|PROTECTED_BUCKET|can_access_month/)
  })

  it('reads no local source — the deployed hash is never derived locally', () => {
    const code = CODE(SRC)
    expect(code).not.toMatch(/readFileSync|readFile|import\(|require\(/)
    expect(code).not.toMatch(/protectedManifest\.ts['"]\s*\)/)   // no local import of the manifest
  })

  it('distinguishes expected from observed explicitly', () => {
    const code = CODE(SRC)
    expect(code).toMatch(/expectedManifestSha/)
    expect(code).toMatch(/manifestHash/)
  })
})

// ── Mutation tests ───────────────────────────────────────────────────────────

describe('mutant — a verifier that checks only one consumer', () => {
  it('would pass the exact incident this exists for', () => {
    const CURRENT = manifestBody()
    const STALE = manifestBody(['2026-08', '2026-09'])
    const reports = [report('sign-protected-asset', CURRENT), report('get-protected-ebook', STALE)]
    const mutant = (rs: ConsumerReport[]) => rs[0].read.ok      // "first one looks fine"
    expect(mutant(reports)).toBe(true)
    expect(checkConsumersInSync(reports, NOW).result).toBe('fail')
  })
})

describe('mutant — a verifier that trusts a local hash as the deployed hash', () => {
  it('would report agreement while production disagrees', () => {
    const LOCAL = manifestBody()
    const reports = [report('sign-protected-asset', LOCAL), report('get-protected-ebook', manifestBody(['2026-08']))]
    // The mutant compares local-to-local and always agrees with itself.
    expect(HASH(LOCAL)).toBe(HASH(LOCAL))
    expect(checkConsumersInSync(reports, NOW).result).toBe('fail')
  })
})
