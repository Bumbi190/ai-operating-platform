/**
 * vNext Settings S1 — Inställningar (`/settings`).
 *
 * Four risks carry this surface, and the suite is organised around them:
 *
 *   1. READING A SECRET TO SHOW A STATUS. Settings reports on the platform's live
 *      publishing credentials. Every read must be metadata — never
 *      `platform_tokens.access_token`, never `token_health.last_error` (which can
 *      quote a provider's answer) — and environment variables are presence only.
 *
 *   2. BECOMING AN AUTHORITY SOURCE. Replacement is the existing
 *      `POST /api/media/token`, which owns the operator gate, the ownership gate
 *      and the fail-closed audit. Settings may only mirror those checks to decide
 *      whether to offer the form, through the same canonical predicate, and the
 *      form may post nowhere else.
 *
 *   3. CLAIMING WHAT NOBODY STORES. The page this replaces printed a version, a
 *      stack, a model, a sign-in method and a roadmap from literals. An unreadable
 *      source must say so, an absent check is unchecked — not healthy — and no
 *      literal claim survives.
 *
 *   4. LOSING THE ROLLBACK. `?ui=legacy` must render the previous body exactly —
 *      pinned by hash.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import {
  assembleSettings,
  envPresence,
  ENV_FALLBACK,
  PLATFORM_CONFIG,
  SOCIAL_PROJECT_SLUG,
  YOUTUBE_OAUTH_VARS,
  type AssembleSettingsInput,
  type SettingsModel,
} from '@/lib/os/settings'
import {
  ACCOUNT_PASSWORD_HREF,
  ACCOUNT_SIGN_IN_METHOD,
  CAPABILITY_NOTES,
  CREDENTIAL_ENDPOINT,
  MIN_TOKEN_LENGTH,
  SEND_FAILED_MESSAGE,
  TOKEN_HEALTH_LABELS,
  UNREADABLE_LABEL,
  replacementOutcome,
} from '@/lib/os/settings-shared'

;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => '/settings',
  useSearchParams: () => new URLSearchParams(),
  redirect: (to: string) => { throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: `NEXT_REDIRECT;${to}` }) },
}))

const WEB_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')
/** Comments name what this surface deliberately does NOT touch; assertions read the code without them. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

const FILES = {
  page: 'app/(platform)/settings/page.tsx',
  legacy: 'app/(platform)/settings/SettingsLegacy.tsx',
  loader: 'lib/os/settings.ts',
  shared: 'lib/os/settings-shared.ts',
  surface: 'components/platform/vnext/SettingsSurface.tsx',
  form: 'components/platform/vnext/SettingsCredentialForm.tsx',
  css: 'components/platform/vnext/SettingsSurface.module.css',
} as const

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = '2026-09-14T08:00:00.000Z'
const USER_ID = '0f8a2c4e-6b1d-4e3f-9a5c-7d2e8b1f4a6c'
const SOCIAL_ID = '33333333-3333-3333-3333-333333333333'
const ALL_VARS = [...new Set([
  ...Object.values(ENV_FALLBACK), ...YOUTUBE_OAUTH_VARS, ...PLATFORM_CONFIG.flatMap((item) => item.vars),
])]
const ENV_ALL: Record<string, boolean> = Object.fromEntries(ALL_VARS.map((name) => [name, true]))

function input(over: Partial<AssembleSettingsInput> = {}): AssembleSettingsInput {
  return {
    now: NOW,
    account: { email: 'operator@omnira.test', userId: USER_ID },
    operatorOk: true,
    socialProject: 'owned',
    storedTokens: {
      ok: true,
      rows: [
        { platform: 'instagram', token_type: 'user', expires_at: '2026-11-06T00:00:00.000Z', refreshed_at: '2026-09-07T03:00:00.000Z' },
        { platform: 'facebook', token_type: 'page', expires_at: null, refreshed_at: '2026-06-05T10:00:00.000Z' },
      ],
    },
    tokenHealth: {
      ok: true,
      rows: [
        { platform: 'instagram', status: 'ok', days_left: 53, expires_at: '2026-11-06T00:00:00.000Z', last_verified_at: '2026-09-14T06:15:00.000Z', last_refreshed_at: '2026-09-07T03:00:00.000Z' },
        { platform: 'facebook', status: 'ok', days_left: null, expires_at: null, last_verified_at: '2026-09-14T06:15:00.000Z', last_refreshed_at: null },
        { platform: 'youtube', status: 'ok', days_left: null, expires_at: null, last_verified_at: '2026-09-14T06:15:00.000Z', last_refreshed_at: '2026-09-14T06:15:00.000Z' },
      ],
    },
    replacements: { ok: true, rows: [] },
    env: { ...ENV_ALL },
    ...over,
  }
}
const model = (over: Partial<AssembleSettingsInput> = {}) => assembleSettings(input(over))
const channelOf = (m: SettingsModel, id: string) => m.channels.find((c) => c.id === id)!

async function html(m: SettingsModel): Promise<string> {
  const { SettingsSurface } = await import('@/components/platform/vnext/SettingsSurface')
  return renderToStaticMarkup(createElement(SettingsSurface, {
    model: m,
    displayPreferences: createElement('div', { id: 'display-slot' }, 'DISPLAY PREFERENCES'),
  }))
}

function deployedFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (entry === 'node_modules' || entry === '.next' || entry === 'qa') continue
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
    }
  }
  for (const d of ['app', 'lib', 'components']) walk(resolve(WEB_ROOT, d))
  return out
}

// ── 1. Credential-blind ──────────────────────────────────────────────────────

describe('settings S1 · credential-blind by construction', () => {
  it('the loader selects metadata only — never access_token, never last_error, never *', () => {
    const loader = codeOnly(read(FILES.loader))
    expect(loader).toMatch(/from\('platform_tokens'\) as any\)\s*\.select\('platform, token_type, expires_at, refreshed_at'\)/)
    expect(loader).toMatch(/from\('token_health'\) as any\)\s*\.select\('platform, status, days_left, expires_at, last_verified_at, last_refreshed_at'\)/)
    expect(loader).toMatch(/\(db as any\)\.from\('platform_credential_events'\)\s*\.select\('platform, outcome, occurred_at'\)/)
    expect(loader).not.toMatch(/access_token|last_error|select\('\*'\)|getToken\(/)
  })

  it('no settings file names a credential column, reads the token store, or keeps anything in the browser', () => {
    for (const rel of [FILES.page, FILES.loader, FILES.shared, FILES.surface, FILES.form]) {
      const code = codeOnly(read(rel))
      expect(code, rel).not.toMatch(/access_token|last_error|lib\/media\/token-store|localStorage|sessionStorage|document\.cookie/)
    }
    for (const rel of [FILES.shared, FILES.surface, FILES.form, FILES.page]) {
      expect(codeOnly(read(rel)), rel).not.toMatch(/process\.env/)
    }
    expect(codeOnly(read(FILES.form))).not.toMatch(/console\./)
  })

  it('environment variables are reported as presence only — a value never leaves the loader', () => {
    const saved = { a: process.env.ANTHROPIC_API_KEY, y: process.env.YOUTUBE_CLIENT_ID }
    process.env.ANTHROPIC_API_KEY = 'sk-ant-very-secret-value'
    process.env.YOUTUBE_CLIENT_ID = '   '
    try {
      const presence = envPresence()
      expect(Object.keys(presence).sort()).toEqual([...ALL_VARS].sort())
      expect(Object.values(presence).every((v) => typeof v === 'boolean')).toBe(true)
      expect(presence.ANTHROPIC_API_KEY).toBe(true)
      expect(presence.YOUTUBE_CLIENT_ID).toBe(false)
      expect(JSON.stringify(presence)).not.toContain('sk-ant-very-secret-value')
    } finally {
      if (saved.a === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved.a
      if (saved.y === undefined) delete process.env.YOUTUBE_CLIENT_ID; else process.env.YOUTUBE_CLIENT_ID = saved.y
    }
  })

  it('the model has no field that could carry a credential', () => {
    const keys: string[] = []
    const walk = (v: unknown) => {
      if (Array.isArray(v)) { v.forEach(walk); return }
      if (v && typeof v === 'object') for (const [k, child] of Object.entries(v)) { keys.push(k); walk(child) }
    }
    walk(model())
    expect(keys.filter((k) => /access|secret|password|apikey|credentialvalue|^token$|^value$/i.test(k))).toEqual([])
  })
})

// ── 2. Truthful status ───────────────────────────────────────────────────────

describe('settings S1 · status comes from stored metadata, never inferred', () => {
  it('a stored row is "stored", with its metadata', () => {
    const ig = channelOf(model(), 'instagram')
    expect(ig.source).toBe('stored')
    expect(ig.stored).toEqual({ tokenType: 'user', expiresAt: '2026-11-06T00:00:00.000Z', refreshedAt: '2026-09-07T03:00:00.000Z' })
  })

  it('no stored row: the environment fallback when it is set, otherwise missing', () => {
    const noRows = { storedTokens: { ok: true as const, rows: [] } }
    expect(channelOf(model(noRows), 'facebook').source).toBe('environment')
    expect(channelOf(model({ ...noRows, env: { ...ENV_ALL, FACEBOOK_PAGE_ACCESS_TOKEN: false } }), 'facebook').source).toBe('missing')
  })

  it('an unreadable stored-credential read is unreadable — never missing — and says so', () => {
    const m = model({ storedTokens: { ok: false, reason: 'error' } })
    expect(channelOf(m, 'instagram').source).toBe('unreadable')
    expect(m.warnings.map((w) => w.id)).toContain('unreadable:instagram')
  })

  it('a social project outside the session scope is out of scope, not read and not missing', () => {
    const m = model({ socialProject: 'foreign', storedTokens: { ok: false, reason: 'not_read' }, replacements: { ok: false, reason: 'not_read' } })
    expect(channelOf(m, 'instagram').source).toBe('out_of_scope')
    expect(channelOf(m, 'instagram').lastReplacement).toEqual({ state: 'not_read', at: null })
  })

  it('token health: an unreadable check is not healthy, no row is unchecked, an unknown status is unknown', () => {
    const unreadable = model({ tokenHealth: { ok: false, reason: 'error' } })
    expect(channelOf(unreadable, 'instagram').health.readable).toBe(false)
    expect(unreadable.warnings.map((w) => w.id)).toContain('unreadable:token_health')
    const noRow = model({ tokenHealth: { ok: true, rows: [] } })
    expect(channelOf(noRow, 'youtube').health.status).toBe('unchecked')
    const odd = model({ tokenHealth: { ok: true, rows: [{ platform: 'instagram', status: 'fine-probably' }] } })
    expect(channelOf(odd, 'instagram').health.status).toBe('unknown')
  })

  it('expired and expiring tokens raise warnings that name their stored condition', () => {
    const m = model({ tokenHealth: { ok: true, rows: [
      { platform: 'instagram', status: 'expired', days_left: 0 },
      { platform: 'facebook', status: 'warning', days_left: 6 },
    ] } })
    expect(m.warnings.find((w) => w.id === 'health:instagram')?.title).toMatch(/ogiltigt, utgånget eller saknas/)
    expect(m.warnings.find((w) => w.id === 'health:facebook')?.detail).toBe('6 dagar kvar vid senaste kontroll.')
    expect(model().warnings).toEqual([])
  })

  it('YouTube is managed in Vercel, reported by presence, and never replaceable here', () => {
    expect(channelOf(model(), 'youtube')).toMatchObject({ source: 'vercel', replaceable: false, stored: null })
    const partial = model({ env: { ...ENV_ALL, YOUTUBE_REFRESH_TOKEN: false } })
    expect(channelOf(partial, 'youtube').source).toBe('vercel_incomplete')
    const none = model({ env: { ...ENV_ALL, YOUTUBE_CLIENT_ID: false, YOUTUBE_CLIENT_SECRET: false, YOUTUBE_REFRESH_TOKEN: false } })
    expect(channelOf(none, 'youtube').source).toBe('missing')
  })

  it('the last replacement is the latest audited replaced event for that platform', () => {
    const m = model({ replacements: { ok: true, rows: [
      { platform: 'facebook', outcome: 'replaced', occurred_at: '2026-09-14T07:00:00.000Z' },
      { platform: 'facebook', outcome: 'replaced', occurred_at: '2026-09-13T07:00:00.000Z' },
    ] } })
    expect(channelOf(m, 'facebook').lastReplacement).toEqual({ state: 'ok', at: '2026-09-14T07:00:00.000Z' })
    expect(channelOf(m, 'instagram').lastReplacement).toEqual({ state: 'ok', at: null })
    expect(channelOf(model({ replacements: { ok: false, reason: 'error' } }), 'instagram').lastReplacement.state).toBe('error')
  })

  it('platform configuration is presence per provider, and every provider listed is one deployed code reads', () => {
    const partial = model({ env: { ...ENV_ALL, YOUTUBE_API_KEY: false } })
    expect(partial.config.find((c) => c.id === 'youtube')).toMatchObject({ set: 3 })
    const exclude = new Set([resolve(WEB_ROOT, FILES.loader), resolve(WEB_ROOT, FILES.legacy)])
    const sources = deployedFiles().filter((f) => !exclude.has(f)).map((f) => readFileSync(f, 'utf8')).join('\n')
    for (const name of PLATFORM_CONFIG.flatMap((item) => item.vars)) {
      expect(sources.includes(`process.env.${name}`), `${name} is listed but no deployed code reads it`).toBe(true)
    }
  })

  it('the fallback names, the project slug and the YouTube variables match the code that uses them', () => {
    const store = read('lib/media/token-store.ts')
    expect(store).toMatch(/instagram:\s+'INSTAGRAM_ACCESS_TOKEN'/)
    expect(store).toMatch(/facebook:\s+'FACEBOOK_PAGE_ACCESS_TOKEN'/)
    expect(store).toContain(`const DEFAULT_SOCIAL_PROJECT_SLUG = '${SOCIAL_PROJECT_SLUG}'`)
    expect(read('app/api/media/token/route.ts')).toContain(`const DEFAULT_SOCIAL_PROJECT_SLUG = '${SOCIAL_PROJECT_SLUG}'`)
    expect(ENV_FALLBACK).toEqual({ instagram: 'INSTAGRAM_ACCESS_TOKEN', facebook: 'FACEBOOK_PAGE_ACCESS_TOKEN' })
    const youtube = read('lib/media/youtube.ts')
    for (const name of YOUTUBE_OAUTH_VARS) expect(youtube).toContain(`process.env.${name}`)
  })

  it('the account shows the stored identity and the owner\'s sign-in statement, through the existing password flow', async () => {
    const m = model()
    expect(m.account).toEqual({ email: 'operator@omnira.test', userId: USER_ID, signInMethod: ACCOUNT_SIGN_IN_METHOD })
    expect(ACCOUNT_SIGN_IN_METHOD).toBe('E-post och lösenord · magisk länk som reserv')
    expect(ACCOUNT_PASSWORD_HREF).toBe('/update-password')
    expect(existsSync(resolve(WEB_ROOT, 'app/(auth)/update-password/page.tsx'))).toBe(true)
    expect(read('middleware.ts')).toMatch(/pathname\.startsWith\('\/update-password'\)/)
    const out = await html(m)
    expect(out).toContain('href="/update-password"')
    expect(out).toContain(ACCOUNT_SIGN_IN_METHOD)
  })
})

// ── 3. No literal claims ─────────────────────────────────────────────────────

describe('settings S1 · nothing the replaced page asserted from literals survives', () => {
  const STALE = /0\.2\.0-MVP|DALL-E|claude-sonnet|Next\.js 14|Kommande funktioner|Magic link|\.env\.local|Schemalagda körningar|team-inbjudningar|SeedButton|Exempeldata|\/api\/seed/

  it('no vNext settings file carries a version, stack, model, roadmap or seed claim', () => {
    for (const rel of [FILES.page, FILES.loader, FILES.shared, FILES.surface, FILES.form]) {
      expect(codeOnly(read(rel)), rel).not.toMatch(STALE)
    }
  })

  it('the rendered surface carries none of them either, and renders the existing display preferences', async () => {
    const out = await html(model())
    expect(out).not.toMatch(STALE)
    expect(out).toContain('DISPLAY PREFERENCES')
    for (const title of ['Konto', 'Visning', 'Kanaler', 'Plattformskonfiguration']) expect(out).toContain(title)
  })

  it('an unreadable source is stated, never rendered as calm', async () => {
    const out = await html(model({ tokenHealth: { ok: false, reason: 'error' } }))
    expect(out).toContain(UNREADABLE_LABEL)
    expect(out).toContain('Token-kontrollen kunde inte läsas')
    expect(out).not.toContain(TOKEN_HEALTH_LABELS.ok)
  })

  it('the loading state is distinct from empty and from unreadable', async () => {
    const { SettingsSurfaceLoading } = await import('@/components/platform/vnext/SettingsSurface')
    const out = renderToStaticMarkup(createElement(SettingsSurfaceLoading))
    expect(out).toContain('Läser inställningarna')
    expect(out).not.toContain(UNREADABLE_LABEL)
  })
})

// ── 4. Capability, not authority ─────────────────────────────────────────────

describe('settings S1 · the form is offered only where the route would accept it', () => {
  it('capability follows the route\'s order: operator first, then the project it writes to', () => {
    expect(model({ operatorOk: false, socialProject: 'foreign' }).capability).toEqual({ allowed: false, reason: 'operator_required' })
    expect(model({ socialProject: 'error' }).capability).toEqual({ allowed: false, reason: 'project_unreadable' })
    expect(model({ socialProject: 'missing' }).capability).toEqual({ allowed: false, reason: 'project_missing' })
    expect(model({ socialProject: 'foreign' }).capability).toEqual({ allowed: false, reason: 'ownership_required' })
    expect(model().capability).toEqual({ allowed: true })
  })

  it('allowed: one write-only form per replaceable channel, none for YouTube', async () => {
    const out = await html(model())
    expect(out).toContain('name="token-instagram"')
    expect(out).toContain('name="token-facebook"')
    expect(out).not.toContain('name="token-youtube"')
    expect(out.match(/data-credential="true"/g) ?? []).toHaveLength(2)
    expect(out).toMatch(/autoComplete="off"|autocomplete="off"/)
  })

  it('not allowed: read-only channels that say why, and no field that could take a token', async () => {
    for (const reason of ['operator_required', 'ownership_required', 'project_missing', 'project_unreadable'] as const) {
      const over: Partial<AssembleSettingsInput> =
        reason === 'operator_required' ? { operatorOk: false }
        : reason === 'ownership_required' ? { socialProject: 'foreign', storedTokens: { ok: false, reason: 'not_read' }, replacements: { ok: false, reason: 'not_read' } }
        : reason === 'project_missing' ? { socialProject: 'missing', storedTokens: { ok: false, reason: 'not_read' }, replacements: { ok: false, reason: 'not_read' } }
        : { socialProject: 'error', storedTokens: { ok: false, reason: 'not_read' }, replacements: { ok: false, reason: 'not_read' } }
      const out = await html(model(over))
      expect(out, reason).not.toContain('<textarea')
      expect(out, reason).not.toContain('data-credential="true"')
      expect(out, reason).toContain(CAPABILITY_NOTES[reason].replace(/"/g, '&quot;').replace(/'/g, '&#x27;'))
      expect((out.match(/Endast läsning/g) ?? []).length, reason).toBe(2)
    }
  })

  it('the loader decides capability with the canonical predicate — never an allowlist of its own', () => {
    const loader = codeOnly(read(FILES.loader))
    expect(loader).toMatch(/import \{ resolvePlatformOperator \} from '@\/lib\/auth\/platform-operator'/)
    expect(loader).toMatch(/const operator = await resolvePlatformOperator\(\)/)
    expect(loader).not.toMatch(/isPlatformOperatorEmail|platformOperatorAllowlist|PLATFORM_OPERATOR_EMAILS|BREVO_ADMIN_EMAIL/)
    expect(loader).toMatch(/assertProjectAllowed\(projectId, access\.allowedProjectIds\)/)
  })

  it('the form posts to the existing route and nowhere else', () => {
    const form = codeOnly(read(FILES.form))
    expect(CREDENTIAL_ENDPOINT).toBe('/api/media/token')
    expect(existsSync(resolve(WEB_ROOT, 'app/api/media/token/route.ts'))).toBe(true)
    expect(form.match(/fetch\(/g) ?? []).toHaveLength(1)
    expect(form).toMatch(/fetch\(CREDENTIAL_ENDPOINT, \{\s*method: 'POST'/)
    expect(form).toMatch(/^'use client'/)
  })

  it('the form is write-only: the field is emptied before the request leaves, and never pre-filled', () => {
    const form = codeOnly(read(FILES.form))
    const submit = form.slice(form.indexOf('const submit'), form.indexOf('const fieldId'))
    expect(submit.indexOf("setToken('')")).toBeGreaterThan(-1)
    expect(submit.indexOf("setToken('')")).toBeLessThan(submit.indexOf('await fetch('))
    expect(form).toMatch(/useState\(''\)/)
    expect(form).toMatch(/value=\{token\}/)
    expect(form).not.toMatch(/defaultValue/)
    expect(form).toMatch(/autoComplete="off"/)
    expect(form).toMatch(/spellCheck=\{false\}/)
    expect(form).toMatch(/MIN_TOKEN_LENGTH/)
    expect(MIN_TOKEN_LENGTH).toBe(50)
    expect(read('app/api/media/token/route.ts')).toMatch(/token\.length < 50/)
  })

  it('nothing but the form writes: the loader, surface, shared contract and page are read-only', () => {
    for (const rel of [FILES.loader, FILES.surface, FILES.shared, FILES.page]) {
      expect(codeOnly(read(rel)), rel).not.toMatch(/'use server'|fetch\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|rpc\(/)
    }
    expect(read(FILES.surface)).not.toMatch(/^'use client'/)
  })

  it('writes no memory and triggers no Dream', () => {
    for (const rel of [FILES.loader, FILES.surface, FILES.form, FILES.page]) {
      expect(codeOnly(read(rel)), rel).not.toMatch(/recordMemoryEvent|atlas\/memory|runDreamCycleForProject|lib\/ai\/dream|recordAction/)
    }
  })
})

describe('settings S1 · the route\'s answer is shown as what it was', () => {
  const OP = '5b0c1f7e-9d2a-4c61-8f3e-2a7d9b4c6e10'

  it('a completed replacement is replaced, with its audit operation and Facebook\'s three answers', () => {
    const answer = replacementOutcome(200, { ok: true, replaced: true, operation_id: OP, exchanged: true, pageResolved: false, readInsightsOk: true })
    expect(answer).toEqual({
      kind: 'replaced', message: 'Tokenet är ersatt och ersättningen är revisionsloggad.', operationId: OP,
      facebook: { exchanged: true, pageResolved: false, readInsightsOk: true },
    })
  })

  it('an audit integrity incident is an incident — never a success, never "nothing happened"', () => {
    const answer = replacementOutcome(500, { ok: false, replaced: true, audit_incident: 'terminal_event_not_recorded', operation_id: OP, error: 'Tokenet ersattes, men revisionsloggen kunde inte slutföras.' })
    expect(answer.kind).toBe('incident')
    expect(answer.operationId).toBe(OP)
    expect(answer.facebook).toBeNull()
  })

  it('refusals are refusals, in the route\'s terms', () => {
    expect(replacementOutcome(401, { error: 'Unauthorized' }).kind).toBe('refused')
    expect(replacementOutcome(403, { error: 'Forbidden', denied: 'platform_operator_required' }).message).toMatch(/plattformsoperatörens behörighet/)
    expect(replacementOutcome(403, { error: 'Forbidden' }).message).toMatch(/äger inte projektet/)
    expect(replacementOutcome(400, { error: 'Tokenet ser för kort ut — klistra in hela värdet' })).toMatchObject({ kind: 'refused', message: 'Tokenet ser för kort ut — klistra in hela värdet' })
  })

  it('an attempt that could not be audited did not happen, and says so', () => {
    const answer = replacementOutcome(503, { ok: false, replaced: false, operation_id: OP, error: 'Ersättningen kunde inte revisionsloggas och har inte genomförts. Inget token har skickats till Meta eller sparats.' })
    expect(answer).toMatchObject({ kind: 'failed', operationId: OP })
    expect(answer.message).toMatch(/har inte genomförts/)
  })

  it('an unreadable answer is a failure, and a lost request may still have gone through', () => {
    expect(replacementOutcome(502, null)).toMatchObject({ kind: 'failed', message: 'Tokenet kunde inte ersättas.' })
    expect(SEND_FAILED_MESSAGE).toMatch(/kan ha genomförts/)
  })
})

// ── Generation ───────────────────────────────────────────────────────────────

describe('settings S1 · generation', () => {
  const loadSpy = vi.fn(async () => model())
  let cookieValue: string | null = null

  beforeEach(() => {
    vi.resetModules()
    loadSpy.mockClear()
    cookieValue = null
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: (n: string) => (cookieValue && n === 'omnira_ui' ? { value: cookieValue } : undefined) }),
    }))
    vi.doMock('@/lib/os/settings', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/os/settings')>()),
      loadSettings: loadSpy,
    }))
    vi.doMock('@/app/(platform)/settings/SettingsLegacy', () => ({
      SettingsLegacy: () => createElement('div', { id: 'legacy-body' }),
    }))
  })

  it('renders vNext by default', async () => {
    const { default: Page } = await import('@/app/(platform)/settings/page')
    const element = await Page() as React.ReactElement
    expect(element.type).toBe(React.Suspense)
    const inner = (element.props as { children: React.ReactElement }).children
    expect((inner.type as { name?: string }).name).toBe('LoadedSettings')
  })

  it('`?ui=legacy` renders the legacy body', async () => {
    cookieValue = 'legacy'
    const { default: Page } = await import('@/app/(platform)/settings/page')
    expect(renderToStaticMarkup(await Page() as React.ReactElement)).toContain('legacy-body')
  })

  it('the legacy branch never runs the vNext loader', async () => {
    cookieValue = 'legacy'
    const { default: Page } = await import('@/app/(platform)/settings/page')
    renderToStaticMarkup(await Page() as React.ReactElement)
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('an unresolvable session or scope is a redirect, never a page', async () => {
    loadSpy.mockResolvedValueOnce(null as unknown as SettingsModel)
    const { default: Page } = await import('@/app/(platform)/settings/page')
    const element = await Page() as React.ReactElement
    const inner = (element.props as { children: React.ReactElement }).children
    await expect((inner.type as (p: unknown) => Promise<unknown>)(inner.props)).rejects.toThrow(/NEXT_REDIRECT/)
  })

  it('hands the existing display preferences in as the Visning slot', () => {
    const page = read(FILES.page)
    expect(page).toMatch(/import \{ DisplayPreferences \} from '\.\/DisplayPreferences'/)
    expect(page).toMatch(/displayPreferences=\{<DisplayPreferences \/>\}/)
    expect(codeOnly(read(FILES.surface))).not.toMatch(/useDisplayPreferences|display-scale|omnira:motion/)
  })
})

// ── The loader, executed ─────────────────────────────────────────────────────

describe('settings S1 · the loader reads inside the session boundary', () => {
  interface Recorded { table: string; select: string; filters: [string, unknown][] }
  let queries: Recorded[]
  let access: unknown
  let operatorOk: boolean
  let operatorCalls: number
  let projectLookup: { data: unknown; error: unknown }

  function fakeQuery(table: string) {
    const rec: Recorded = { table, select: '', filters: [] }
    queries.push(rec)
    const api: Record<string, unknown> = {
      select(select: string) { rec.select = select; return api },
      eq(c: string, v: unknown) { rec.filters.push([`eq:${c}`, v]); return api },
      in(c: string, v: unknown) { rec.filters.push([`in:${c}`, v]); return api },
      order() { return api },
      limit() { return api },
      maybeSingle() { return Promise.resolve(table === 'projects' ? projectLookup : { data: null, error: null }) },
      then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(ok, err)
      },
    }
    return api
  }

  beforeEach(() => {
    vi.doUnmock('@/lib/os/settings')
    vi.doUnmock('@/app/(platform)/settings/SettingsLegacy')
    vi.doUnmock('next/headers')
    vi.resetModules()
    queries = []
    operatorCalls = 0
    operatorOk = true
    access = { ok: true, userId: USER_ID, allowedProjectIds: [SOCIAL_ID, 'another-project'] }
    projectLookup = { data: { id: SOCIAL_ID }, error: null }
    vi.doMock('@/lib/auth/project-access', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/auth/project-access')>()),
      resolveProjectAccess: async () => access,
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER_ID, email: 'operator@omnira.test' } } }) } }),
    }))
    vi.doMock('@/lib/auth/platform-operator', () => ({
      resolvePlatformOperator: async () => {
        operatorCalls += 1
        return operatorOk
          ? { ok: true, userId: USER_ID, email: 'operator@omnira.test', actor: `user:${USER_ID}` }
          : { ok: false, reason: 'not_platform_operator' }
      },
    }))
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fakeQuery }) }))
  })

  it('an unresolvable scope returns null before any read or predicate', async () => {
    access = { ok: false, response: null }
    const { loadSettings } = await import('@/lib/os/settings')
    expect(await loadSettings()).toBeNull()
    expect(queries).toEqual([])
    expect(operatorCalls).toBe(0)
  })

  it('owned: project data is read only for the social project, and every select is metadata', async () => {
    const { loadSettings } = await import('@/lib/os/settings')
    const m = await loadSettings()
    expect(m?.capability).toEqual({ allowed: true })
    expect(operatorCalls).toBe(1)
    expect(queries.find((q) => q.table === 'projects')?.filters).toContainEqual(['eq:slug', SOCIAL_PROJECT_SLUG])
    const tokens = queries.find((q) => q.table === 'platform_tokens')!
    expect(tokens.select).toBe('platform, token_type, expires_at, refreshed_at')
    expect(tokens.filters).toContainEqual(['eq:project_id', SOCIAL_ID])
    const events = queries.find((q) => q.table === 'platform_credential_events')!
    expect(events.select).toBe('platform, outcome, occurred_at')
    expect(events.filters).toContainEqual(['eq:project_id', SOCIAL_ID])
    expect(events.filters).toContainEqual(['eq:outcome', 'replaced'])
    expect(queries.find((q) => q.table === 'token_health')?.select).toBe('platform, status, days_left, expires_at, last_verified_at, last_refreshed_at')
    for (const q of queries) expect(q.select, q.table).not.toMatch(/access_token|last_error|\*/)
  })

  it('a social project outside the scope is never read: status only, no form', async () => {
    access = { ok: true, userId: USER_ID, allowedProjectIds: ['another-project'] }
    const { loadSettings } = await import('@/lib/os/settings')
    const m = await loadSettings()
    expect(queries.map((q) => q.table).sort()).toEqual(['projects', 'token_health'])
    expect(m?.capability).toEqual({ allowed: false, reason: 'ownership_required' })
    expect(m?.channels.find((c) => c.id === 'instagram')?.source).toBe('out_of_scope')
  })

  it('failing the operator predicate removes the form and nothing else', async () => {
    operatorOk = false
    const { loadSettings } = await import('@/lib/os/settings')
    const m = await loadSettings()
    expect(m?.capability).toEqual({ allowed: false, reason: 'operator_required' })
    expect(queries.map((q) => q.table)).toContain('platform_tokens')
  })

  it('an unreadable or missing social project reads no project data and offers no replacement', async () => {
    projectLookup = { data: null, error: { code: 'XX000' } }
    let { loadSettings } = await import('@/lib/os/settings')
    let m = await loadSettings()
    expect(m?.capability).toEqual({ allowed: false, reason: 'project_unreadable' })
    expect(m?.channels.find((c) => c.id === 'facebook')?.source).toBe('unreadable')
    expect(queries.map((q) => q.table).sort()).toEqual(['projects', 'token_health'])

    queries = []
    projectLookup = { data: null, error: null }
    vi.resetModules()
    ;({ loadSettings } = await import('@/lib/os/settings'))
    m = await loadSettings()
    expect(m?.capability).toEqual({ allowed: false, reason: 'project_missing' })
    expect(queries.map((q) => q.table).sort()).toEqual(['projects', 'token_health'])
  })
})

// ── Rollback ─────────────────────────────────────────────────────────────────

describe('settings S1 · the legacy rollback is the page that shipped', () => {
  it('the legacy body is the previous page verbatim — pinned by hash', () => {
    const legacy = read(FILES.legacy)
    const body = legacy.slice(legacy.indexOf('import '))
    expect(createHash('sha256').update(body).digest('hex')).toBe('3cd199ffdc6fc5b14c0a7ea3beab0f04c28d22a32cae834d0fb10825a1fc74de')
  })

  it('the legacy body keeps its own instruments and exports by name; vNext has none of them', () => {
    const legacy = read(FILES.legacy)
    expect(legacy).toMatch(/export async function SettingsLegacy\(\)/)
    expect(legacy).not.toMatch(/export default|export const dynamic/)
    expect(legacy).toMatch(/<TokenUpdater \/>/)
    expect(legacy).toMatch(/<DisplayPreferences \/>/)
    expect(legacy).toContain('Magic link (e-post)')
    expect(codeOnly(read(FILES.surface))).not.toMatch(/TokenUpdater|StatusChip|OSPage/)
  })
})

// ── Layout contract (static) ─────────────────────────────────────────────────

describe('settings S1 · layout, scale and motion', () => {
  const css = read(FILES.css)

  it('sizes in rem so the display-scale preference reaches it', () => {
    expect(css.match(/font-size:\s*\d+px/g) ?? []).toEqual([])
    expect(css).toMatch(/font-size: 0\.\d+rem/)
  })

  it('declares the surface font locally, as the other vNext surfaces do', () => {
    expect(css).toMatch(/font-family: var\(--font-geist-sans\)/)
  })

  it('sets the credential form apart from the status it sits beside', () => {
    expect(css).toMatch(/\.replace \{[\s\S]*?border: 1px solid rgb\(248 113 113/)
    expect(read(FILES.form)).toMatch(/data-credential="true"/)
  })

  it('collapses to one column when narrow and never scrolls sideways', () => {
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/)
    expect(css).toMatch(/overflow-x: hidden/)
    expect(css).toMatch(/@media \(max-width: 768px\)/)
  })

  it('respects reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })
})
