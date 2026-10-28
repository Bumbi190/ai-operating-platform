import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const marketplace = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-marketplace-read', () => ({
  loadHandlarborsenMarketplaceReport: marketplace.load,
}))

import { handleHandlarborsenReadTool } from '@/lib/atlas/project-analytics/handlarborsen-operator-tools'

const HB = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3', OWNER = 'signed-in-owner'

function dbFixture(options: {
  connection?: { id: string; project_id: string; owner_id: string; email: string; status: string }
  config?: { mailbox_id: string; project_id: string; owner_id: string; state: string; selected_contact_ids: string[]; last_synced_at: string }
  messages?: Record<string, unknown>[]
  mode?: string
} = {}) {
  const reads: string[] = []
  const tables: Record<string, Record<string, unknown>[]> = {
    projects: [{ id: HB, owner_id: OWNER, slug: 'handlarborsen', atlas_mode: options.mode ?? 'observer' }],
    sales_mailbox_connections: options.connection ? [options.connection] : [{
      id: 'mailbox', project_id: HB, owner_id: OWNER,
      email: 'info@handlarborsen.se', status: 'authenticated',
    }],
    sales_inbox_configs: options.config ? [options.config] : [{
      mailbox_id: 'mailbox', project_id: HB, owner_id: OWNER,
      state: 'enabled', last_synced_at: '2026-10-28T05:45:58Z',
      selected_contact_ids: [],
    }],
    sales_inbox_messages: options.messages ?? [{
      project_id: HB, owner_id: OWNER, mailbox_id: 'mailbox',
      header: { subject: 'Besked om pilotplats', from: 'test@example.com' },
      internal_date: '2026-10-26T13:23:53Z', text_selected: false,
      text_state: 'not_selected', body_text: null, contact_id: 'contact-1',
    }],
  }
  const db = {
    from(table: string) {
      reads.push(table)
      const filters: Array<[string, unknown]> = []
      let descending = false, count = 100
      const rows = () => tables[table].filter(row => filters.every(([key, value]) => row[key] === value))
        .sort((a, b) => descending ? String(b.internal_date).localeCompare(String(a.internal_date)) : 0).slice(0, count)
      const builder: any = {
        select: () => builder,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return builder },
        order: (_key: string, options: { ascending: boolean }) => { descending = !options.ascending; return builder },
        limit: (n: number) => { count = n; return builder },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
      }
      return builder
    },
  }
  return { db, reads }
}
function scope(db: unknown, allowedProjectIds: string[] = [HB], userId = OWNER) {
  return { db, allowedProjectIds, userId }
}

describe('Atlas Handlarbörsen read-only tools', () => {
  it('does not touch the database without the owner-scoped project allowlist', async () => {
    const fake = dbFixture()
    const result = await handleHandlarborsenReadTool('handlarborsen_latest_mail', scope(fake.db, []))
    expect(result).toEqual({ status: 'not_permitted' })
    expect(fake.reads).toHaveLength(0)
  })
  it('reads the latest mailbox header without reading unselected message text', async () => {
    const fake = dbFixture()
    const result = await handleHandlarborsenReadTool('handlarborsen_latest_mail', scope(fake.db))
    expect(result).toMatchObject({
      status: 'ok', mailbox: 'info@handlarborsen.se',
      subject: 'Besked om pilotplats', receivedAt: '2026-10-26T13:23:53Z',
      from: 'test@example.com', body: null,
      bodyStatus: 'not_authorized_or_not_collected',
    })
    expect(fake.reads).toEqual([
      'projects', 'sales_mailbox_connections', 'sales_inbox_configs', 'sales_inbox_messages',
    ])
  })
  it('reveals a body only when it is complete AND the contact remains selected', async () => {
    const message = {
      project_id: HB, owner_id: OWNER, mailbox_id: 'mailbox',
      header: { subject: 'Svar', from: 'verified@example.com' }, internal_date: '2026-10-27T12:00:00Z',
      text_selected: true, text_state: 'complete', body_text: 'Hej, jag är intresserad av piloten.',
      contact_id: 'contact-1',
    }
    const cfg = { mailbox_id: 'mailbox', project_id: HB, owner_id: OWNER, state: 'enabled',
      selected_contact_ids: ['contact-1'], last_synced_at: '2026-10-28T05:45:58Z' }
    const authorized = dbFixture({ messages: [message], config: cfg })
    const yes = await handleHandlarborsenReadTool('handlarborsen_latest_mail', scope(authorized.db))
    expect(yes).toMatchObject({ body: 'Hej, jag är intresserad av piloten.', bodyStatus: 'selected_and_loaded' })
    const revoked = dbFixture({ messages: [message], config: { ...cfg, selected_contact_ids: [] } })
    const no = await handleHandlarborsenReadTool('handlarborsen_latest_mail', scope(revoked.db))
    expect(no).toMatchObject({ body: null, bodyStatus: 'not_authorized_or_not_collected' })
  })
  it('never reads mail across owners or disabled mailbox', async () => {
    const otherOwner = dbFixture()
    expect(await handleHandlarborsenReadTool('handlarborsen_latest_mail', scope(otherOwner.db, [HB], 'another-user')))
      .toEqual({ status: 'not_permitted' })
    expect(otherOwner.reads).toEqual(['projects'])
    const inactive = dbFixture({ mode: 'disabled' })
    expect(await handleHandlarborsenReadTool('handlarborsen_latest_mail', scope(inactive.db)))
      .toEqual({ status: 'not_permitted' })
    const disabledMailbox = dbFixture({ connection: {
      id: 'mailbox', project_id: HB, owner_id: OWNER, email: 'info@handlarborsen.se', status: 'pending',
    } })
    expect(await handleHandlarborsenReadTool('handlarborsen_latest_mail', scope(disabledMailbox.db)))
      .toMatchObject({ status: 'unavailable', reason: 'mailbox_not_authenticated' })
  })
  it('returns the existing validated KPI report with its snapshot provenance and does not invent a dealer identity', async () => {
    marketplace.load.mockResolvedValueOnce({
      status: 'ok', report: {
        state: 'ok',
        latest: {
          snapshotDate: '2026-10-27', observedAt: '2026-10-27T06:55:03Z', completeness: 'complete',
          freshness: 'fresh', definitionId: 'handlarborsen-production-v2',
          dataScope: 'production_excluding_quarantined_test', excludedTestOrganisations: 2,
          metrics: [{ key: 'companies_verified_total', label: 'Verifierade företag',
            kind: 'total', value: 3, reasonLabel: null }],
        },
        history: { comparison: { available: false, reason: 'definition_changed' } },
      },
    })
    const fake = dbFixture()
    const result = await handleHandlarborsenReadTool('handlarborsen_statistics', scope(fake.db))
    expect(result).toMatchObject({
      status: 'ok', snapshotDate: '2026-10-27', dataScope: 'production_excluding_quarantined_test',
      metrics: [{ key: 'companies_verified_total', value: 3 }],
      comparison: { available: false, reason: 'definition_changed' },
    })
    expect(result).not.toHaveProperty('verifiedDealerName')
    expect(fake.reads).toHaveLength(0)
    expect(marketplace.load).toHaveBeenCalledWith(
      { id: HB, slug: 'handlarborsen' }, { allowedProjectIds: [HB] }, expect.any(Object),
    )
  })
})
