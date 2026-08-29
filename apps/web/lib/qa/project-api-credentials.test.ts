/**
 * project_api_credentials — Phase 1 primitive.
 *
 * Two kinds of assertion appear here deliberately.
 *
 * BEHAVIOURAL tests drive `verifyProjectApiCredential` and
 * `requireProjectApiScope` against a controllable store and prove what they do.
 *
 * SOURCE-LEVEL tests read the files. They exist for properties that cannot be
 * observed by calling the function: that the generator uses a CSPRNG rather
 * than `Math.random`, that comparison uses `timingSafeEqual` rather than `===`,
 * that the migration revokes anon/authenticated, and that no existing auth
 * surface was modified. A behavioural test cannot distinguish `a === b` from a
 * constant-time compare, and cannot prove the absence of a change elsewhere.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const MODULE_PATH   = 'lib/auth/project-api-credentials.ts'
const SCOPES_PATH   = 'lib/auth/project-api-scopes.ts'
const MIGRATION     = 'supabase/migrations/20260821_project_api_credentials.sql'
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

// ── Controllable store ───────────────────────────────────────────────────────

const PROJECT_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_B = '22222222-2222-4222-8222-222222222222'
const CRED_ID   = '33333333-3333-4333-8333-333333333333'

type Row = Record<string, unknown> | null

let credentialRow: Row = null
let projectRow: Row = null
let credentialError: unknown = null
let projectError: unknown = null
let throwOnClient = false
let lookupPrefixes: string[] = []
let updates: { patch: Record<string, unknown>; id: unknown }[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (throwOnClient) throw new Error('client construction failed')
    return {
      from: (table: string) => {
        if (table === 'project_api_credentials') {
          return {
            select: () => ({
              eq: (_col: string, value: string) => {
                lookupPrefixes.push(value)
                return { maybeSingle: async () => ({ data: credentialRow, error: credentialError }) }
              },
            }),
            update: (patch: Record<string, unknown>) => ({
              eq: async (_col: string, id: unknown) => {
                updates.push({ patch, id })
                return { error: null }
              },
            }),
          }
        }
        if (table === 'projects') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: projectRow, error: projectError }) }),
            }),
          }
        }
        throw new Error(`unexpected table: ${table}`)
      },
    }
  },
}))

const {
  generateProjectApiCredential, hashProjectApiSecret, parseProjectApiToken,
  secretHashMatches, verifyProjectApiCredential, requireProjectApiScope,
  hasExactScope, projectOverrideIn, PROJECT_OVERRIDE_FIELDS, KEY_PREFIX_RE,
} = await import('@/lib/auth/project-api-credentials')

const { PROJECT_API_SCOPES, isKnownProjectApiScope } =
  await import('@/lib/auth/project-api-scopes')

/** Seed the store with a live credential and return its plaintext token. */
function seedLive(overrides: Record<string, unknown> = {}, project = PROJECT_A): string {
  const cred = generateProjectApiCredential()
  credentialRow = {
    id: CRED_ID,
    project_id: project,
    secret_hash: cred.secretHash,
    scopes: ['business.leads.create'],
    enabled: true,
    revoked_at: null,
    expires_at: null,
    ...overrides,
  }
  projectRow = { id: project }
  return cred.token
}

const bearer = (token: string) =>
  new Request('https://x.test/api', { headers: { authorization: `Bearer ${token}` } })

/**
 * The secret component, via the real parser.
 *
 * NEVER `token.split('_')[2]`: base64url's alphabet includes `_`, so a naive
 * split truncates roughly one secret in three at its first underscore. The
 * anchored regex in the module is unambiguous because the prefix is
 * fixed-length hex — this helper exists so the tests exercise that same path
 * rather than a lookalike that would silently pass on shortened input.
 */
const secretOf = (token: string): string => {
  const parsed = parseProjectApiToken(token)
  if (!parsed) throw new Error('test helper received a token the parser rejects')
  return parsed.secret
}

beforeEach(() => {
  credentialRow = null; projectRow = null
  credentialError = null; projectError = null
  throwOnClient = false
  lookupPrefixes = []; updates = []
})

/**
 * Files under `dir` containing `pattern`.
 *
 * `execFileSync` with an argument vector, never a shell string: the repository
 * path contains spaces ("AI Operating Platform"), so an interpolated
 * `grep -rl x ${dir}` word-splits into non-existent paths, grep errors, and a
 * `|| true` turns that into an empty result. An assertion built that way
 * reports "nothing imports this" whether or not anything does — it cannot fail.
 * That is exactly how this check first passed while being broken.
 */
function filesContaining(pattern: string, dir: string): string[] {
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
  try {
    return execFileSync('grep', ['-rl', pattern, dir], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean)
  } catch (e) {
    // grep exits 1 on no match — that is a real empty result, not a failure.
    const err = e as { status?: number }
    if (err.status === 1) return []
    throw e
  }
}

// ── 1. Token format ──────────────────────────────────────────────────────────

describe('token format', () => {
  it('mints omn_<16 hex>_<43 char base64url>', () => {
    const { token, keyPrefix } = generateProjectApiCredential()
    expect(token).toMatch(/^omn_[0-9a-f]{16}_[A-Za-z0-9_-]{43}$/)
    expect(keyPrefix).toMatch(KEY_PREFIX_RE)
    expect(token.startsWith(`${keyPrefix}_`)).toBe(true)
  })

  it('carries 256 bits of secret entropy', () => {
    const { token } = generateProjectApiCredential()
    // base64url of 32 bytes, unpadded.
    expect(Buffer.from(secretOf(token), 'base64url')).toHaveLength(32)
  })

  it('parses a canonical token into prefix and secret', () => {
    const { token, keyPrefix } = generateProjectApiCredential()
    const parsed = parseProjectApiToken(token)
    expect(parsed?.keyPrefix).toBe(keyPrefix)
    expect(parsed?.secret).toBe(token.slice(keyPrefix.length + 1))
  })

  it.each([
    ['empty',              ''],
    ['no marker',          'abc_0123456789abcdef_' + 'a'.repeat(43)],
    ['wrong marker',       'xyz_0123456789abcdef_' + 'a'.repeat(43)],
    ['short prefix',       'omn_0123456789abcde_' + 'a'.repeat(43)],
    ['long prefix',        'omn_0123456789abcdef0_' + 'a'.repeat(43)],
    ['uppercase prefix',   'omn_0123456789ABCDEF_' + 'a'.repeat(43)],
    ['short secret',       'omn_0123456789abcdef_' + 'a'.repeat(42)],
    ['long secret',        'omn_0123456789abcdef_' + 'a'.repeat(44)],
    ['illegal secret char','omn_0123456789abcdef_' + 'a'.repeat(42) + '+'],
    ['missing secret',     'omn_0123456789abcdef'],
    ['leading space',      ' omn_0123456789abcdef_' + 'a'.repeat(43)],
    ['trailing newline',   'omn_0123456789abcdef_' + 'a'.repeat(43) + '\n'],
    ['extra segment',      'omn_0123456789abcdef_' + 'a'.repeat(43) + '_x'],
  ])('rejects malformed token: %s', (_label, token) => {
    expect(parseProjectApiToken(token)).toBeNull()
  })

  it.each([null, undefined, 42, {}, [], true])('rejects non-string token: %s', v => {
    expect(parseProjectApiToken(v)).toBeNull()
  })

  it('parses a secret that itself contains _ and -', () => {
    // base64url's alphabet includes both, so roughly one secret in three holds
    // an underscore. Anything that parses by splitting on '_' truncates those
    // secrets and would then hash the wrong string. The prefix being
    // fixed-length hex is what makes the anchored regex unambiguous — this is
    // the test that keeps the format from being "simplified" into ambiguity.
    const secret = `${'a'.repeat(20)}_${'b'.repeat(11)}-${'c'.repeat(10)}`
    expect(secret).toHaveLength(43)
    const token = `omn_0123456789abcdef_${secret}`
    const parsed = parseProjectApiToken(token)
    expect(parsed?.keyPrefix).toBe('omn_0123456789abcdef')
    expect(parsed?.secret).toBe(secret)
  })

  it('mints distinct prefixes and secrets across many draws', () => {
    const prefixes = new Set<string>()
    const secrets = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const { token, keyPrefix } = generateProjectApiCredential()
      prefixes.add(keyPrefix)
      secrets.add(secretOf(token))
    }
    expect(prefixes.size).toBe(500)
    expect(secrets.size).toBe(500)
  })
})

// ── 2. Hashing ───────────────────────────────────────────────────────────────

describe('hashing', () => {
  it('stores a sha256 hex digest, never the secret', () => {
    const { token, secretHash } = generateProjectApiCredential()
    const secret = secretOf(token)
    expect(secretHash).toMatch(/^[a-f0-9]{64}$/)
    expect(secretHash).not.toContain(secret)
    expect(secret).not.toContain(secretHash)
  })

  it('is deterministic and secret-dependent', () => {
    expect(hashProjectApiSecret('abc')).toBe(hashProjectApiSecret('abc'))
    expect(hashProjectApiSecret('abc')).not.toBe(hashProjectApiSecret('abd'))
  })

  it('compares equal hashes true and different hashes false', () => {
    const h = hashProjectApiSecret('x')
    expect(secretHashMatches(h, h)).toBe(true)
    expect(secretHashMatches(h, hashProjectApiSecret('y'))).toBe(false)
  })

  it('returns false on unequal length instead of throwing', () => {
    // timingSafeEqual throws on unequal-length buffers; the length guard is
    // what keeps a truncated stored hash a denial rather than a 500.
    expect(() => secretHashMatches('abc', hashProjectApiSecret('x'))).not.toThrow()
    expect(secretHashMatches('abc', hashProjectApiSecret('x'))).toBe(false)
  })

  it('uses the canonical constant-time primitive, not ===', () => {
    const src = read(MODULE_PATH)
    expect(src).toContain('timingSafeEqual')
    expect(src).toMatch(/from 'node:crypto'/)
    // The comparison helper must not fall back to plain equality.
    const fn = src.slice(src.indexOf('export function secretHashMatches'))
      .slice(0, src.slice(src.indexOf('export function secretHashMatches')).indexOf('\n}'))
    expect(fn).toContain('timingSafeEqual')
    expect(fn).not.toMatch(/presentedHash\s*===\s*storedHash/)
  })

  it('uses a CSPRNG, never Math.random and never a bare UUID as the secret', () => {
    const src = read(MODULE_PATH)
    const start = src.indexOf('export function generateProjectApiCredential')
    const body = src.slice(start, src.indexOf('\n}', start))
    expect(body).toContain('randomBytes')
    // The prose above the function names Math.random to explain why it is
    // unfit; the CODE must never call it.
    expect(body).not.toContain('Math.random')
    expect(src).not.toMatch(/Math\.random\s*\(/)
    expect(body).not.toContain('randomUUID')
  })
})

// ── 3. Verification — accept ─────────────────────────────────────────────────

describe('verification — valid credential', () => {
  it('returns a principal carrying credentialId, projectId and scopes', async () => {
    const token = seedLive({ scopes: ['business.leads.create', 'other.scope'] })
    const principal = await verifyProjectApiCredential(token)
    expect(principal).toEqual({
      credentialId: CRED_ID,
      projectId: PROJECT_A,
      scopes: ['business.leads.create', 'other.scope'],
    })
  })

  it('looks the credential up by its public prefix only', async () => {
    const token = seedLive()
    await verifyProjectApiCredential(token)
    expect(lookupPrefixes).toEqual([token.split('_').slice(0, 2).join('_')])
    // The secret is never sent to the database.
    expect(lookupPrefixes[0]).not.toContain(secretOf(token))
  })

  it('accepts an expiry in the future', async () => {
    const token = seedLive({ expires_at: new Date(Date.now() + 60_000).toISOString() })
    expect(await verifyProjectApiCredential(token)).not.toBeNull()
  })

  it('returns scopes as a frozen copy the caller cannot mutate into privilege', async () => {
    const token = seedLive({ scopes: ['a'] })
    const principal = await verifyProjectApiCredential(token)
    expect(Object.isFrozen(principal!.scopes)).toBe(true)
    expect(() => (principal!.scopes as string[]).push('b')).toThrow()
    expect(principal!.scopes).toEqual(['a'])
  })
})

// ── 4. Verification — deny ───────────────────────────────────────────────────

describe('verification — fail closed', () => {
  it('denies an unknown prefix', async () => {
    seedLive()
    credentialRow = null // prefix resolves to nothing
    const { token } = generateProjectApiCredential()
    expect(await verifyProjectApiCredential(token)).toBeNull()
  })

  it('denies a wrong secret against a real prefix', async () => {
    const token = seedLive()
    const forged = `${token.slice(0, 20)}_${'A'.repeat(43)}`
    expect(await verifyProjectApiCredential(forged)).toBeNull()
  })

  it('denies a disabled credential', async () => {
    const token = seedLive({ enabled: false })
    expect(await verifyProjectApiCredential(token)).toBeNull()
  })

  it('denies a revoked credential', async () => {
    const token = seedLive({ revoked_at: new Date().toISOString() })
    expect(await verifyProjectApiCredential(token)).toBeNull()
  })

  it('denies an expired credential', async () => {
    const token = seedLive({ expires_at: new Date(Date.now() - 1000).toISOString() })
    expect(await verifyProjectApiCredential(token)).toBeNull()
  })

  it('denies at the exact expiry instant', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const token = seedLive({ expires_at: now.toISOString() })
    expect(await verifyProjectApiCredential(token, { now })).toBeNull()
  })

  it('denies an unparseable expiry rather than ignoring it', async () => {
    const token = seedLive({ expires_at: 'not-a-date' })
    expect(await verifyProjectApiCredential(token)).toBeNull()
  })

  it('denies on a credential-table error', async () => {
    const token = seedLive()
    credentialError = { message: 'db down' }
    expect(await verifyProjectApiCredential(token)).toBeNull()
  })

  it('denies when the client itself throws', async () => {
    const token = seedLive()
    throwOnClient = true
    expect(await verifyProjectApiCredential(token)).toBeNull()
  })

  it('denies when the project no longer exists', async () => {
    const token = seedLive()
    projectRow = null
    expect(await verifyProjectApiCredential(token)).toBeNull()
  })

  it('denies on a project-lookup error', async () => {
    const token = seedLive()
    projectError = { message: 'db down' }
    expect(await verifyProjectApiCredential(token)).toBeNull()
  })

  it.each([
    ['scopes is a string',  { scopes: 'business.leads.create' }],
    ['scopes is null',      { scopes: null }],
    ['scopes is an object', { scopes: { 0: 'a' } }],
    ['scopes has non-strings', { scopes: ['a', 7] }],
    ['secret_hash missing', { secret_hash: null }],
    ['id missing',          { id: null }],
    ['project_id missing',  { project_id: null }],
  ])('denies a malformed row: %s', async (_label, overrides) => {
    const token = seedLive()
    credentialRow = { ...(credentialRow as Record<string, unknown>), ...overrides }
    expect(await verifyProjectApiCredential(token)).toBeNull()
  })

  it('never leaks the secret through a thrown error', async () => {
    const token = seedLive()
    credentialError = { message: 'db down' }
    let thrown: unknown = null
    try { await verifyProjectApiCredential(token) } catch (e) { thrown = e }
    expect(thrown).toBeNull()
  })
})

// ── 5. Scope enforcement ─────────────────────────────────────────────────────

describe('scope enforcement — exact match only', () => {
  it('grants the exact scope', () => {
    expect(hasExactScope(['business.leads.create'], 'business.leads.create')).toBe(true)
  })

  it('denies an empty scope list', () => {
    expect(hasExactScope([], 'business.leads.create')).toBe(false)
  })

  it.each([
    ['parent prefix',        ['business.leads']],
    ['grandparent prefix',   ['business']],
    ['child of required',    ['business.leads.create.other']],
    ['star wildcard',        ['*']],
    ['prefix wildcard',      ['business.*']],
    ['deep wildcard',        ['business.leads.*']],
    ['substring',            ['leads.create']],
    ['superstring',          ['xbusiness.leads.createx']],
    ['case variant',         ['Business.Leads.Create']],
    ['trailing dot',         ['business.leads.create.']],
    ['leading space',        [' business.leads.create']],
    ['trailing space',       ['business.leads.create ']],
    ['empty string scope',   ['']],
  ])('does NOT grant business.leads.create from: %s', (_label, scopes) => {
    expect(hasExactScope(scopes as string[], 'business.leads.create')).toBe(false)
  })

  it('grants only the matching entry when several are held', () => {
    const held = ['other.thing', 'business.leads.create', 'business.leads']
    expect(hasExactScope(held, 'business.leads.create')).toBe(true)
    expect(hasExactScope(held, 'business.leads.delete')).toBe(false)
    expect(hasExactScope(held, 'business')).toBe(false)
  })

  it('gives an unknown stored scope no power over a different scope', () => {
    expect(hasExactScope(['totally.made.up'], 'business.leads.create')).toBe(false)
  })

  it('is written as explicit equality, not startsWith/includes', () => {
    const src = read(MODULE_PATH)
    const start = src.indexOf('export function hasExactScope')
    const body = src.slice(start, src.indexOf('\n}', start))
    expect(body).toContain('scope === required')
    expect(body).not.toContain('startsWith')
    expect(body).not.toContain('endsWith')
    expect(body).not.toContain('.includes(')
    expect(body).not.toContain('*')
  })
})

// ── 6. requireProjectApiScope ────────────────────────────────────────────────

describe('requireProjectApiScope', () => {
  it('returns a principal, never a bare { ok: true }', async () => {
    const token = seedLive()
    const result = await requireProjectApiScope(bearer(token), 'business.leads.create')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.principal.projectId).toBe(PROJECT_A)
      expect(result.principal.credentialId).toBe(CRED_ID)
    }
    expect(Object.keys(result)).toEqual(['ok', 'principal'])
  })

  it('401s without an Authorization header', async () => {
    seedLive()
    const result = await requireProjectApiScope(new Request('https://x.test/api'), 'business.leads.create')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it.each([
    ['not bearer',    'Token abc'],
    ['bearer empty',  'Bearer '],
    ['malformed',     'Bearer not-a-token'],
  ])('401s on a bad Authorization header: %s', async (_l, header) => {
    seedLive()
    const req = new Request('https://x.test/api', { headers: { authorization: header } })
    const result = await requireProjectApiScope(req, 'business.leads.create')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('403s when the credential is valid but lacks the scope', async () => {
    const token = seedLive({ scopes: ['business.leads'] })
    const result = await requireProjectApiScope(bearer(token), 'business.leads.create')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it('403s on an empty scope list', async () => {
    const token = seedLive({ scopes: [] })
    const result = await requireProjectApiScope(bearer(token), 'business.leads.create')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it('401s (not 403) for a revoked credential — no scope oracle', async () => {
    const token = seedLive({ revoked_at: new Date().toISOString() })
    const result = await requireProjectApiScope(bearer(token), 'business.leads.create')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('takes no project argument at all', () => {
    // The signature is the invariant: there is no parameter through which a
    // caller could name a project, so none can be honoured.
    expect(requireProjectApiScope.length).toBe(2)
    const src = read(MODULE_PATH)
    expect(src).toMatch(/requireProjectApiScope\(\s*request: Request,\s*requiredScope: string,\s*\)/)
  })
})

// ── 7. Project binding ───────────────────────────────────────────────────────

describe('project binding — principal is the only source', () => {
  it('a project-A credential yields projectId A, never B', async () => {
    const token = seedLive({}, PROJECT_A)
    const principal = await verifyProjectApiCredential(token)
    expect(principal!.projectId).toBe(PROJECT_A)
    expect(principal!.projectId).not.toBe(PROJECT_B)
  })

  it('a project-B credential yields projectId B', async () => {
    const token = seedLive({}, PROJECT_B)
    const principal = await verifyProjectApiCredential(token)
    expect(principal!.projectId).toBe(PROJECT_B)
  })

  it.each([...PROJECT_OVERRIDE_FIELDS])('refuses a caller-supplied %s', field => {
    expect(projectOverrideIn({ [field]: PROJECT_B })).toBe(field)
  })

  it('refuses the field even when it names the credential\'s own project', () => {
    // Presence is the refusal, not disagreement — an endpoint must never be one
    // `??` away from reading project identity out of caller input.
    expect(projectOverrideIn({ projectId: PROJECT_A })).toBe('projectId')
  })

  it('refuses a field explicitly set to undefined', () => {
    expect(projectOverrideIn({ project_id: undefined })).toBe('project_id')
  })

  it('passes a body carrying no project-naming field', () => {
    expect(projectOverrideIn({ email: 'a@b.c', name: 'x' })).toBeNull()
  })
})

// ── 8. last_used_at ──────────────────────────────────────────────────────────

describe('last_used_at', () => {
  it('stamps after a successful authentication', async () => {
    const token = seedLive()
    await requireProjectApiScope(bearer(token), 'business.leads.create')
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe(CRED_ID)
    expect(Object.keys(updates[0].patch)).toEqual(['last_used_at'])
    expect(Date.parse(updates[0].patch.last_used_at as string)).not.toBeNaN()
  })

  it('does not stamp when the credential is invalid', async () => {
    const token = seedLive({ revoked_at: new Date().toISOString() })
    await requireProjectApiScope(bearer(token), 'business.leads.create')
    expect(updates).toHaveLength(0)
  })

  it('does not stamp when the scope check fails', async () => {
    const token = seedLive({ scopes: [] })
    await requireProjectApiScope(bearer(token), 'business.leads.create')
    expect(updates).toHaveLength(0)
  })

  it('writes nothing derived from the request', async () => {
    const token = seedLive()
    const req = new Request('https://x.test/api', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: 'leak@example.com' }),
    })
    await requireProjectApiScope(req, 'business.leads.create')
    expect(JSON.stringify(updates)).not.toContain('leak@example.com')
    expect(Object.keys(updates[0].patch)).toEqual(['last_used_at'])
  })
})

// ── 9. No plaintext anywhere ─────────────────────────────────────────────────

describe('plaintext containment', () => {
  it('never logs the secret during generation or verification', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const)
      .map(m => vi.spyOn(console, m).mockImplementation(() => {}))
    const token = seedLive()
    await verifyProjectApiCredential(token)
    credentialError = { message: 'db down' }
    await verifyProjectApiCredential(token)
    const secret = secretOf(token)
    const printed = spies.flatMap(s => s.mock.calls.flat()).map(String).join(' ')
    expect(printed).not.toContain(secret)
    expect(printed).not.toContain(token)
    spies.forEach(s => s.mockRestore())
  })

  it('does not return the secret or its hash on the principal', async () => {
    const token = seedLive()
    const principal = await verifyProjectApiCredential(token)
    const serialized = JSON.stringify(principal)
    expect(serialized).not.toContain(secretOf(token))
    expect(serialized).not.toContain(hashProjectApiSecret(secretOf(token)))
    expect(Object.keys(principal!).sort()).toEqual(['credentialId', 'projectId', 'scopes'])
  })

  it('stores only the hash — the stored representation cannot reproduce the token', () => {
    const { token, keyPrefix, secretHash } = generateProjectApiCredential()
    const stored = JSON.stringify({ key_prefix: keyPrefix, secret_hash: secretHash })
    expect(stored).not.toContain(secretOf(token))
    expect(stored).not.toContain(token)
  })

  it('has no column that could hold a plaintext secret', () => {
    const sql = read(MIGRATION)
    expect(sql).toContain('secret_hash')
    expect(sql).not.toMatch(/\bsecret\s+text/)
    expect(sql).not.toMatch(/\bplaintext\b\s+text/)
    expect(sql).not.toMatch(/\btoken\s+text/)
  })
})

// ── 10. Migration shape ──────────────────────────────────────────────────────

describe('migration', () => {
  const sql = () => read(MIGRATION)

  it('creates the table additively', () => {
    expect(sql()).toContain('create table if not exists public.project_api_credentials')
  })

  it('makes the table unreachable from anon and authenticated', () => {
    expect(sql()).toContain('alter table public.project_api_credentials enable row level security')
    expect(sql()).toContain('revoke all on public.project_api_credentials from anon, authenticated')
    // RLS enabled with zero policies is deny-all; a policy here would be a grant.
    expect(sql()).not.toContain('create policy')
  })

  it('scopes every credential to exactly one project, not null', () => {
    expect(sql()).toMatch(/project_id\s+uuid not null references public\.projects\(id\)/)
  })

  it('uses on delete restrict, following the authority-record precedent', () => {
    expect(sql()).toMatch(/references public\.projects\(id\) on delete restrict/)
    expect(sql()).not.toMatch(/references public\.projects\(id\) on delete cascade/)
  })

  it('constrains key_prefix and secret_hash to their canonical formats', () => {
    expect(sql()).toContain("key_prefix ~ '^omn_[0-9a-f]{16}$'")
    expect(sql()).toContain("secret_hash ~ '^[a-f0-9]{64}$'")
  })

  it('carries the lifecycle and observability columns', () => {
    for (const col of ['enabled', 'revoked_at', 'expires_at', 'last_used_at', 'created_at', 'created_by', 'scopes']) {
      expect(sql()).toContain(col)
    }
  })

  it('is purely additive — no destructive statement', () => {
    const s = sql().toLowerCase()
    for (const bad of ['drop table', 'drop column', 'truncate table', 'delete from', 'alter column']) {
      expect(s).not.toContain(bad)
    }
    // `truncate` as a statement, not the word "truncated" in a comment.
    expect(s).not.toMatch(/^\s*truncate\b/m)
  })

  it('indexes the lookup handle uniquely and the project', () => {
    expect(sql()).toContain('key_prefix    text not null unique')
    expect(sql()).toContain('project_api_credentials_project_idx')
  })
})

// ── 11. Inertness ────────────────────────────────────────────────────────────

describe('inertness — Phase 1 changes no existing auth', () => {
  it('is imported by no route directly — only via the leads-scoped resolver', () => {
    // Phase 1 asserted "no consumer at all". Phase 2 gave it exactly one, and
    // this is the assertion that keeps that number at one: no route may reach
    // the primitive without going through a route-scoped resolver, so a second
    // route cannot quietly acquire credential auth by adding an import.
    expect(filesContaining('auth/project-api-credentials', `${WEB_ROOT}/app`)).toEqual([])

    // PR5 added the second consumer, and deliberately as another route-scoped
    // resolver rather than a direct route import — the rule this guard exists to
    // enforce. The list is exhaustive on purpose: a third consumer must be a
    // deliberate edit here, not a silent import.
    const libConsumers = filesContaining('auth/project-api-credentials', `${WEB_ROOT}/lib`)
      .filter(f => !f.endsWith('lib/auth/project-api-credentials.ts') && !f.includes('/qa/'))
      .sort()
    expect(libConsumers).toEqual([
      `${WEB_ROOT}/lib/business/leads-auth.ts`,
      `${WEB_ROOT}/lib/workflows/evidence-auth.ts`,
    ].sort())
  })

  it('leaves lib/api-auth.ts holding cron auth and nothing global', () => {
    // 4E2 deleted the global-key chain. What this assertion owns is that the
    // deletion did not take the cron class with it.
    const src = read('lib/api-auth.ts')
    expect(src).not.toContain('export function requireApiKey')
    expect(src).not.toContain('export async function requireUserOrApiKey')
    expect(src).not.toContain('process.env.AIOPS_API_KEY')
    expect(src).toContain('export function requireCronAuth')
    expect(src).toContain('process.env.CRON_SECRET')
  })

  it('leaves campaigns and revenue without credential access', () => {
    // 4B1 session-scoped them via business-auth. They still must not gain a
    // project-credential path, and must not import the leads resolver.
    // 4B2 made them session-only; neither may gain a credential path, and
    // neither may borrow the leads resolver.
    for (const name of ['campaigns', 'revenue']) {
      const src = read(`app/api/business/${name}/route.ts`)
      expect(src).toContain("from '@/lib/auth/session'")
      expect(src).not.toContain('project-api-credentials')
      expect(src).not.toContain('leads-auth')
    }
    // After 4B3 no route reaches the global helper at all — including leads.
    expect(read('lib/business/leads-auth.ts')).not.toContain("from '@/lib/api-auth'")
  })

  it('reaches the primitive from leads only through the scoped resolver', () => {
    const leads = read('app/api/business/leads/route.ts')
    expect(leads).toContain("from '@/lib/business/leads-auth'")
    // The route never touches the primitive itself.
    expect(leads).not.toContain('project-api-credentials')
    expect(leads).not.toContain('requireProjectApiScope')
  })

  it('does not read AIOPS_API_KEY from the new primitive', () => {
    // The header explains what this replaces and why, so the NAME appears.
    // What must not appear is a read of the global key.
    expect(read(MODULE_PATH)).not.toContain('process.env.AIOPS_API_KEY')
    expect(read(MODULE_PATH)).not.toMatch(/process\.env\./)
  })

  it('keeps the new module server-only', () => {
    expect(read(MODULE_PATH)).toContain("import 'server-only'")
  })
})

// ── 12. Scope vocabulary ─────────────────────────────────────────────────────

describe('scope vocabulary', () => {
  it('defines business.leads.create', () => {
    expect(PROJECT_API_SCOPES).toContain('business.leads.create')
  })

  it('declares no wildcard in V1', () => {
    for (const s of PROJECT_API_SCOPES) {
      expect(s).not.toContain('*')
    }
    expect(read(SCOPES_PATH)).not.toMatch(/'\*'/)
  })

  it('recognises known scopes and rejects everything else', () => {
    expect(isKnownProjectApiScope('business.leads.create')).toBe(true)
    for (const v of ['business.leads', 'business.*', '*', '', null, 7, {}]) {
      expect(isKnownProjectApiScope(v)).toBe(false)
    }
  })

  it('is not consulted by the authorization path', () => {
    // Enforcement must not depend on the vocabulary: a scope's presence in the
    // list is not what grants access, matching the demanded scope is.
    expect(read(MODULE_PATH)).not.toContain('project-api-scopes')
    expect(read(MODULE_PATH)).not.toContain('isKnownProjectApiScope')
  })
})

afterEach(() => { vi.restoreAllMocks() })
