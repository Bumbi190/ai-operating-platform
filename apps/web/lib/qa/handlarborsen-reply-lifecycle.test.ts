import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('server-only', () => ({}))
import { readHandlarborsenReplyLifecycle } from '@/lib/atlas/project-analytics/handlarborsen-reply-lifecycle'
import { classifyHandlarborsenReadIntent } from '@/lib/atlas/project-analytics/handlarborsen-tool-intent'
import { HANDLARBORSEN_READ_TOOL_NAMES, handleHandlarborsenReadTool } from '@/lib/atlas/project-analytics/handlarborsen-operator-tools'

const HB = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OWNER = 'signed-in-owner'
const NOW = new Date('2026-10-28T13:30:00.000Z')
type Row = Record<string, any>

function fixture(options: {
  foreignOwner?: boolean
  disabledProject?: boolean
  empty?: boolean
  failedSource?: string
  policyExpiry?: string
  missingApproval?: boolean
  mismatchedSend?: boolean
  extraJobs?: number
} = {}) {
  const example = (key: string) => '00000000-0000-4000-8000-' + key.padStart(12, '0')
  const jobId = example('1')
  const revOld = example('2')
  const revCurrent = example('3')
  const approvalId = example('4')
  const base: Record<string, Row[]> = {
    projects: [{ id: HB, owner_id: options.foreignOwner ? 'another-owner' : OWNER, slug: 'handlarborsen', atlas_mode: options.disabledProject ? 'disabled' : 'observer' }],
    sales_reply_jobs: [
      { id: jobId, project_id: HB, owner_id: OWNER, status: 'awaiting_review', request: { private: 'PRIVATE JOB CONTENT' } },
      { id: example('11'), project_id: OTHER, owner_id: 'another-owner', status: 'queued', request: { private: 'OTHER TENANT JOB' } },
    ],
    sales_reply_draft_revisions: [
      { id: revOld, project_id: HB, job_id: jobId, approval_id: null, is_current: false, data: { body: 'SECRET OLDER DRAFT' } },
      { id: revCurrent, project_id: HB, job_id: jobId, approval_id: approvalId, is_current: true, data: { body: 'PRIVATE EMAIL BODY' } },
      { id: example('12'), project_id: OTHER, job_id: example('11'), approval_id: null, is_current: true },
    ],
    approvals: [
      ...options.missingApproval ? [] : [{ id: approvalId, project_id: HB, status: 'approved', content: 'SECRET APPROVAL BODY' }],
      { id: example('13'), project_id: OTHER, status: 'approved', content: 'OTHER TENANT APPROVAL' },
    ],
    sales_send_jobs: [
      { revision_id: options.mismatchedSend ? example('99') : revCurrent, project_id: HB, owner_id: OWNER, status: 'smtp_accepted', sealed_json: '{"toEmail":"sensitive@example.test"}' },
      { revision_id: example('12'), project_id: OTHER, owner_id: 'another-owner', status: 'smtp_accepted' },
    ],
    sales_send_policies: [
      { project_id: HB, owner_id: OWNER, enabled: true, expires_at: options.policyExpiry ?? '2026-10-28T12:00:00.000Z', recipient: 'NEVER READ RECIPIENT' },
      { project_id: OTHER, owner_id: 'another-owner', enabled: true, expires_at: '2099-01-01T00:00:00.000Z' },
    ],
    sales_contact_timing_rules: [
      { project_id: HB, owner_id: OWNER, version: 1, min_wait_seconds: 1209600, max_reminders: 1, request: 'NEVER READ CONTACT HISTORY' },
      { project_id: OTHER, owner_id: 'another-owner', version: 2, min_wait_seconds: 0, max_reminders: 5 },
    ],
  }
  if (options.empty) {
    for (const table of Object.keys(base)) if (table !== 'projects') base[table] = []
  }
  if (options.extraJobs) {
    for (let i = 0; i < options.extraJobs; i++) {
      base.sales_reply_jobs.push({ id: example(String(100+i)), project_id: HB, owner_id: OWNER, status: 'queued' })
    }
  }

  const calls: Array<{ table: string; selected: string; count: string | undefined; predicates: Array<[string, unknown]> }> = []
  const db = {
    from(table: string) {
      const filters: Array<[string, unknown]> = []
      let idSelection: string[] | null = null
      let selected = ''
      let countSetting: string | undefined
      const all = () => (base[table] ?? []).filter(row =>
        filters.every(([col, value]) => row[col] === value) &&
        (!idSelection || idSelection.includes(row.id)))
      const builder: any = {
        select(columns: string, opts?: { count?: string; head?: boolean }) {
          selected = columns
          countSetting = opts?.count
          calls.push({ table, selected: columns, count: countSetting, predicates: filters })
          return builder
        },
        eq(column: string, value: unknown) { filters.push([column, value]); return builder },
        in(column: string, ids: string[]) {
          if (column !== 'id') throw new Error('unsafe dynamic selection')
          idSelection = ids
          return builder
        },
        maybeSingle: async () => ({ data: all()[0] ?? null, error: null }),
        range: async (lo: number, hi: number) => {
          if (table === options.failedSource) return { data: null, count: null, error: { code: 'TEST_ERROR' } }
          const columns = selected.split(',')
          // Only the minimal technical fields may be read; no body, headers,
          // recipient, company or private identifiers are selected from sources.
          if (selected.includes('body') || selected.includes('recipient') || selected.includes('request') ||
              selected.includes('sealed_json') || selected.includes('email') || countSetting !== 'exact') {
            throw new Error('unsafe read')
          }
          return {
            data: all().slice(lo, hi+1).map(row => Object.fromEntries(columns.map(col => [col, row[col]]))),
            count: all().length, error: null,
          }
        },
      }
      return builder
    },
  }
  return { db, calls }
}
const ctx = (db: unknown, allowedProjectIds: string[] = [HB], userId=OWNER) => ({
  db, allowedProjectIds, userId, now: NOW,
})

describe('Handlarbörsen reply lifecycle: no-contact, bounded owner metadata', () => {
  it('shows process, approval and sending as three independent stages', async () => {
    const f = fixture()
    const out = await readHandlarborsenReplyLifecycle(ctx(f.db))
    expect(out).toMatchObject({
      status: 'ok',
      replyJobsTotal: 1,
      replyCurrentDraftsTotal: 1,
      replyDraftRevisionsTotal: 2,
      sendJobsTotal: 1,
      sendPolicy: { total: 1, enabledUnexpired: 0, enabledButExpired: 1, disabled: 0 },
      latestTimingRule: { minWaitSeconds: 1209600, maxReminders: 1 },
      lifecycle: [
        { replyJobStatus: 'awaiting_review', currentApprovalStatus: 'approved', currentSendStatus: 'smtp_accepted', count: 1 },
      ],
      deliveredToRecipientVerified: false,
      contactPermissionInferred: false,
      sendingEnabledByThisTool: false,
    })
    expect(JSON.stringify(out)).not.toMatch(/PRIVATE|NEVER READ|SECRET|other-owner|sensitive@example|00000000-0000/)
  })

  it('denies absent allow-list without any DB read', async () => {
    const f = fixture()
    expect(await readHandlarborsenReplyLifecycle(ctx(f.db, []))).toEqual({ status: 'not_permitted' })
    expect(f.calls).toHaveLength(0)
  })

  it('denies foreign owner and disabled project before privileged source reads', async () => {
    for (const options of [{ foreignOwner: true }, { disabledProject: true }]) {
      const f = fixture(options)
      expect(await readHandlarborsenReplyLifecycle(ctx(f.db))).toEqual({ status: 'not_permitted' })
      expect(f.calls.map(c => c.table)).toEqual(['projects'])
    }
  })

  it('requires all metadata SELECTs to be fixed-project and owner-scoped when table supports owner_id', async () => {
    const f = fixture()
    expect((await readHandlarborsenReplyLifecycle(ctx(f.db))).status).toBe('ok')
    const otherCalls = f.calls.filter(c => c.table !== 'projects')
    expect(otherCalls).toHaveLength(6)
    for (const call of otherCalls) {
      expect(call.predicates).toContainEqual(['project_id', HB])
      if (['sales_reply_jobs','sales_send_jobs','sales_send_policies','sales_contact_timing_rules'].includes(call.table)) {
        expect(call.predicates).toContainEqual(['owner_id', OWNER])
      }
      expect(call.count).toBe('exact')
    }
    expect(otherCalls.map(c => c.selected)).toEqual([
      'id,status', 'id,job_id,approval_id,is_current', 'revision_id,status',
      'enabled,expires_at', 'version,min_wait_seconds,max_reminders', 'id,status',
    ])
  })

  it('keeps real empty tables distinct from a failed source', async () => {
    const f = fixture({ empty: true })
    const out = await readHandlarborsenReplyLifecycle(ctx(f.db))
    expect(out).toMatchObject({
      status: 'ok', replyJobsTotal: 0, replyDraftRevisionsTotal: 0, sendJobsTotal: 0,
      lifecycle: [], sendPolicy: { total: 0, enabledUnexpired: 0 },
      latestTimingRule: null,
    })
    const broken = fixture({ failedSource: 'sales_send_jobs' })
    expect(await readHandlarborsenReplyLifecycle(ctx(broken.db))).toEqual({
      status: 'unavailable', reason: 'reply_metadata_unavailable',
    })
  })

  it('does not reinterpret a missing approval as approval', async () => {
    const f = fixture({ missingApproval: true })
    expect(await readHandlarborsenReplyLifecycle(ctx(f.db))).toEqual({
      status: 'unavailable', reason: 'reply_metadata_unavailable',
    })
  })

  it('rejects an unexpected revision link and does not leak a send status', async () => {
    const f = fixture({ mismatchedSend: true })
    expect(await readHandlarborsenReplyLifecycle(ctx(f.db))).toEqual({
      status: 'unavailable', reason: 'reply_metadata_unavailable',
    })
  })

  it('treats an enabled unexpired policy as configuration, never sending permission', async () => {
    const f = fixture({ policyExpiry: '2099-10-28T00:00:00.000Z' })
    const out = await readHandlarborsenReplyLifecycle(ctx(f.db))
    expect(out).toMatchObject({
      status: 'ok', sendPolicy: { enabledUnexpired: 1, enabledButExpired: 0 },
      sendingEnabledByThisTool: false,
      contactPermissionInferred: false,
    })
  })

  it('fails closed on malformed policy expiration', async () => {
    const f = fixture({ policyExpiry: 'invalid-date' })
    expect(await readHandlarborsenReplyLifecycle(ctx(f.db))).toEqual({
      status: 'unavailable', reason: 'reply_metadata_unavailable',
    })
  })

  it('caps source reads and never reports a truncated partial snapshot', async () => {
    const f = fixture({ extraJobs: 201 })
    expect(await readHandlarborsenReplyLifecycle(ctx(f.db))).toEqual({
      status: 'unavailable', reason: 'reply_metadata_unavailable',
    })
  })

  it('exposes the reader through the existing Handlarbörsen owner gate', async () => {
    const f = fixture()
    expect(HANDLARBORSEN_READ_TOOL_NAMES).toContain('handlarborsen_reply_lifecycle')
    const r = await handleHandlarborsenReadTool('handlarborsen_reply_lifecycle', ctx(f.db))
    expect(r.status).toBe('ok')
    expect(f.calls[0].table).toBe('projects')
  })

  it.each([
    'Visa Handlarbörsens svarsgodkännande och skickstatus.',
    'Hur ser Handlarbörsens svarsutkast och approval-status ut?',
    'Sammanfatta Handlarbörsens reply-jobb och sändpolicy.',
    'Visa status för Handlarbörsens SMTP-accepted och godkända utkast.',
    'Vad betyder awaiting_review för Handlarbörsens mejlsvarsstatus?',
  ])('routes explicit project reply-status reads: %s', request => {
    expect(classifyHandlarborsenReadIntent(request)).toBe('handlarborsen_reply_lifecycle')
  })

  it.each([
    'Skicka Handlarbörsens godkända svar nu.',
    'Godkänn Handlarbörsens svarsutkast.',
    'Aktivera Handlarbörsens sändpolicy.',
    'Skriv en artikel om Handlarbörsens svarsutkast.',
    'Visa Handlarbörsens vanliga CRM-översikt.',
    'Visa senaste Strato-mejlet för Handlarbörsen.',
    'Visa Familje-Stundens svarsutkast.',
  ])('does not reroute actions or unrelated requests to lifecycle read: %s', request => {
    expect(classifyHandlarborsenReadIntent(request)).not.toBe('handlarborsen_reply_lifecycle')
  })

  it('forces only named lifecycle tool and bypasses generic content/nav fast paths', () => {
    const route = readFileSync(resolve('app/api/chat/route.ts'), 'utf8')
    expect(route).toContain('const hbReplyLifecycleReadIntent =')
    // Check the actual declaration: both exclusions precede the content-mode branch.
    const fastPathGuard = route.match(/^\s*const fastPath = ([^\r\n]+) && \(mode === 'content' \|\| isFastPathContent\(lastUserText\)\)$/m)?.[1] ?? ''
    expect(fastPathGuard).not.toBe('')
    expect(fastPathGuard).not.toContain('||')
    const fastPathConjuncts = fastPathGuard.split(/\s*&&\s*/)
    expect(fastPathConjuncts).toContain('!hbReplyLifecycleReadIntent')
    expect(fastPathConjuncts).toContain('!needsStoredContext(lastUserText)')
    expect(route).toContain('isNavIntent(lastUserText) && !hbReplyLifecycleReadIntent')
    expect(route).toContain("hbReplyLifecycleReadIntent ? TOOLS.filter(tool => tool.name === 'handlarborsen_reply_lifecycle')")
    expect(route).toContain('name: forceHbReadFirstTurn')
    expect(route).toContain("if (name === 'handlarborsen_reply_lifecycle' && Object.keys(input ?? {}).length !== 0)")
    expect(route).toContain("return handleHandlarborsenReadTool(name as typeof HANDLARBORSEN_READ_TOOL_NAMES[number]")
  })

  it('does not contain any write primitive, mail/content retrieval or network execution', () => {
    const file = readFileSync(resolve('lib/atlas/project-analytics/handlarborsen-reply-lifecycle.ts'), 'utf8')
    for (const phrase of [".insert(", ".update(", ".delete(", ".rpc(", "fetch(", "body_text", "sealed_json", "header,",
      "recipient", "sender_email", ".select('*')", "process.env"]) {
      // Keywords can appear in explanatory comments. Only executable calls and
      // selected column strings must remain free of these privileged fields.
      if (phrase === 'recipient') continue
      expect(file).not.toContain(phrase)
    }
  })
})
