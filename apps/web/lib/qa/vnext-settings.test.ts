/**
 * vNext Settings — Inställningar (`/settings`), project-scoped.
 *
 * Five risks carry this surface, and the suite is organised around them:
 *
 *   1. READING A SECRET TO SHOW A STATUS. Every read is metadata — never
 *      `platform_tokens.access_token`, never provider text — and environment variables
 *      are presence only.
 *
 *   2. CROSS-PROJECT CREDENTIAL CONFUSION (project-scoped social credentials,
 *      2026-09-14). The relation is Project → Platform → Verified External Account →
 *      Credential. Each owned project is its own block; a binding, credential, check or
 *      replacement of one project must never appear under — or be offered for —
 *      another, and nothing is read for a project the session does not own. There is
 *      no default project.
 *
 *   3. BECOMING AN AUTHORITY SOURCE. Replacement is `POST /api/media/token`,
 *      verification `POST /api/media/social-accounts/verify` and a YouTube connection
 *      `POST /api/media/youtube/oauth/start`; each owns the operator
 *      gate, ownership of the named project and the audit. Settings only mirrors the
 *      operator predicate to decide whether to offer them, and the forms post nowhere
 *      else.
 *
 *   4. CLAIMING WHAT NOBODY STORES. An unreadable source says so, an absent check is
 *      unchecked — not healthy — and a name no platform attested is said to be
 *      unverified, never guessed.
 *
 *   5. LOSING THE ROLLBACK. `?ui=legacy` renders the previous body exactly — pinned by hash.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import {
  assembleSettings,
  envPresence,
  PLATFORM_CONFIG,
  YOUTUBE_OAUTH_VARS,
  type AssembleSettingsInput,
  type SettingsModel,
} from '@/lib/os/settings'
import type { SocialAccountBinding } from '@/lib/media/social-bindings'
import {
  ACCOUNT_PASSWORD_HREF,
  ACCOUNT_SIGN_IN_METHOD,
  CAPABILITY_NOTES,
  CREDENTIAL_ENDPOINT,
  HEALTH_LABELS,
  MIN_TOKEN_LENGTH,
  PROJECT_SCOPE_NOTE,
  SEND_FAILED_MESSAGE,
  UNATTESTED_NAMES,
  UNREADABLE_LABEL,
  VERIFY_ENDPOINT,
  YOUTUBE_CLIENT_MISSING_NOTE,
  YOUTUBE_CONNECT_NOTE,
  YOUTUBE_CONNECT_OUTCOMES,
  YOUTUBE_CONSENT_ORIGIN,
  YOUTUBE_NOTE,
  YOUTUBE_OAUTH_START_ENDPOINT,
  replacementOutcome,
  verificationOutcome,
  youtubeConnectOutcome,
  youtubeStartOutcome,
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
  verify: 'components/platform/vnext/SettingsVerifyButton.tsx',
  connect: 'components/platform/vnext/SettingsYouTubeConnect.tsx',
  css: 'components/platform/vnext/SettingsSurface.module.css',
} as const

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = '2026-09-14T09:00:00.000Z'
const USER_ID = '0f8a2c4e-6b1d-4e3f-9a5c-7d2e8b1f4a6c'
const PROMPT_ID = '33333333-3333-4333-8333-333333333333'
const FAMILY_ID = '44444444-4444-4444-8444-444444444444'
const GAIN_ID = '55555555-5555-4555-8555-555555555555'
const FOREIGN_ID = '66666666-6666-4666-8666-666666666666'
const IG_ACCOUNT = '17841437027967629'
const FB_PAGE = '1138612202672850'
const YT_CHANNEL = 'UCUM9JDi75ziLssYcGLo8IPA'

const ALL_VARS = [...new Set([...YOUTUBE_OAUTH_VARS, ...PLATFORM_CONFIG.flatMap((item) => item.vars)])]
const ENV_ALL: Record<string, boolean> = Object.fromEntries(ALL_VARS.map((name) => [name, true]))

let bindingSeq = 0
function binding(over: Partial<SocialAccountBinding> & Pick<SocialAccountBinding, 'projectId' | 'platform' | 'externalAccountId'>): SocialAccountBinding {
  bindingSeq += 1
  return {
    bindingId: `77777777-7777-4777-8777-${String(bindingSeq).padStart(12, '0')}`,
    accountLabel: null,
    credentialSource: over.platform === 'youtube' ? 'platform_env_transitional' : 'project_store',
    verification: 'provider_attested',
    verifiedAt: '2026-09-14T06:15:00.000Z',
    boundBy: `user:${USER_ID}`,
    boundAt: '2026-09-14T08:00:00.000Z',
    blockedAt: null,
    blockedReason: null,
    ...over,
  }
}

function input(over: Partial<AssembleSettingsInput> = {}): AssembleSettingsInput {
  return {
    now: NOW,
    account: { email: 'operator@omnira.test', userId: USER_ID },
    operatorOk: true,
    projects: { ok: true, rows: [
      { id: PROMPT_ID, name: 'The Prompt', slug: 'ai-media-automation' },
      { id: FAMILY_ID, name: 'Familje-Stunden', slug: 'familje-stunden' },
      { id: GAIN_ID, name: 'GainPilot', slug: 'gainpilot' },
    ] },
    bindings: { ok: true, bindings: [
      binding({ projectId: PROMPT_ID, platform: 'instagram', externalAccountId: IG_ACCOUNT, accountLabel: 'theprompt.news' }),
      binding({ projectId: PROMPT_ID, platform: 'facebook', externalAccountId: FB_PAGE, verification: 'runtime_evidence' }),
      binding({ projectId: PROMPT_ID, platform: 'youtube', externalAccountId: YT_CHANNEL, verification: 'runtime_evidence' }),
    ] },
    storedTokens: { ok: true, rows: [
      { project_id: PROMPT_ID, platform: 'instagram', token_type: 'user', account_id: null, expires_at: '2026-11-13T06:00:06.627Z', refreshed_at: '2026-09-14T06:00:06.753Z' },
      { project_id: PROMPT_ID, platform: 'facebook', token_type: 'page', account_id: FB_PAGE, expires_at: null, refreshed_at: '2026-06-05T08:51:09.423Z' },
    ] },
    health: { ok: true, rows: [
      { project_id: PROMPT_ID, platform: 'instagram', status: 'ok', identity_verified: true, verified_account_id: IG_ACCOUNT, checked_at: '2026-09-14T06:15:00.000Z', expires_at: '2026-11-13T06:00:06.627Z', days_left: 60, last_refreshed_at: '2026-09-14T06:00:07.000Z' },
      { project_id: PROMPT_ID, platform: 'facebook', status: 'ok', identity_verified: true, verified_account_id: FB_PAGE, checked_at: '2026-09-14T06:15:00.000Z', expires_at: null, days_left: null, last_refreshed_at: null },
      { project_id: PROMPT_ID, platform: 'youtube', status: 'ok', identity_verified: false, verified_account_id: null, checked_at: '2026-09-14T06:15:00.000Z', expires_at: null, days_left: null, last_refreshed_at: null },
    ] },
    replacements: { ok: true, rows: [] },
    env: { ...ENV_ALL },
    ...over,
  }
}
const model = (over: Partial<AssembleSettingsInput> = {}) => assembleSettings(input(over))
const projectsOf = (m: SettingsModel) => (m.projects.state === 'ok' ? m.projects.items : [])
const projectOf = (m: SettingsModel, id: string) => projectsOf(m).find((p) => p.id === id)!
const channelOf = (m: SettingsModel, projectId: string, platform: string) => projectOf(m, projectId).channels.find((c) => c.id === platform)!

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

describe('settings · credential-blind by construction', () => {
  it('the loader selects metadata only — never access_token, never provider text, never *', () => {
    const loader = codeOnly(read(FILES.loader))
    expect(loader).toMatch(/from\('platform_tokens'\) as any\)\s*\.select\('project_id, platform, token_type, account_id, expires_at, refreshed_at'\)/)
    expect(loader).toMatch(/\(db as any\)\.from\('social_credential_health'\)\s*\.select\('project_id, platform, status, identity_verified, verified_account_id, checked_at, expires_at, days_left, last_refreshed_at'\)/)
    expect(loader).toMatch(/\(db as any\)\.from\('platform_credential_events'\)\s*\.select\('project_id, platform, outcome, occurred_at, binding_action'\)/)
    expect(loader).toMatch(/listActiveBindings\(owned, db\)/)
    expect(loader).not.toMatch(/access_token|last_error|token_health|select\('\*'\)|readStoredCredential|resolve(Instagram|Facebook|YouTube)Credential|createCredentialResolver/)
  })

  it('no settings file names a credential column, reads a credential, or keeps anything in the browser', () => {
    for (const rel of [FILES.page, FILES.loader, FILES.shared, FILES.surface, FILES.form, FILES.verify, FILES.connect]) {
      const code = codeOnly(read(rel))
      expect(code, rel).not.toMatch(/access_token|last_error|lib\/media\/token-store|lib\/media\/social-credentials|localStorage|sessionStorage|document\.cookie/)
    }
    for (const rel of [FILES.shared, FILES.surface, FILES.form, FILES.verify, FILES.connect, FILES.page]) {
      expect(codeOnly(read(rel)), rel).not.toMatch(/process\.env/)
    }
    for (const rel of [FILES.form, FILES.verify, FILES.connect]) expect(codeOnly(read(rel)), rel).not.toMatch(/console\./)
  })

  it('the binding columns the loader reads hold no credential', () => {
    const bindings = read('lib/media/social-bindings.ts')
    const columns = bindings.match(/export const BINDING_COLUMNS =\s*'([^']+)'/)![1].split(',').map((c) => c.trim())
    for (const column of columns) expect(column).not.toMatch(/token|secret|hash|key|password|credential_value/)
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
      // The retired environment fallbacks are no longer reported — nothing reads them.
      expect(Object.keys(presence)).not.toContain('INSTAGRAM_ACCESS_TOKEN')
      expect(Object.keys(presence)).not.toContain('FACEBOOK_PAGE_ACCESS_TOKEN')
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

// ── 2. Project-scoped ────────────────────────────────────────────────────────

describe('settings · Project → Platform → Verified External Account → Credential', () => {
  it('every owned project is its own block, with its own Instagram, Facebook and YouTube', () => {
    const m = model()
    expect(projectsOf(m).map((p) => p.name)).toEqual(['The Prompt', 'Familje-Stunden', 'GainPilot'])
    for (const project of projectsOf(m)) expect(project.channels.map((c) => c.id)).toEqual(['instagram', 'facebook', 'youtube'])
  })

  it("one project's binding, credential, check and replacement never appear under another project", () => {
    const m = model({ replacements: { ok: true, rows: [
      { project_id: PROMPT_ID, platform: 'instagram', outcome: 'replaced', occurred_at: '2026-09-14T08:30:00.000Z', binding_action: 'matched' },
    ] } })
    for (const id of [FAMILY_ID, GAIN_ID]) {
      for (const channel of projectOf(m, id).channels) {
        expect(channel.account, `${id} ${channel.id}`).toEqual({ state: 'none' })
        expect(channel.health.status, `${id} ${channel.id}`).toBe('unchecked')
        expect(channel.lastReplacement.at, `${id} ${channel.id}`).toBeNull()
        expect(channel.credential.state, `${id} ${channel.id}`).toBe('missing')
      }
    }
    expect(channelOf(m, PROMPT_ID, 'instagram').lastReplacement).toEqual({ state: 'ok', at: '2026-09-14T08:30:00.000Z', bindingAction: 'matched' })
  })

  it('rows of a project the session does not own are ignored — never attached to a shown project', () => {
    const base = input()
    const m = assembleSettings({
      ...base,
      bindings: { ok: true, bindings: [
        ...(base.bindings.ok ? base.bindings.bindings : []),
        binding({ projectId: FOREIGN_ID, platform: 'facebook', externalAccountId: '999999999999' }),
      ] },
      storedTokens: { ok: true, rows: [
        ...(base.storedTokens.ok ? base.storedTokens.rows : []),
        { project_id: FOREIGN_ID, platform: 'instagram', token_type: 'user', account_id: '17840000000000000', expires_at: null, refreshed_at: NOW },
      ] },
    })
    expect(projectsOf(m).map((p) => p.id)).not.toContain(FOREIGN_ID)
    expect(JSON.stringify(m)).not.toContain('999999999999')
    expect(JSON.stringify(m)).not.toContain('17840000000000000')
  })

  it('the rendered surface states the project on every form, and each form sends its own project id', async () => {
    const out = await html(model())
    for (const name of ['The Prompt', 'Familje-Stunden', 'GainPilot']) expect(out).toContain(`Spara för ${name}`)
    for (const id of [PROMPT_ID, FAMILY_ID, GAIN_ID]) expect(out).toContain(`data-project="${id}"`)
    expect(out).toContain(PROJECT_SCOPE_NOTE)
    const form = codeOnly(read(FILES.form))
    expect(form).toMatch(/const body: Record<string, unknown> = \{ project_id: projectId, platform, token: value \}/)
  })

  it('no settings file names a default, first or implicit project', () => {
    for (const rel of [FILES.page, FILES.loader, FILES.shared, FILES.surface, FILES.form, FILES.verify, FILES.connect]) {
      expect(codeOnly(read(rel)), rel).not.toMatch(/ai-media-automation|SOCIAL_PROJECT_SLUG|DEFAULT_SOCIAL_PROJECT|The Prompt/)
    }
  })

  it('a session that owns no project sees no project and no form', async () => {
    const m = model({ projects: { ok: true, rows: [] } })
    expect(projectsOf(m)).toEqual([])
    const out = await html(m)
    expect(out).not.toContain('data-credential="true"')
    expect(out).toContain('Du äger inga projekt ännu.')
  })
})

// ── 3. Truthful status ───────────────────────────────────────────────────────

describe('settings · the account and credential status are what the sources say', () => {
  it('a bound account shows the provider id and only the name a platform attested', async () => {
    const m = model()
    expect(channelOf(m, PROMPT_ID, 'instagram').account).toMatchObject({
      state: 'bound', bound: { externalAccountId: IG_ACCOUNT, label: 'theprompt.news', verification: 'provider_attested', blocked: false },
    })
    const out = await html(m)
    expect(out).toContain('@theprompt.news')
    expect(out).toContain(IG_ACCOUNT)
    // Facebook's page name was never attested: said, not guessed — with the page id it is bound to.
    expect(out).toContain(UNATTESTED_NAMES.facebook)
    expect(out).toContain(FB_PAGE)
    expect(out).toContain('Bundet från verifierad runtime-evidens')
  })

  it('Facebook shows the verified page by name once a platform has attested it', async () => {
    const base = input()
    const bindings = base.bindings.ok ? base.bindings.bindings : []
    const m = assembleSettings({ ...base, bindings: { ok: true, bindings: bindings.map((b) =>
      b.platform === 'facebook' ? { ...b, accountLabel: 'The Prompt Page', verification: 'provider_attested' as const } : b) } })
    const out = await html(m)
    expect(out).toContain('The Prompt Page')
    expect(out).toContain('Verifierat av plattformen')
    expect(out).not.toContain(UNATTESTED_NAMES.facebook)
  })

  it('no binding is "no account"; an unreadable binding read is unreadable and warned', () => {
    expect(channelOf(model(), FAMILY_ID, 'instagram').account).toEqual({ state: 'none' })
    const m = model({ bindings: { ok: false } })
    expect(channelOf(m, PROMPT_ID, 'instagram').account).toEqual({ state: 'unreadable' })
    expect(m.warnings.map((w) => w.id)).toContain('unreadable:bindings')
  })

  it('a stored credential carries its metadata and whether its recorded account is the bound one', () => {
    expect(channelOf(model(), PROMPT_ID, 'facebook').credential).toEqual({
      state: 'stored', expiresAt: null, refreshedAt: '2026-06-05T08:51:09.423Z', matchesBinding: true,
    })
    expect(channelOf(model(), PROMPT_ID, 'instagram').credential.matchesBinding).toBeNull()
    const base = input()
    const m = assembleSettings({ ...base, storedTokens: { ok: true, rows: [
      { project_id: PROMPT_ID, platform: 'facebook', token_type: 'page', account_id: '5550000000000', expires_at: null, refreshed_at: NOW },
    ] } })
    expect(channelOf(m, PROMPT_ID, 'facebook').credential.matchesBinding).toBe(false)
    expect(m.warnings.map((w) => w.id)).toContain(`mismatch:${PROMPT_ID}:facebook`)
  })

  it('an unreadable credential read is unreadable — never missing — and says so', () => {
    const m = model({ storedTokens: { ok: false } })
    expect(channelOf(m, PROMPT_ID, 'instagram').credential.state).toBe('unreadable')
    expect(m.warnings.map((w) => w.id)).toContain('unreadable:credentials')
  })

  it('verification: unreadable is not healthy, no row is unchecked, an unknown status is unknown', () => {
    const unreadable = model({ health: { ok: false } })
    expect(channelOf(unreadable, PROMPT_ID, 'instagram').health.readable).toBe(false)
    expect(unreadable.warnings.map((w) => w.id)).toContain('unreadable:health')
    expect(channelOf(model({ health: { ok: true, rows: [] } }), PROMPT_ID, 'youtube').health.status).toBe('unchecked')
    const odd = model({ health: { ok: true, rows: [{ project_id: PROMPT_ID, platform: 'instagram', status: 'fine-probably' }] } })
    expect(channelOf(odd, PROMPT_ID, 'instagram').health.status).toBe('unknown')
  })

  it('every broken verification raises a warning naming the project and the channel', () => {
    const rows = (status: string) => ({ ok: true as const, rows: [{ project_id: PROMPT_ID, platform: 'instagram', status, days_left: status === 'warning' ? 6 : null }] })
    for (const [status, pattern] of [
      ['expired', /ogiltig eller har gått ut/],
      ['account_mismatch', /tillhör inte projektets konto/],
      ['credential_missing', /credential saknas/],
      ['verification_failed', /kunde inte verifieras/],
      ['warning', /löper snart ut/],
    ] as const) {
      const warning = model({ health: rows(status) }).warnings.find((w) => w.id === `health:${PROMPT_ID}:instagram`)
      expect(warning?.title, status).toMatch(pattern)
      expect(warning?.title, status).toMatch(/^The Prompt · Instagram: /)
    }
    expect(model().warnings).toEqual([])
  })

  it('a blocked binding is warned and shown as blocked', async () => {
    const base = input()
    const bindings = base.bindings.ok ? base.bindings.bindings : []
    const m = assembleSettings({ ...base, bindings: { ok: true, bindings: bindings.map((b) =>
      b.platform === 'youtube' ? { ...b, blockedAt: NOW, blockedReason: 'account_mismatch' } : b) } })
    expect(m.warnings.map((w) => w.id)).toContain(`blocked:${PROMPT_ID}:youtube`)
    expect(await html(m)).toContain('Spärrad — plattformen rapporterade ett annat konto')
  })

  it('YouTube (Y1): the bound transitional credential by presence, never token-replaceable — and connectable to the project’s own connection', async () => {
    expect(channelOf(model(), PROMPT_ID, 'youtube')).toMatchObject({ replaceable: false, connectable: true, credential: { state: 'environment_transitional' } })
    expect(channelOf(model({ env: { ...ENV_ALL, YOUTUBE_REFRESH_TOKEN: false } }), PROMPT_ID, 'youtube').credential.state).toBe('environment_incomplete')
    const out = await html(model())
    expect(out).toContain(YOUTUBE_NOTE)
    expect(out).not.toContain('name="token-youtube"')
    expect(out.match(/data-youtube-connect="migrate"/g) ?? []).toHaveLength(1)
  })

  it('YouTube (Y2a): every other project connects its own channel; a stored connection is the project’s own and reconnects', async () => {
    expect(channelOf(model(), GAIN_ID, 'youtube')).toMatchObject({
      replaceable: false, connectable: true, account: { state: 'none' }, credential: { state: 'missing' },
    })
    for (const platform of ['instagram', 'facebook']) expect(channelOf(model(), PROMPT_ID, platform).connectable, platform).toBe(false)
    const out = await html(model())
    expect(out).toContain(YOUTUBE_CONNECT_NOTE)
    expect(out.match(/data-youtube-connect="connect"/g) ?? []).toHaveLength(2)

    const base = input()
    const connected = assembleSettings({
      ...base,
      bindings: { ok: true, bindings: [
        ...(base.bindings.ok ? base.bindings.bindings : []),
        binding({ projectId: FAMILY_ID, platform: 'youtube', externalAccountId: 'UCfamily000000000000000', credentialSource: 'project_store', accountLabel: 'Familje-Stunden' }),
      ] },
      storedTokens: { ok: true, rows: [
        ...(base.storedTokens.ok ? base.storedTokens.rows : []),
        { project_id: FAMILY_ID, platform: 'youtube', token_type: 'oauth_refresh', account_id: 'UCfamily000000000000000', expires_at: null, refreshed_at: NOW },
      ] },
    })
    expect(channelOf(connected, FAMILY_ID, 'youtube')).toMatchObject({
      connectable: true, credential: { state: 'stored', refreshedAt: NOW, matchesBinding: true },
    })
    expect(channelOf(connected, PROMPT_ID, 'youtube').credential.state).toBe('environment_transitional')
    const rendered = await html(connected)
    expect(rendered.match(/data-youtube-connect="reconnect"/g) ?? []).toHaveLength(1)
    expect(rendered.match(/data-youtube-connect="connect"/g) ?? []).toHaveLength(1)
  })

  it('YouTube without the platform’s OAuth client connects nothing, and says why', async () => {
    const m = model({ env: { ...ENV_ALL, YOUTUBE_CLIENT_SECRET: false } })
    for (const id of [PROMPT_ID, FAMILY_ID, GAIN_ID]) expect(channelOf(m, id, 'youtube').connectable, id).toBe(false)
    const out = await html(m)
    expect(out).not.toContain('data-youtube-connect=')
    expect(out).toContain(YOUTUBE_CLIENT_MISSING_NOTE)
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

  it('the YouTube variables are exactly the Y1 grant the code reads', () => {
    const youtube = read('lib/media/youtube.ts')
    for (const name of YOUTUBE_OAUTH_VARS) expect(youtube).toContain(`process.env.${name}`)
  })

  it("the account shows the stored identity and the owner's sign-in statement, through the existing password flow", async () => {
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

// ── 4. No literal claims ─────────────────────────────────────────────────────

describe('settings · nothing the replaced page asserted from literals survives', () => {
  const STALE = /0\.2\.0-MVP|DALL-E|claude-sonnet|Next\.js 14|Kommande funktioner|Magic link|\.env\.local|Schemalagda körningar|team-inbjudningar|SeedButton|Exempeldata|\/api\/seed/

  it('no vNext settings file carries a version, stack, model, roadmap or seed claim', () => {
    for (const rel of [FILES.page, FILES.loader, FILES.shared, FILES.surface, FILES.form, FILES.verify, FILES.connect]) {
      expect(codeOnly(read(rel)), rel).not.toMatch(STALE)
    }
  })

  it('the rendered surface carries none of them either, and renders the existing display preferences', async () => {
    const out = await html(model())
    expect(out).not.toMatch(STALE)
    expect(out).toContain('DISPLAY PREFERENCES')
    for (const title of ['Konto', 'Visning', 'Projekt och sociala konton', 'Plattformskonfiguration']) expect(out).toContain(title)
  })

  it('an unreadable source is stated, never rendered as calm', async () => {
    const out = await html(model({ health: { ok: false } }))
    expect(out).toContain(UNREADABLE_LABEL)
    expect(out).toContain('Verifieringarna kunde inte läsas')
    expect(out).not.toContain(HEALTH_LABELS.ok)
  })

  it('unreadable projects are stated too — not "no projects"', async () => {
    const out = await html(model({ projects: { ok: false } }))
    expect(out).toContain('Dina projekt kunde inte läsas')
    expect(out).not.toContain('Du äger inga projekt ännu.')
  })

  it('the loading state is distinct from empty and from unreadable', async () => {
    const { SettingsSurfaceLoading } = await import('@/components/platform/vnext/SettingsSurface')
    const out = renderToStaticMarkup(createElement(SettingsSurfaceLoading))
    expect(out).toContain('Läser inställningarna')
    expect(out).not.toContain(UNREADABLE_LABEL)
  })
})

// ── 5. Capability, not authority ─────────────────────────────────────────────

describe('settings · forms are offered only where the routes would accept them', () => {
  it('capability is the canonical operator predicate; ownership is the project list itself', () => {
    expect(model({ operatorOk: false }).capability).toEqual({ allowed: false, reason: 'operator_required' })
    expect(model().capability).toEqual({ allowed: true })
  })

  it('allowed: one write-only form per project per replaceable channel, a verify control per bound account, none for YouTube tokens', async () => {
    const out = await html(model())
    expect(out.match(/data-credential="true"/g) ?? []).toHaveLength(6)
    expect(out.match(/name="token-instagram"/g) ?? []).toHaveLength(3)
    expect(out.match(/name="token-facebook"/g) ?? []).toHaveLength(3)
    expect(out).not.toContain('name="token-youtube"')
    expect(out.match(/>Verifiera nu</g) ?? []).toHaveLength(3)
    expect(out.match(/data-youtube-connect=/g) ?? []).toHaveLength(3)
    expect(out).toMatch(/autoComplete="off"|autocomplete="off"/)
  })

  it('a bound account offers an explicit, audited account change; a first binding asks for the page on Facebook', async () => {
    const out = await html(model())
    expect(out).toContain('Byt konto för The Prompt.')
    expect(out).toContain('Facebook-sidans id')
    const form = codeOnly(read(FILES.form))
    expect(form).toMatch(/if \(needsPageId\) body\.page_id = pageId\.trim\(\)/)
    expect(form).toMatch(/if \(boundAccount && changeAccount\) body\.change_account = true/)
    expect(form).toMatch(/platform === 'facebook' && \(!boundAccount \|\| changeAccount\)/)
  })

  it('not allowed: read-only channels that say why, and no field that could take a token', async () => {
    const out = await html(model({ operatorOk: false }))
    expect(out).not.toContain('<textarea')
    expect(out).not.toContain('data-credential="true"')
    expect(out).not.toContain('Verifiera nu')
    expect(out).not.toContain('data-youtube-connect=')
    expect(out).toContain(CAPABILITY_NOTES.operator_required)
    expect((out.match(/Endast läsning/g) ?? []).length).toBe(9)
  })

  it('the loader decides capability with the canonical predicate — never an allowlist of its own', () => {
    const loader = codeOnly(read(FILES.loader))
    expect(loader).toMatch(/import \{ resolvePlatformOperator \} from '@\/lib\/auth\/platform-operator'/)
    expect(loader).toMatch(/const operator = await resolvePlatformOperator\(\)/)
    expect(loader).not.toMatch(/isPlatformOperatorEmail|platformOperatorAllowlist|PLATFORM_OPERATOR_EMAILS|BREVO_ADMIN_EMAIL/)
    expect(loader).toMatch(/const owned = access\.allowedProjectIds/)
  })

  it('the forms post to the existing routes and nowhere else', () => {
    const form = codeOnly(read(FILES.form))
    const verify = codeOnly(read(FILES.verify))
    expect(CREDENTIAL_ENDPOINT).toBe('/api/media/token')
    expect(VERIFY_ENDPOINT).toBe('/api/media/social-accounts/verify')
    expect(existsSync(resolve(WEB_ROOT, 'app/api/media/token/route.ts'))).toBe(true)
    expect(existsSync(resolve(WEB_ROOT, 'app/api/media/social-accounts/verify/route.ts'))).toBe(true)
    expect(form.match(/fetch\(/g) ?? []).toHaveLength(1)
    expect(form).toMatch(/fetch\(CREDENTIAL_ENDPOINT, \{\s*method: 'POST'/)
    expect(verify.match(/fetch\(/g) ?? []).toHaveLength(1)
    expect(verify).toMatch(/fetch\(VERIFY_ENDPOINT, \{\s*method: 'POST'/)
    expect(verify).toMatch(/body: JSON\.stringify\(\{ project_id: projectId, platform \}\)/)
    expect(verify).not.toMatch(/textarea|token/i)
    const connect = codeOnly(read(FILES.connect))
    expect(YOUTUBE_OAUTH_START_ENDPOINT).toBe('/api/media/youtube/oauth/start')
    expect(existsSync(resolve(WEB_ROOT, 'app/api/media/youtube/oauth/start/route.ts'))).toBe(true)
    expect(connect.match(/fetch\(/g) ?? []).toHaveLength(1)
    expect(connect).toMatch(/fetch\(YOUTUBE_OAUTH_START_ENDPOINT, \{\s*method: 'POST'/)
    expect(connect).toMatch(/const body: Record<string, unknown> = \{ project_id: projectId \}/)
    expect(connect).not.toMatch(/textarea|token|secret|refresh/i)
    // The browser is only ever sent to Google's own origin.
    expect(YOUTUBE_CONSENT_ORIGIN).toBe('https://accounts.google.com')
    expect(connect).toMatch(/new URL\(consent\)\.origin === YOUTUBE_CONSENT_ORIGIN/)
    expect(connect.match(/window\.location\.assign\(/g) ?? []).toHaveLength(1)
    for (const rel of [FILES.form, FILES.verify, FILES.connect]) expect(read(rel), rel).toMatch(/^'use client'/)
  })

  it('the form is write-only: the field is emptied before the request leaves, and never pre-filled', () => {
    const form = codeOnly(read(FILES.form))
    const submit = form.slice(form.indexOf('const submit'), form.indexOf('const idBase'))
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

  it('nothing but the three client controls writes: the loader, surface, shared contract and page are read-only', () => {
    for (const rel of [FILES.loader, FILES.surface, FILES.shared, FILES.page]) {
      expect(codeOnly(read(rel)), rel).not.toMatch(/'use server'|fetch\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|rpc\(/)
    }
    expect(read(FILES.surface)).not.toMatch(/^'use client'/)
  })

  it('writes no memory and triggers no Dream', () => {
    for (const rel of [FILES.loader, FILES.surface, FILES.form, FILES.verify, FILES.connect, FILES.page]) {
      expect(codeOnly(read(rel)), rel).not.toMatch(/recordMemoryEvent|atlas\/memory|runDreamCycleForProject|lib\/ai\/dream|recordAction/)
    }
  })
})

describe("settings · the routes' answers are shown as what they were", () => {
  const OP = '5b0c1f7e-9d2a-4c61-8f3e-2a7d9b4c6e10'

  it('a completed replacement is replaced, with the attested account, the audit operation and Facebook\'s three answers', () => {
    const answer = replacementOutcome(200, {
      ok: true, replaced: true, operation_id: OP, exchanged: true, pageResolved: true, readInsightsOk: false,
      account: { id: FB_PAGE, label: 'The Prompt Page', binding_action: 'matched' },
    })
    expect(answer).toEqual({
      kind: 'replaced',
      message: 'Credentialn är sparad för projektets bekräftade konto och ersättningen är revisionsloggad.',
      operationId: OP,
      facebook: { exchanged: true, pageResolved: true, readInsightsOk: false },
      account: { id: FB_PAGE, label: 'The Prompt Page', bindingAction: 'matched' },
    })
  })

  it('an audit integrity incident is an incident — never a success, never "nothing happened"', () => {
    const answer = replacementOutcome(500, { ok: false, replaced: true, audit_incident: 'terminal_event_not_recorded', operation_id: OP, error: 'Tokenet ersattes, men revisionsloggen kunde inte slutföras.' })
    expect(answer.kind).toBe('incident')
    expect(answer.operationId).toBe(OP)
    expect(answer.facebook).toBeNull()
    expect(answer.account).toBeNull()
  })

  it("refusals are refusals, in the route's terms — including an account that is not the project's", () => {
    expect(replacementOutcome(401, { error: 'Unauthorized' }).kind).toBe('refused')
    expect(replacementOutcome(403, { error: 'Forbidden', denied: 'platform_operator_required' }).message).toMatch(/plattformsoperatörens behörighet/)
    expect(replacementOutcome(403, { error: 'Forbidden' }).message).toMatch(/äger inte projektet/)
    expect(replacementOutcome(400, { error: 'Tokenet ser för kort ut — klistra in hela värdet' })).toMatchObject({ kind: 'refused', message: 'Tokenet ser för kort ut — klistra in hela värdet' })
    expect(replacementOutcome(409, { refusal: 'account_mismatch', error: 'Credentialn tillhör ett annat Instagram-konto än projektets kopplade.' }))
      .toMatchObject({ kind: 'refused', message: 'Credentialn tillhör ett annat Instagram-konto än projektets kopplade.' })
  })

  it('an attempt that could not be audited or verified did not happen, and says so', () => {
    const answer = replacementOutcome(503, { ok: false, replaced: false, operation_id: OP, error: 'Ersättningen kunde inte revisionsloggas och har inte genomförts.' })
    expect(answer).toMatchObject({ kind: 'failed', operationId: OP })
    expect(answer.message).toMatch(/har inte genomförts/)
  })

  it('an unreadable answer is a failure, and a lost request may still have gone through', () => {
    expect(replacementOutcome(502, null)).toMatchObject({ kind: 'failed', message: 'Tokenet kunde inte ersättas.' })
    expect(SEND_FAILED_MESSAGE).toMatch(/kan ha genomförts/)
  })

  it('verification is confirmed only when the platform confirmed the account', () => {
    expect(verificationOutcome(200, { ok: true, identity_verified: true, status: 'ok', account: { id: FB_PAGE, label: 'The Prompt Page' } }))
      .toEqual({ kind: 'confirmed', message: 'Bekräftat av plattformen: The Prompt Page.' })
    expect(verificationOutcome(200, { ok: true, identity_verified: false, status: 'ok', account: { id: YT_CHANNEL, label: null } }).kind).toBe('unconfirmed')
    expect(verificationOutcome(200, { ok: false, identity_verified: false, status: 'account_mismatch' }))
      .toEqual({ kind: 'refused', message: 'Tillhör inte projektets konto.' })
    expect(verificationOutcome(403, { error: 'Forbidden' }).kind).toBe('refused')
    expect(verificationOutcome(503, { error: 'Projektets kontobindning kunde inte läsas.' })).toEqual({ kind: 'failed', message: 'Projektets kontobindning kunde inte läsas.' })
  })

  it('the YouTube connection’s answer is one of the callback’s closed codes, shown as what it was — anything else is ignored', async () => {
    expect(youtubeConnectOutcome('migrated')).toEqual({ code: 'migrated', ...YOUTUBE_CONNECT_OUTCOMES.migrated })
    expect(youtubeConnectOutcome(['connected', 'x'])).toMatchObject({ code: 'connected', kind: 'connected' })
    for (const odd of [undefined, null, '', 'toString', '__proto__', '<script>', 'Connected', 42]) {
      expect(youtubeConnectOutcome(odd), String(odd)).toBeNull()
    }
    expect(YOUTUBE_CONNECT_OUTCOMES.connected_audit_incident.kind).toBe('incident')
    expect(YOUTUBE_CONNECT_OUTCOMES.audit_incomplete.kind).toBe('incident')
    for (const code of ['state_invalid', 'channel_bound_to_other_project', 'scope_missing', 'channel_mismatch'] as const) {
      expect(YOUTUBE_CONNECT_OUTCOMES[code].kind, code).toBe('refused')
    }
    for (const { message } of Object.values(YOUTUBE_CONNECT_OUTCOMES)) expect(message).not.toMatch(/token|secret|refresh|http/i)
    expect(await html(model())).not.toContain('data-youtube-outcome')
    const { SettingsSurface } = await import('@/components/platform/vnext/SettingsSurface')
    const shown = renderToStaticMarkup(createElement(SettingsSurface, {
      model: model(), displayPreferences: createElement('div'), youtubeOutcome: youtubeConnectOutcome('channel_bound_to_other_project'),
    }))
    expect(shown).toContain('data-youtube-outcome="channel_bound_to_other_project"')
    expect(shown).toContain(YOUTUBE_CONNECT_OUTCOMES.channel_bound_to_other_project.message)
  })

  it('the start route’s refusals are refusals, and an unreadable answer is a failure', () => {
    expect(youtubeStartOutcome(401, { error: 'Unauthorized' }).kind).toBe('refused')
    expect(youtubeStartOutcome(403, { error: 'Forbidden', denied: 'platform_operator_required' }).message).toMatch(/plattformsoperatörens behörighet/)
    expect(youtubeStartOutcome(403, { error: 'Forbidden' }).message).toMatch(/äger inte projektet/)
    expect(youtubeStartOutcome(400, { error: 'Projektet har ingen kopplad YouTube-kanal att byta.' }))
      .toEqual({ kind: 'refused', message: 'Projektet har ingen kopplad YouTube-kanal att byta.' })
    expect(youtubeStartOutcome(503, { refusal: 'oauth_client_not_configured', error: 'YouTube-anslutning är inte konfigurerad för plattformen.' }).kind).toBe('failed')
    expect(youtubeStartOutcome(500, null)).toEqual({ kind: 'failed', message: 'Anslutningen kunde inte påbörjas.' })
  })
})

// ── Generation ───────────────────────────────────────────────────────────────

describe('settings · generation', () => {
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
    const element = await Page({}) as React.ReactElement
    expect(element.type).toBe(React.Suspense)
    const inner = (element.props as { children: React.ReactElement }).children
    expect((inner.type as { name?: string }).name).toBe('LoadedSettings')
  })

  it('`?ui=legacy` renders the legacy body', async () => {
    cookieValue = 'legacy'
    const { default: Page } = await import('@/app/(platform)/settings/page')
    expect(renderToStaticMarkup(await Page({}) as React.ReactElement)).toContain('legacy-body')
  })

  it('the legacy branch never runs the vNext loader', async () => {
    cookieValue = 'legacy'
    const { default: Page } = await import('@/app/(platform)/settings/page')
    renderToStaticMarkup(await Page({}) as React.ReactElement)
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('an unresolvable session or scope is a redirect, never a page', async () => {
    loadSpy.mockResolvedValueOnce(null as unknown as SettingsModel)
    const { default: Page } = await import('@/app/(platform)/settings/page')
    const element = await Page({}) as React.ReactElement
    const inner = (element.props as { children: React.ReactElement }).children
    await expect((inner.type as (p: unknown) => Promise<unknown>)(inner.props)).rejects.toThrow(/NEXT_REDIRECT/)
  })

  it('hands the YouTube connection’s closed answer to the surface — and ignores anything that is not one', async () => {
    const { default: Page } = await import('@/app/(platform)/settings/page')
    const known = await Page({ searchParams: { youtube: 'migrated' } }) as React.ReactElement
    expect(((known.props as { children: React.ReactElement }).children.props as { youtubeOutcome: unknown }).youtubeOutcome)
      .toMatchObject({ code: 'migrated', kind: 'connected' })
    const odd = await Page({ searchParams: { youtube: 'access_token=abc' } }) as React.ReactElement
    expect(((odd.props as { children: React.ReactElement }).children.props as { youtubeOutcome: unknown }).youtubeOutcome).toBeNull()
  })

  it('hands the existing display preferences in as the Visning slot', () => {
    const page = read(FILES.page)
    expect(page).toMatch(/import \{ DisplayPreferences \} from '\.\/DisplayPreferences'/)
    expect(page).toMatch(/displayPreferences=\{<DisplayPreferences \/>\}/)
    expect(codeOnly(read(FILES.surface))).not.toMatch(/useDisplayPreferences|display-scale|omnira:motion/)
  })
})

// ── The loader, executed ─────────────────────────────────────────────────────

describe('settings · the loader reads inside the session boundary', () => {
  interface Recorded { table: string; select: string; filters: [string, unknown][] }
  let queries: Recorded[]
  let access: unknown
  let operatorOk: boolean
  let operatorCalls: number
  let failing: Set<string>

  function fakeQuery(table: string) {
    const rec: Recorded = { table, select: '', filters: [] }
    queries.push(rec)
    const api: Record<string, unknown> = {
      select(select: string) { rec.select = select; return api },
      eq(c: string, v: unknown) { rec.filters.push([`eq:${c}`, v]); return api },
      in(c: string, v: unknown) { rec.filters.push([`in:${c}`, v]); return api },
      is(c: string, v: unknown) { rec.filters.push([`is:${c}`, v]); return api },
      order() { return api },
      limit() { return api },
      then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
        return Promise.resolve(failing.has(table) ? { data: null, error: { code: 'XX000' } } : { data: [], error: null }).then(ok, err)
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
    failing = new Set()
    access = { ok: true, userId: USER_ID, allowedProjectIds: [PROMPT_ID, FAMILY_ID] }
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

  it('every read is filtered to the owned projects, and every select is metadata', async () => {
    const { loadSettings } = await import('@/lib/os/settings')
    const m = await loadSettings()
    expect(m?.capability).toEqual({ allowed: true })
    expect(operatorCalls).toBe(1)
    const owned = [PROMPT_ID, FAMILY_ID]
    expect(queries.map((q) => q.table).sort()).toEqual(
      ['platform_credential_events', 'platform_tokens', 'projects', 'social_account_bindings', 'social_credential_health'])
    for (const q of queries) {
      const scoped = q.filters.some(([f, v]) => (f === 'in:project_id' || f === 'in:id') && JSON.stringify(v) === JSON.stringify(owned))
      expect(scoped, `${q.table} is not filtered to the owned projects`).toBe(true)
      expect(q.select, q.table).not.toMatch(/access_token|last_error|\*/)
    }
    expect(queries.find((q) => q.table === 'social_account_bindings')?.filters).toContainEqual(['is:superseded_at', null])
    expect(queries.find((q) => q.table === 'platform_credential_events')?.filters).toContainEqual(['eq:outcome', 'replaced'])
    expect(queries.map((q) => q.table)).not.toContain('token_health')
  })

  it('a session that owns no project makes no read at all', async () => {
    access = { ok: true, userId: USER_ID, allowedProjectIds: [] }
    const { loadSettings } = await import('@/lib/os/settings')
    const m = await loadSettings()
    expect(queries).toEqual([])
    expect(m?.projects).toEqual({ state: 'ok', items: [] })
  })

  it('failing the operator predicate removes the forms and nothing else', async () => {
    operatorOk = false
    const { loadSettings } = await import('@/lib/os/settings')
    const m = await loadSettings()
    expect(m?.capability).toEqual({ allowed: false, reason: 'operator_required' })
    expect(queries.map((q) => q.table)).toContain('platform_tokens')
  })

  it('a failed read is unreadable, never empty', async () => {
    failing = new Set(['platform_tokens', 'social_account_bindings'])
    const { loadSettings } = await import('@/lib/os/settings')
    const m = await loadSettings()
    expect(m?.warnings.map((w) => w.id)).toEqual(expect.arrayContaining(['unreadable:credentials', 'unreadable:bindings']))
  })
})

// ── Rollback ─────────────────────────────────────────────────────────────────

describe('settings · the legacy rollback is the page that shipped', () => {
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

describe('settings · layout, scale and motion', () => {
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

  it('gives every project its own block', () => {
    expect(css).toMatch(/\.project \{[\s\S]*?border: 1px solid/)
    expect(read(FILES.surface)).toMatch(/className=\{styles\.project\}/)
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
