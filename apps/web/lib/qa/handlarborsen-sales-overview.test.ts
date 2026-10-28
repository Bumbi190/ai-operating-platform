import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { readHandlarborsenSalesOverview } from '@/lib/atlas/project-analytics/handlarborsen-sales-overview'
import { handleHandlarborsenReadTool, HANDLARBORSEN_READ_TOOL_NAMES } from '@/lib/atlas/project-analytics/handlarborsen-operator-tools'
import { classifyHandlarborsenReadIntent } from '@/lib/atlas/project-analytics/handlarborsen-tool-intent'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const HB = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OWNER = 'test-owner'
const NOW = new Date('2026-10-28T09:00:00.000Z')
type Row = Record<string, any>

function fixture(options: {
  otherOwner?: boolean
  badMode?: boolean
  wrongSlug?: boolean
  failedTable?: string
  thrownTable?: string
  nullTable?: string
  empty?: boolean
} = {}) {
  const rows: Record<string, Row[]> = {
    projects: [{
      id: HB, owner_id: options.otherOwner ? 'different-owner' : OWNER,
      slug: options.wrongSlug ? 'familje-stunden' : 'handlarborsen',
      atlas_mode: options.badMode ? 'disabled' : 'observer',
    }],
    sales_contacts: options.empty ? [] : [
      { project_id: HB, data: { confirmed: true, suppressed: true, excluded: false, email: 'private1@example.test', companyName: 'DO NOT READ' } },
      { project_id: HB, data: { confirmed: false, suppressed: true, excluded: true, email: 'private2@example.test' } },
      { project_id: OTHER, data: { confirmed: true, suppressed: false, excluded: false, email: 'OTHER TENANT' } },
    ],
    sales_jobs: [],
    sales_draft_revisions: [],
    sales_inbox_messages: options.empty ? [] : [
      { project_id: HB, body_text: 'SECRET BODY', header: { from: 'protected@example.test' } },
      { project_id: HB, body_text: 'MORE SECRET BODY' },
      { project_id: OTHER, body_text: 'FOREIGN MAIL' },
    ],
    sales_mailbox_connections: options.empty ? [] : [{ project_id: HB, email: 'private-mailbox@example.test' }],
    sales_reply_jobs: options.empty ? [] : [
      { project_id: HB, status: 'awaiting_review', request: { secret: 'PRIVATE' } },
      { project_id: OTHER, status: 'awaiting_review' },
    ],
    sales_reply_draft_revisions: options.empty ? [] : [
      { project_id: HB, data: { privateBody: 'REPLY TEXT' } },
      { project_id: HB, data: { privateBody: 'REPLY TEXT' } },
    ],
    sales_send_jobs: options.empty ? [] : [
      { project_id: HB, status: 'smtp_accepted', recipient: 'private@example.test' },
      { project_id: OTHER, status: 'smtp_accepted' },
    ],
    hb_lead_candidates: [],
    handlarborsen_candidate_inbox: [],
  }
  const calls: Array<{ table: string; cols: string; head: boolean; count: unknown; filters: Array<[string, any]> }> = []
  const reads: string[] = []
  const db = {
    from(table: string) {
      reads.push(table)
      const filters: Array<[string, any]> = []
      let selected = ''
      let settings: { head?: boolean; count?: string } = {}
      const record = () => rows[table].filter(row => filters.every(([key, val]) => {
        const actual = key.startsWith('data->>')
          ? row.data?.[key.slice('data->>'.length)]
          : row[key]
        return String(actual) === String(val)
      }))
      const query: any = {
        select(cols: string, opts: typeof settings = {}) {
          selected = cols
          settings = opts
          if (table !== 'projects') {
            calls.push({ table, cols, head: opts.head === true, count: opts.count, filters })
          }
          return query
        },
        eq(col: string, value: any) { filters.push([col, value]); return query },
        maybeSingle: async () => ({ data: record()[0] ?? null, error: null }),
        then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
          if (table === options.thrownTable) return Promise.reject(new Error('DB FAIL')).then(resolve, reject)
          if (!Object.hasOwn(rows, table) || table === options.failedTable) {
            return Promise.resolve({ count: null, error: { code: 'fake_backend_error' } }).then(resolve, reject)
          }
          // Reject any attempted data read from privileged source tables.
          if (settings.head !== true || settings.count !== 'exact' || selected !== 'project_id') {
            return Promise.reject(new Error('unsafe non-HEAD source read')).then(resolve, reject)
          }
          return Promise.resolve({ count: table === options.nullTable ? null : record().length, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
  return { db, reads, calls }
}

const read = (db: unknown, allowedProjectIds: string[] = [HB], userId = OWNER) =>
  readHandlarborsenSalesOverview({ db, allowedProjectIds, userId, now: NOW })

describe('Handlarbörsen: owner-gated aggregate-only CRM snapshot', () => {
  it('requires the server-provided project allowlist BEFORE any DB query', async () => {
    const f = fixture()
    expect(await read(f.db, [])).toEqual({ status: 'not_permitted' })
    expect(f.reads).toEqual([])
  })

  it('requires the exact authenticated project owner and enabled mode', async () => {
    for (const options of [{ otherOwner: true }, { badMode: true }, { wrongSlug: true }]) {
      const f = fixture(options)
      expect(await read(f.db)).toEqual({ status: 'not_permitted' })
      expect(f.reads).toEqual(['projects'])
    }
    expect(await read(fixture().db, [HB], '')).toEqual({ status: 'not_permitted' })
  })

  it('returns real aggregate categories from synthetic fixture rows without secrets', async () => {
    const f = fixture()
    const out = await read(f.db)
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    const values = Object.fromEntries(out.metrics.map(m => [m.key, m.count]))
    expect(values).toMatchObject({
      sales_contacts_total: 2,
      sales_contacts_suppressed_flag: 2,
      sales_contacts_confirmed_flag: 1,
      sales_contacts_excluded_flag: 1,
      synced_inbox_messages_total: 2,
      mailbox_connections_total: 1,
      reply_jobs_total: 1,
      reply_jobs_awaiting_review: 1,
      reply_draft_revisions_total: 2,
      send_jobs_total: 1,
      send_jobs_smtp_accepted: 1,
      sales_jobs_total: 0,
      sales_draft_revisions_total: 0,
      scb_review_queue_total: 0,
      handlarborsen_candidate_inbox_total: 0,
    })
    expect(out.observedAt).toBe(NOW.toISOString())
    expect(out.contactPermissionInferred).toBe(false)
    expect(out.sendingEnabledByThisTool).toBe(false)
    expect(out.consistency).toBe('non_atomic_multi_table_observation')
    const printed = JSON.stringify(out)
    for (const secret of ['private1@', 'private2@', 'SECRET BODY', 'PRIVATE', 'OTHER TENANT', 'companyName']) {
      expect(printed).not.toContain(secret)
    }
    expect(out.interpretation.join(' ')).toContain('INTE verifierad leverans')
  })

  it('issues HEAD count-only requests with fixed project id and static selectors', async () => {
    const f = fixture()
    expect((await read(f.db)).status).toBe('ok')
    expect(f.calls).toHaveLength(15)
    for (const call of f.calls) {
      expect(call.cols).toBe('project_id')
      expect(call.head).toBe(true)
      expect(call.count).toBe('exact')
      expect(call.filters).toContainEqual(['project_id', HB])
      expect(call.filters).not.toContainEqual(['project_id', OTHER])
      expect(call.filters.some(([k]) => k.includes('email') || k.includes('body') || k.includes('recipient'))).toBe(false)
    }
  })

  it('never includes cross-project counts even with service-role-shaped data access', async () => {
    const f = fixture()
    const out = await read(f.db)
    if (out.status !== 'ok') throw new Error('expected success')
    expect(out.metrics.find(m => m.key === 'sales_contacts_total')?.count).toBe(2)
    expect(out.metrics.find(m => m.key === 'send_jobs_total')?.count).toBe(1)
    expect(out.metrics.find(m => m.key === 'reply_jobs_total')?.count).toBe(1)
  })

  it('distinguishes truly empty queues from unavailable sources', async () => {
    const f = fixture({ empty: true })
    const out = await read(f.db)
    if (out.status !== 'ok') throw new Error('expected success')
    expect(out.metrics.every(m => m.count === 0)).toBe(true)
    expect(out.interpretation.join(' ')).toContain('lokalt granskade SCB-underlag')
  })

  it('fails closed on errors and never converts failed counts to zeros', async () => {
    for (const failedTable of ['sales_contacts', 'sales_inbox_messages', 'hb_lead_candidates']) {
      const f = fixture({ failedTable })
      expect(await read(f.db)).toEqual({ status: 'unavailable', reason: 'aggregate_unavailable' })
    }
  })

  it('fails closed on null counts and thrown query errors', async () => {
    expect(await read(fixture({ nullTable: 'sales_jobs' }).db))
      .toEqual({ status: 'unavailable', reason: 'aggregate_unavailable' })
    expect(await read(fixture({ thrownTable: 'sales_send_jobs' }).db))
      .toEqual({ status: 'unavailable', reason: 'aggregate_unavailable' })
  })

  it('exposes counts through the existing read-only Atlas handler', async () => {
    const f = fixture()
    expect(HANDLARBORSEN_READ_TOOL_NAMES).toContain('handlarborsen_sales_overview')
    const result = await handleHandlarborsenReadTool('handlarborsen_sales_overview', {
      db: f.db, userId: OWNER, allowedProjectIds: [HB], now: NOW,
    })
    expect(result.status).toBe('ok')
    expect(f.reads[0]).toBe('projects')
  })

  it('routes CRM summaries but preserves latest mail and marketplace statistics', () => {
    expect(classifyHandlarborsenReadIntent('Sammanfatta Handlarbörsens CRM-status'))
      .toBe('handlarborsen_sales_overview')
    expect(classifyHandlarborsenReadIntent('Hur är läget med Handlarbörsens kontakter och mejluppföljning?'))
      .toBe('handlarborsen_sales_overview')
    expect(classifyHandlarborsenReadIntent('Hur många säljkontakter har Handlarbörsen?'))
      .toBe('handlarborsen_sales_overview')
    expect(classifyHandlarborsenReadIntent('Visa antal SCB-kandidater hos Handlarbörsen'))
      .toBe('handlarborsen_sales_overview')
    expect(classifyHandlarborsenReadIntent('Vilket är senaste Strato-mejlet för Handlarbörsen?'))
      .toBe('handlarborsen_latest_mail')
    expect(classifyHandlarborsenReadIntent('Hur många verifierade handlare har Handlarbörsen?'))
      .toBe('handlarborsen_statistics')
  })

  it('does not turn sending or unrelated writing prompts into sales reads', () => {
    for (const s of [
      'Skicka mejl till Handlarbörsens säljkontakter',
      'Kan du skicka en översikt till Handlarbörsens CRM-kontakter?',
      'Skriv en artikel om Handlarbörsens CRM-status',
      'Visa inte Handlarbörsens CRM-status',
      'Sammanfatta Familje-Stundens CRM-status',
      'Starta Handlarbörsens säljjobb',
    ]) {
      expect(classifyHandlarborsenReadIntent(s)).not.toBe('handlarborsen_sales_overview')
    }
  })

  it('keeps the chat on the proven read path, never as action or navigation', () => {
    const route = readFileSync(resolve('app/api/chat/route.ts'), 'utf8')
    expect(route).toContain('const hbSalesOverviewReadIntent =')
    expect(route).toContain('const fastPath = !hbSalesOverviewReadIntent')
    expect(route).toContain('!hbSalesOverviewReadIntent && isNavIntent(lastUserText)')
    expect(route).toContain("name === hbReadIntent")
    expect(route).toContain("return handleHandlarborsenReadTool(name as typeof HANDLARBORSEN_READ_TOOL_NAMES[number]")
  })
})
