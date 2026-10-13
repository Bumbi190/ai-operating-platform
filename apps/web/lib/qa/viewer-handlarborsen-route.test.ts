import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const route = readFileSync(resolve(process.cwd(), 'app/api/viewer/handlarborsen/route.ts'), 'utf8')
describe('Handlarbörsen viewer route deny-by-default invariants', () => {
  it('allows GET only and requires authenticated session', () => {
    expect(route).toContain('export async function GET()')
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/)
    expect(route).toContain('client.auth.getUser()')
    expect(route).toContain("status: 401")
  })
  it('verifies membership or actual owner before reading the internal report', () => {
    expect(route.indexOf('hasProjectViewerMembership(')).toBeLessThan(route.indexOf('loadHandlarborsenMarketplaceReport('))
    expect(route).toContain("if (!permitted) return denied()")
    expect(route).toContain("if (ownerError) return denied()")
    expect(route).toContain("eq('owner_id', user.id)")
    expect(route).toContain('HANDLARBORSEN_PROJECT_ID')
  })
  it('returns only explicit metrics and no raw private report or cached shared payload', () => {
    expect(route).toContain("'Cache-Control': 'private, no-store'")
    expect(route).toContain('metrics: (report.latest?.metrics ?? []).map(({ key, label, value }) => ({ key, label, value }))')
    expect(route).not.toContain('return NextResponse.json(report')
    expect(route).not.toContain('CRON_SECRET')
    expect(route).not.toContain('createAdminClient')
  })
})
