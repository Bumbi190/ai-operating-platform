import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ user: vi.fn(), scope: vi.fn(), admin: vi.fn(), operator: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: m.user } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }))
vi.mock('@/lib/auth/organization-project-read', () => ({ resolveOrganizationReadScope: m.scope }))
vi.mock('@/lib/auth/platform-operator', () => ({ resolvePlatformOperator: m.operator }))
import { POST, GET } from '@/app/api/organization/proposals/route'
import { PATCH } from '@/app/api/organization/proposals/[id]/route'
const origin = 'https://app.omniraos.se'
const project = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const foreign = '22222222-2222-4222-8222-222222222222'
const proposal = '11111111-1111-4111-8111-111111111111'
function request(method: 'POST'|'PATCH', path: string, body: unknown, from = origin) {
  return new Request(origin + path, { method, headers: { origin: from, 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
function setup() {
  const chain: any = { data: null, error: null }
  for (const op of ['in','order','limit','insert','update','eq','neq','select','single']) chain[op] = vi.fn(() => chain)
  chain.single = vi.fn(async () => ({ data: { id: proposal, status: 'pending' }, error: null }))
  chain.maybeSingle = vi.fn(async () => ({ data: { id: proposal, status: 'approved' }, error: null }))
  chain.limit = vi.fn(async () => ({ data: [], error: null }))
  m.admin.mockReturnValue({ from: vi.fn(() => chain) })
  return chain
}
beforeEach(() => {
  vi.clearAllMocks()
  m.user.mockResolvedValue({ data: { user: { id: 'collaborator' } } })
  m.scope.mockResolvedValue({ role: { active: true, role: 'collaborator' }, projectIds: [project, foreign] })
  m.operator.mockResolvedValue({ ok: false })
  setup()
})
describe('collaborator proposal queue never executes actions', () => {
  it('denies cross-origin and foreign project proposals', async () => {
    expect((await POST(request('POST','/api/organization/proposals',{ project_id:project, title:'Improve',detail:'Description 1234'}, 'https://other.example'))).status).toBe(403)
    expect((await POST(request('POST','/api/organization/proposals',{ project_id:foreign, title:'Improve',detail:'Description 1234'}))).status).toBe(400)
  })
  it('accepts only canonical Handlarbörsen and trusts session author, not payload', async () => {
    const r = await POST(request('POST','/api/organization/proposals',{ project_id:project, title:'Improve',detail:'Description 1234'}))
    expect(r.status).toBe(201)
    const db = m.admin.mock.results.at(-1)?.value
    expect(db.from().insert).toHaveBeenCalledWith({ project_id:project, author_id:'collaborator', title:'Improve',detail:'Description 1234' })
  })
  it('fails closed for inactive session or requested role spoofing', async () => {
    m.scope.mockResolvedValue({ role:{active:false,role:null},projectIds:[project] })
    expect((await GET()).status).toBe(403)
    expect((await POST(request('POST','/api/organization/proposals',{project_id:project,title:'Improve',detail:'Description 1234'}))).status).toBe(403)
  })
  it('only the platform Owner can approve, never self-approve', async () => {
    m.operator.mockResolvedValue({ok:true,userId:'owner'})
    m.user.mockResolvedValue({data:{user:{id:'owner'}}})
    m.scope.mockResolvedValue({role:{active:true,role:'owner'},projectIds:[project]})
    const r = await PATCH(request('PATCH','/api/organization/proposals/'+proposal,{decision:'approved',reason:'Review completed'}),{params:{id:proposal}})
    expect(r.status).toBe(200)
    const chain = m.admin.mock.results.at(-1)?.value.from()
    expect(chain.neq).toHaveBeenCalledWith('author_id','owner')
    expect(chain.eq).toHaveBeenCalledWith('status','pending')
    expect(chain.in).toHaveBeenCalledWith('project_id',[project])
  })
  it('denies collaborator approval even if it claims an Owner role in the body', async () => {
    expect((await PATCH(request('PATCH','/api/organization/proposals/'+proposal,{decision:'approved',reason:'x',role:'owner'}),{params:{id:proposal}})).status).toBe(403)
  })
})
