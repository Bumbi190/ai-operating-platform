import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const { session, save, client } = vi.hoisted(() => ({ session: vi.fn(), save: vi.fn(), client: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: client }))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitor-store', () => ({ saveManualCompetitorScan: save }))
import * as route from '@/app/(platform)/projects/[slug]/competitors/scan/route'
const context = { params: { slug: 'handlarborsen' } }
const request = (origin?: string) => new NextRequest('https://omnira.example/projects/handlarborsen/competitors/scan', {
  method: 'POST', headers: origin ? { origin } : {},
})
beforeEach(() => {
  vi.clearAllMocks()
  client.mockResolvedValue({ auth: { getUser: session } })
  session.mockResolvedValue({ data: { user: { id: 'user' } }, error: null })
  save.mockResolvedValue('saved')
})
describe('explicit native POST guard', () => {
  it('exports only POST, never GET or an implicit scan', () => expect(Object.keys(route)).toEqual(['POST']))
  it.each([undefined, 'null', 'https://foreign.example', 'http://omnira.example'])('denies missing/foreign origin %s before session or scan', async origin => {
    expect((await route.POST(request(origin), context)).status).toBe(403)
    expect(client).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
  it('denies user-selected target before session or scan', async () => {
    expect((await route.POST(request('https://omnira.example'), { params: { slug: 'other' } })).status).toBe(404)
    expect(client).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
  it.each([{ data: { user: null }, error: null }, { data: { user: { id: 'user' } }, error: {} }])('requires validated session', async result => {
    session.mockResolvedValue(result)
    expect((await route.POST(request('https://omnira.example'), context)).status).toBe(401)
    expect(save).not.toHaveBeenCalled()
  })
  it('fails closed when session validation throws', async () => {
    session.mockRejectedValueOnce(new Error('private'))
    expect((await route.POST(request('https://omnira.example'), context)).status).toBe(401)
    expect(save).not.toHaveBeenCalled()
  })
  it('passes no request target/input into store and uses POST/redirect/GET', async () => {
    const req = new NextRequest('https://omnira.example/projects/handlarborsen/competitors/scan?url=https://evil.example&project_id=other&source_id=other', {
      method: 'POST', headers: { origin: 'https://omnira.example' }, body: 'url=https://evil.example',
    })
    const response = await route.POST(req, context)
    expect(save).toHaveBeenCalledWith()
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://omnira.example/projects/handlarborsen/competitors?result=saved')
  })
  it('returns forbidden when fixed-project RLS authorization denies write', async () => {
    save.mockResolvedValue('not_permitted')
    expect((await route.POST(request('https://omnira.example'), context)).status).toBe(403)
  })
})
