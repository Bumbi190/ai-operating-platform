import {beforeEach,describe,expect,it,vi} from 'vitest'
const auth=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:auth}))
import {GET} from '../../../app/(platform)/build/demo-motors/review/route'
import {renderVehicleReviewPrototype} from './review-prototype'

describe('fictional read-only reviewer screen',()=>{
 beforeEach(()=>auth.mockReset())
 it('shows six missing originals and four missing comparison views',()=>{
  const html=renderVehicleReviewPrototype()
  expect(html).toContain('FIKTIV PROTOTYP')
  expect(html).toContain('INTE VERIFIERAD')
  expect((html.match(/class="source"/g)||[])).toHaveLength(6)
  expect((html.match(/class="comparison"/g)||[])).toHaveLength(4)
  expect(html).toContain('Godkänn 3D – spärrat')
  expect(html).toContain('disabled aria-disabled="true"')
  expect(html).toContain('/build/demo-motors/assets/3d/')
  expect(html).not.toContain('action="/api')
  expect(html).not.toContain('<script')
  expect(html).toContain('Fiktiv lågpoly-konceptbil')
 })
 it('requires login before any page content is rendered',async()=>{
  auth.mockResolvedValueOnce({ok:false,response:new Response('Unauthorized',{status:401})})
  const res=await GET()
  expect(res.status).toBe(401)
  expect(await res.text()).not.toContain('FIKTIV PROTOTYP')
 })
 it('rejects sessions without an owned project',async()=>{
  auth.mockResolvedValueOnce({ok:true,userId:'fixture',allowedProjectIds:[]})
  const res=await GET()
  expect(res.status).toBe(403)
  expect(await res.text()).not.toContain('Godkänn 3D')
 })
 it('serves a noncacheable, scripted-disabled owner-only prototype',async()=>{
  auth.mockResolvedValueOnce({ok:true,userId:'fixture',allowedProjectIds:['synthetic-owned-project']})
  const res=await GET()
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
  expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  expect(res.headers.get('x-frame-options')).toBe('DENY')
  const html=await res.text()
  expect(html).toContain('Sex obligatoriska originalfoton')
  expect(html).toContain('Inga granskningar kan sparas eller publiceras')
 })
})
