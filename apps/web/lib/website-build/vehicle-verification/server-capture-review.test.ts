import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({
 resolve:vi.fn(),create:vi.fn(),check:vi.fn(),make:vi.fn()
}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:mocks.resolve}))
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.create}))
vi.mock('./private-capture-bytes',()=>({checkPrivateVehicleCaptureBytes:mocks.check}))
vi.mock('./owner-scoped-storage',()=>({makeOwnerScopedCapturePorts:mocks.make}))
import {checkCaptureForHumanReview} from './server-capture-review'

const userId='44444444-4444-4444-8444-444444444444'
const projectId='11111111-1111-4111-8111-111111111111'
const owner={ok:true,userId,allowedProjectIds:[projectId]}
describe('server-owned photo review entrypoint stays inert until opt-in',()=>{
 beforeEach(()=>{
  vi.resetAllMocks()
  mocks.resolve.mockResolvedValue(owner)
  mocks.create.mockResolvedValue({auth:{getUser:vi.fn(async()=>({data:{user:{id:userId}},error:null}))}})
  mocks.make.mockReturnValue({test:'owner-scoped-ports'})
  mocks.check.mockResolvedValue({status:'bytes_checked_for_human_review',checked:[]})
 })
 it('does not construct an authenticated storage client when auth is absent',async()=>{
  mocks.resolve.mockResolvedValueOnce({ok:false,response:new Response(null,{status:401})})
  expect(await checkCaptureForHumanReview({})).toEqual({status:'refused',reason:'AUTH_REQUIRED'})
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.make).not.toHaveBeenCalled()
 })
 it('refuses a second-session principal mismatch before any read or validation',async()=>{
  mocks.create.mockResolvedValueOnce({auth:{getUser:vi.fn(async()=>({
   data:{user:{id:'99999999-9999-4999-8999-999999999999'}},error:null
  }))}})
  expect(await checkCaptureForHumanReview({})).toEqual({status:'refused',reason:'SESSION_MISMATCH'})
  expect(mocks.check).not.toHaveBeenCalled()
 })
 it('passes only server-side owner id / owned projects to the adapter',async()=>{
  const intake={fixture:'opaque'}
  expect(await checkCaptureForHumanReview(intake)).toMatchObject({status:'bytes_checked_for_human_review'})
  expect(mocks.make).toHaveBeenCalledWith(expect.objectContaining({auth:expect.any(Object)}),{
   userId,allowedProjectIds:[projectId]
  })
  expect(mocks.check).toHaveBeenCalledWith(intake,{userId,allowedProjectIds:[projectId]},{
   test:'owner-scoped-ports'
  })
 })
 it('fails closed on expired auth or unexpected provider exception',async()=>{
  mocks.create.mockResolvedValueOnce({auth:{getUser:vi.fn(async()=>({data:{user:null},error:null}))}})
  expect(await checkCaptureForHumanReview({})).toEqual({status:'refused',reason:'SESSION_MISMATCH'})
  mocks.create.mockRejectedValueOnce(Error('offline'))
  expect(await checkCaptureForHumanReview({})).toEqual({status:'refused',reason:'CAPTURE_REVIEW_UNAVAILABLE'})
 })
})
