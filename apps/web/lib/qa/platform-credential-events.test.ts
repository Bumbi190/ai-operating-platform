/**
 * Settings S0 — platform_credential_events: the table and its only writer.
 *
 * The owner's decision (2026-09-14): replacing a platform publishing credential is
 * audited in a dedicated append-only table that is credential-blind — no token,
 * token hash or fingerprint, header, provider body or error text, app secret,
 * refresh token or credentialled URL, ever.
 *
 * Three layers keep that true, and this file pins two of them:
 *   1. the writer (lib/media/credential-events.ts) assembles each row from named
 *      fields and allowlisted detail keys only, and never throws;
 *   2. the migration gives the table no column that could hold a secret, CHECK-
 *      limits `detail`, refuses UPDATE/DELETE/TRUNCATE, stamps its own clock,
 *      ties each terminal event to its attempt, and grants clients nothing.
 * The third — that Postgres actually enforces (2) — runs against a real database
 * in platform-credential-events-sql.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let INSERTS: { table: string; row: unknown }[] = []
let INSERT_ERROR: { code?: string; message?: string } | null = null
let CLIENT_THROWS: Error | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (CLIENT_THROWS) throw CLIENT_THROWS
    return {
      from: (table: string) => ({
        insert: async (row: unknown) => {
          INSERTS.push({ table, row })
          return { data: null, error: INSERT_ERROR }
        },
      }),
    }
  },
}))

import {
  CREDENTIAL_EVENT_DETAIL_KEYS,
  credentialEventRow,
  recordCredentialEvent,
  type CredentialEventInput,
} from '@/lib/media/credential-events'

const OP = '5b0c1f7e-9d2a-4c61-8f3e-2a7d9b4c6e10'
const PROJECT = '33333333-3333-3333-3333-333333333333'
const ACTOR = 'user:0f8a2c4e-6b1d-4e3f-9a5c-7d2e8b1f4a6c'
const TOKEN = `EAAB${'q'.repeat(90)}`

const MIGRATION_FILE = resolve(__dirname, '../../supabase/migrations/20260914090100_platform_credential_events.sql')
const RAW_SQL = readFileSync(MIGRATION_FILE, 'utf8')
const EXEC = RAW_SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n').toLowerCase()
const REGISTRY = JSON.parse(readFileSync(resolve(__dirname, '../../tests/isolation/schema-security.json'), 'utf8')) as {
  tables: Record<string, Record<string, unknown>>
}

const base = (over: Partial<CredentialEventInput> = {}): CredentialEventInput => ({
  operationId: OP, projectId: PROJECT, platform: 'facebook', actor: ACTOR, outcome: 'replaced', ...over,
})

beforeEach(() => {
  INSERTS = []
  INSERT_ERROR = null
  CLIENT_THROWS = null
})

// ─── 1. The writer ──────────────────────────────────────────────────────────

describe('Settings S0 · credential-events writer — rows from named fields only', () => {
  it('nothing the caller adds rides along: not a token, a header, a provider body, a message or a clock', () => {
    const hostile = {
      ...base({ detail: { exchanged: true, page_resolved: false, read_insights_ok: true } }),
      token: TOKEN,
      access_token: TOKEN,
      refresh_token: TOKEN,
      headers: { authorization: `Bearer ${TOKEN}` },
      providerResponse: { error: { message: `Invalid OAuth access_token=${TOKEN}` } },
      url: `https://graph.facebook.com/me?access_token=${TOKEN}`,
      occurred_at: '1999-01-01T00:00:00Z',
      event_id: 'forged',
      event_version: 1,
      externalAccountId: TOKEN,
      bindingAction: 'matched',
    } as unknown as CredentialEventInput
    ;(hostile.detail as Record<string, unknown>).token = TOKEN
    ;(hostile.detail as Record<string, unknown>).message = `access_token=${TOKEN}`
    ;(hostile.detail as Record<string, unknown>).token_hash = 'sha256:abc'
    const row = credentialEventRow(hostile)
    expect(Object.keys(row).sort()).toEqual([
      'actor', 'binding_action', 'credential_type', 'detail', 'event_version', 'external_account_id',
      'operation_id', 'outcome', 'platform', 'project_id',
    ])
    expect(row.detail).toEqual({ exchanged: true, page_resolved: false, read_insights_ok: true })
    // A token cannot pass as an account id, and the contract version is the writer's, never the caller's.
    expect(row.external_account_id).toBeNull()
    expect(row.event_version).toBe(2)
    expect(row.binding_action).toBe('matched')
    const text = JSON.stringify(row)
    for (const needle of [TOKEN, 'Bearer', 'OAuth', 'graph.facebook.com', '1999-01-01', 'forged', 'sha256']) {
      expect(text).not.toContain(needle)
    }
  })

  it('the credential type follows the platform exactly as platform_tokens stores it', () => {
    expect(credentialEventRow(base({ platform: 'instagram' })).credential_type).toBe('user')
    expect(credentialEventRow(base({ platform: 'facebook' })).credential_type).toBe('page')
  })

  it('attempted says nothing yet, failed says only where, replaced never claims a failure', () => {
    const detail = { exchanged: true, failure_stage: 'store' as const, expires_at: '2026-11-13T05:17:55.129Z' }
    expect(credentialEventRow(base({ outcome: 'attempted', detail })).detail).toEqual({})
    expect(credentialEventRow(base({ outcome: 'failed', detail })).detail).toEqual({ failure_stage: 'store' })
    expect(credentialEventRow(base({ outcome: 'failed' })).detail).toEqual({ failure_stage: 'unexpected' })
    expect(credentialEventRow(base({ outcome: 'replaced', detail })).detail).toEqual({ exchanged: true })
  })

  it('per platform: Facebook keeps its three booleans, Instagram only an expiry', () => {
    const detail = { exchanged: false, page_resolved: true, read_insights_ok: false, expires_at: '2026-11-13T05:17:55.129Z' }
    expect(credentialEventRow(base({ platform: 'facebook', detail })).detail)
      .toEqual({ exchanged: false, page_resolved: true, read_insights_ok: false })
    expect(credentialEventRow(base({ platform: 'instagram', detail })).detail)
      .toEqual({ expires_at: '2026-11-13T05:17:55.129Z' })
  })

  it('a value of the wrong type is dropped — a token cannot pass as an expiry or a flag', () => {
    const row = credentialEventRow(base({
      platform: 'instagram',
      detail: { expires_at: TOKEN } as never,
    }))
    expect(row.detail).toEqual({})
    const fb = credentialEventRow(base({
      detail: { exchanged: TOKEN, page_resolved: 'true', read_insights_ok: 1 } as never,
    }))
    expect(fb.detail).toEqual({})
  })

  it('project- and account-aware: the account and binding action are kept exactly where the table allows them', () => {
    const PAGE = '1138612202672850'
    const attempted = credentialEventRow(base({ outcome: 'attempted', externalAccountId: PAGE, bindingAction: 'matched' }))
    expect(attempted).toMatchObject({ external_account_id: null, binding_action: null, event_version: 2 })

    const replaced = credentialEventRow(base({ outcome: 'replaced', externalAccountId: PAGE, bindingAction: 'rebound' }))
    expect(replaced).toMatchObject({ external_account_id: PAGE, binding_action: 'rebound', project_id: PROJECT })

    const failed = credentialEventRow(base({ outcome: 'failed', externalAccountId: PAGE, bindingAction: 'created',
      detail: { failure_stage: 'account_mismatch' } }))
    expect(failed).toMatchObject({ external_account_id: PAGE, binding_action: null, detail: { failure_stage: 'account_mismatch' } })

    // An action outside the vocabulary, and an id that is not an identifier, are dropped.
    const odd = credentialEventRow(base({ outcome: 'replaced', externalAccountId: 'page 1; drop', bindingAction: 'forced' as never }))
    expect(odd).toMatchObject({ external_account_id: null, binding_action: null })
  })

  it('the account failure stages are recorded as themselves; anything else is unexpected', () => {
    for (const stage of ['store', 'provider_verification', 'account_mismatch', 'account_bound_to_other_project', 'binding'] as const) {
      expect(credentialEventRow(base({ outcome: 'failed', detail: { failure_stage: stage } })).detail).toEqual({ failure_stage: stage })
    }
    expect(credentialEventRow(base({ outcome: 'failed', detail: { failure_stage: 'whatever' as never } })).detail)
      .toEqual({ failure_stage: 'unexpected' })
  })

  it('YouTube connections: oauth_refresh, no Meta flags or expiry, and the OAuth stages and `migrated` for YouTube only', () => {
    const youtube = (over: Partial<CredentialEventInput>) => credentialEventRow(base({ platform: 'youtube', ...over }))
    expect(youtube({ outcome: 'attempted' })).toMatchObject({ platform: 'youtube', credential_type: 'oauth_refresh', detail: {} })
    expect(youtube({
      outcome: 'replaced', externalAccountId: 'UCUM9JDi75ziLssYcGLo8IPA', bindingAction: 'migrated',
      detail: { exchanged: true, page_resolved: true, read_insights_ok: true, expires_at: '2026-11-13T06:00:06.627Z' },
    })).toMatchObject({ detail: {}, external_account_id: 'UCUM9JDi75ziLssYcGLo8IPA', binding_action: 'migrated' })
    for (const stage of ['authorization_denied', 'code_exchange', 'scope_missing', 'refresh_token_missing', 'account_ambiguous'] as const) {
      expect(youtube({ outcome: 'failed', detail: { failure_stage: stage } }).detail, stage).toEqual({ failure_stage: stage })
      expect(credentialEventRow(base({ platform: 'facebook', outcome: 'failed', detail: { failure_stage: stage } })).detail, stage)
        .toEqual({ failure_stage: 'unexpected' })
    }
    expect(credentialEventRow(base({ platform: 'instagram', outcome: 'replaced', externalAccountId: '17841437027967629', bindingAction: 'migrated' })))
      .toMatchObject({ binding_action: null })
  })

  it('the writer mirrors the table: the same five detail keys the migration allowlists', () => {
    const m = EXEC.match(/detail\s*-\s*array\[([^\]]+)\]\)\s*=\s*'\{\}'::jsonb/)
    expect(m, 'the allowlist constraint is missing').not.toBeNull()
    const keys = [...m![1].matchAll(/'([a-z_]+)'/g)].map((k) => k[1])
    expect(keys).toEqual([...CREDENTIAL_EVENT_DETAIL_KEYS])
  })
})

describe('Settings S0 · credential-events writer — one insert, never a throw, never a message', () => {
  it('inserts exactly one row into platform_credential_events', async () => {
    const res = await recordCredentialEvent(base({ outcome: 'attempted' }))
    expect(res).toEqual({ ok: true })
    expect(INSERTS).toEqual([{
      table: 'platform_credential_events',
      row: {
        operation_id: OP, project_id: PROJECT, platform: 'facebook', credential_type: 'page',
        actor: ACTOR, outcome: 'attempted', detail: {},
        event_version: 2, external_account_id: null, binding_action: null,
      },
    }])
  })

  it('a refused insert returns its code and never its message, which can quote the row', async () => {
    INSERT_ERROR = { code: '23514', message: `new row violates check constraint; Failing row contains (${TOKEN})` }
    const res = await recordCredentialEvent(base())
    expect(res).toEqual({ ok: false, code: '23514' })
    expect(JSON.stringify(res)).not.toContain(TOKEN)
  })

  it('an error without a code still fails closed', async () => {
    INSERT_ERROR = { message: 'fetch failed' }
    expect(await recordCredentialEvent(base())).toEqual({ ok: false, code: 'insert_failed' })
  })

  it('a thrown client error is caught — the writer never throws', async () => {
    CLIENT_THROWS = new Error(`SUPABASE_SERVICE_ROLE_KEY missing near ${TOKEN}`)
    const res = await recordCredentialEvent(base())
    expect(res).toEqual({ ok: false, code: 'exception' })
    expect(JSON.stringify(res)).not.toContain(TOKEN)
  })
})

// ─── 2. The migration ───────────────────────────────────────────────────────

describe('Settings S0 · platform_credential_events migration — credential-blind columns', () => {
  const tableBody = (() => {
    const start = EXEC.indexOf('create table if not exists public.platform_credential_events (')
    const end = EXEC.indexOf('\n);', start)
    return EXEC.slice(start, end)
  })()
  const columns = [...tableBody.matchAll(/^\s+([a-z_]+)\s+(uuid|timestamptz|text|jsonb)\b/gm)].map((m) => m[1])

  it('has exactly the bounded metadata columns, and no other', () => {
    expect(columns).toEqual([
      'event_id', 'operation_id', 'occurred_at', 'project_id', 'platform', 'credential_type', 'actor', 'outcome', 'detail',
    ])
  })

  it('no column name could hold a credential or a provider payload', () => {
    for (const c of columns) {
      expect(c).not.toMatch(/token|secret|hash|fingerprint|header|authori[sz]ation|body|response|message|error|url|refresh|key|password/)
    }
  })

  it('outcome, platform, credential type and actor are closed vocabularies', () => {
    expect(EXEC).toMatch(/check \(platform in \('instagram', 'facebook'\)\)/)
    expect(EXEC).toMatch(/check \(outcome in \('attempted', 'replaced', 'failed'\)\)/)
    expect(EXEC).toMatch(/platform = 'instagram' and credential_type = 'user'/)
    expect(EXEC).toMatch(/platform = 'facebook'\s+and credential_type = 'page'/)
    expect(EXEC).toContain("actor ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'")
  })

  it('detail is typed per key, shaped by platform and by outcome, and an expiry must be an ISO-8601 UTC timestamp', () => {
    expect(EXEC).toContain("jsonb_typeof(detail) = 'object'")
    for (const flag of ['exchanged', 'page_resolved', 'read_insights_ok']) {
      expect(EXEC).toContain(`((detail -> '${flag}')`)
      expect(EXEC).toContain(`jsonb_typeof(detail -> '${flag}') = 'boolean'`)
    }
    expect(EXEC).toMatch(/\(detail ->> 'expires_at'\) ~ '\^\[0-9\]\{4\}-/)
    expect(EXEC).toMatch(/\(detail ->> 'failure_stage'\) in \('store', 'unexpected'\)/)
    expect(EXEC).toMatch(/outcome = 'attempted' and detail = '\{\}'::jsonb/)
    expect(EXEC).toMatch(/outcome = 'failed'\s+and \(detail -> 'failure_stage'\) is not null/)
    expect(EXEC).toMatch(/outcome = 'replaced'\s+and \(detail -> 'failure_stage'\) is null/)
  })

  it('the project reference restricts deletion — an audit row is never cascaded away', () => {
    expect(EXEC).toMatch(/project_id\s+uuid not null references public\.projects\(id\) on delete restrict/)
    expect(EXEC).not.toMatch(/on delete cascade|on delete set null/)
  })
})

describe('Settings S0 · platform_credential_events migration — append-only and server-only', () => {
  it('UPDATE and DELETE are refused per row, TRUNCATE per statement', () => {
    expect(EXEC).toMatch(/create trigger platform_credential_events_no_mutation\s+before update or delete on public\.platform_credential_events\s+for each row execute function public\.platform_credential_events_append_only\(\)/)
    expect(EXEC).toMatch(/create trigger platform_credential_events_no_truncate\s+before truncate on public\.platform_credential_events\s+for each statement execute function public\.platform_credential_events_append_only\(\)/)
    expect(EXEC).toMatch(/raise exception 'platform_credential_events is append-only/)
  })

  it('the clock is the database\'s, and a terminal event needs its matching attempted event', () => {
    expect(EXEC).toMatch(/create trigger platform_credential_events_guard_insert\s+before insert on public\.platform_credential_events\s+for each row/)
    const guard = EXEC.slice(EXEC.indexOf('function public.platform_credential_events_guard_insert()'), EXEC.indexOf('$$;', EXEC.indexOf('function public.platform_credential_events_guard_insert()')))
    expect(guard).toContain('new.occurred_at := now();')
    expect(guard).toMatch(/new\.outcome <> 'attempted' and not exists/)
    for (const col of ['operation_id', 'project_id', 'platform', 'credential_type', 'actor']) {
      expect(guard).toMatch(new RegExp(`a\\.${col}\\s+= new\\.${col}`))
    }
    expect(guard).toMatch(/a\.outcome\s+= 'attempted'/)
    expect(guard).toContain("set search_path to ''")
  })

  it('one attempted event and at most one terminal event per operation', () => {
    expect(EXEC).toMatch(/create unique index if not exists platform_credential_events_one_attempt\s+on public\.platform_credential_events \(operation_id\) where outcome = 'attempted'/)
    expect(EXEC).toMatch(/create unique index if not exists platform_credential_events_one_terminal\s+on public\.platform_credential_events \(operation_id\) where outcome in \('replaced', 'failed'\)/)
  })

  it('RLS on, no policy, every client grant revoked, and the service role holds SELECT and INSERT only', () => {
    expect(EXEC).toMatch(/alter table public\.platform_credential_events enable row level security/)
    expect(EXEC).toMatch(/revoke all on table public\.platform_credential_events from public, anon, authenticated, service_role;/)
    const grants = [...EXEC.matchAll(/\bgrant\s[^;]*;/g)].map((m) => m[0].replace(/\s+/g, ' '))
    expect(grants).toEqual(['grant select, insert on table public.platform_credential_events to service_role;'])
    expect(EXEC).not.toMatch(/create\s+policy|disable\s+row\s+level\s+security|security\s+definer/)
    expect(EXEC).not.toMatch(/\bto\s+(anon|authenticated|public)\b/)
  })

  it('touches no other object and carries no data statement', () => {
    const touched = new Set([...EXEC.matchAll(/public\.([a-z_0-9]+)/g)].map((m) => m[1]))
    expect([...touched].sort()).toEqual([
      'platform_credential_events', 'platform_credential_events_append_only', 'platform_credential_events_guard_insert', 'projects',
    ])
    for (const forbidden of ['insert into', 'update public', 'delete from', 'truncate public', 'truncate table', 'drop table', 'drop column', 'alter column', 'platform_tokens']) {
      expect(EXEC.includes(forbidden), forbidden).toBe(false)
    }
  })

  it('the registry classifies the table SERVER_ONLY with no client grant', () => {
    expect(REGISTRY.tables.platform_credential_events).toMatchObject({
      class: 'SERVER_ONLY', rls: true, policies: 0, anon_grants: false, authenticated_grants: false, service_role: true,
    })
  })
})

describe('Settings S0 · platform_credential_events — the search_path follow-up', () => {
  it('pins the append-only function\'s search_path, and does nothing else', () => {
    // The Supabase advisor (lint 0011) flagged the append-only trigger function once
    // the table was live. The insert guard pins search_path in its own definition;
    // this follow-up pins the other function without touching its body or triggers.
    const followUp = readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260914090200_platform_credential_events_search_path.sql'), 'utf8',
    )
    const statements = followUp.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
      .split(';').map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean)
    expect(statements).toEqual(["alter function public.platform_credential_events_append_only() set search_path to ''"])
  })
})
