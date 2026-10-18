import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  load: vi.fn(async (): Promise<any> => ({ status: 'ok', unreadCount: 1, notifications: [{ host: 'private.example', name: 'Private evidence' }] })),
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-candidate-inbox-service', () => ({
  competitorInboxEnabled: mocks.enabled, loadCompetitorInbox: mocks.load, markCompetitorInboxRead: vi.fn(),
}))
import * as owner from '@/app/api/projects/[slug]/competitors/inbox/route'
import * as collaborator from '@/app/api/organization/projects/[slug]/competitors/inbox/route'
const url = 'https://omniraos.se/api/projects/handlarborsen/competitors/inbox'
const call = (route: any, suffix = '', slug = 'handlarborsen') =>
  route.GET(new Request(url + suffix), { params: { slug } })
beforeEach(() => {
  mocks.enabled.mockReset().mockReturnValue(true)
  mocks.load.mockReset().mockResolvedValue({ status: 'ok', unreadCount: 1, notifications: [{ host: 'private.example', name: 'Private evidence' }] })
})
describe('personal shell inbox summary', () => {
  it('exports server-authorized GET on both role-specific routes', () => {
    expect(owner.GET).toBeTypeOf('function')
    expect(collaborator.GET).toBeTypeOf('function')
  })
  it('returns only verified counts, never recipient identity or candidate evidence', async () => {
    for (const [route, mode] of [[owner, 'owner'], [collaborator, 'collaborator']] as const) {
      const response = await call(route)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(await response.json()).toEqual({ status: 'ok', unreadCount: 1, totalCount: 1 })
      expect(mocks.load).toHaveBeenLastCalledWith(mode)
    }
  })
  it('rejects project and recipient overrides before any inbox read', async () => {
    for (const route of [owner, collaborator]) {
      expect((await call(route, '', 'another-project')).status).toBe(404)
      expect((await call(route, '?recipient=other')).status).toBe(400)
    }
    expect(mocks.load).not.toHaveBeenCalled()
  })
  it('stays off with no database read when the existing inbox switch is off', async () => {
    mocks.enabled.mockReturnValue(false)
    expect((await call(owner)).status).toBe(409)
    expect(mocks.load).not.toHaveBeenCalled()
  })
  it.each([['unauthorized',401],['forbidden',403],['disabled',409],['unavailable',503]])(
    'preserves %s without manufacturing a zero count', async (status, code) => {
      mocks.load.mockResolvedValue({status})
      const response = await call(collaborator)
      expect(response.status).toBe(code)
      expect(await response.json()).toEqual({status})
    })
  it('distinguishes a verified empty inbox from a failed read', async () => {
    mocks.load.mockResolvedValue({status:'ok',unreadCount:0,notifications:[]})
    expect(await (await call(owner)).json()).toEqual({status:'ok',unreadCount:0,totalCount:0})
  })
})
