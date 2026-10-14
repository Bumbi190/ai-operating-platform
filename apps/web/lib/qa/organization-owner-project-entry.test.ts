import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({model:vi.fn(),session:vi.fn(),role:vi.fn(),owned:vi.fn()}))
vi.mock('@/lib/os/organization-command-center-reader',()=>({loadOrganizationProjectCommandCenter:mocks.model}))
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.session}))
vi.mock('@/lib/auth/organization-role',()=>({resolveOrganizationRole:mocks.role}))
vi.mock('@/lib/project/get-project',()=>({getProjectBySlug:mocks.owned}))
vi.mock('next/navigation',()=>({redirect:(href:string)=>{throw Error('REDIRECT:'+href)},notFound:()=>{throw Error('NOT_FOUND')}}))
import OrganizationProjectPage from '@/app/organization/projects/[slug]/page'
beforeEach(()=>{
vi.clearAllMocks()
vi.stubGlobal('React',React)
mocks.model.mockResolvedValue({project:{id:'owned-project',slug:'test-project'}})
mocks.session.mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'owner-user'}}})}})
mocks.role.mockResolvedValue({active:true,role:'owner'})
mocks.owned.mockResolvedValue({id:'owned-project',slug:'test-project'})
})
function hasDisabledFieldset(node:any):boolean { return Array.isArray(node)?node.some(hasDisabledFieldset):Boolean(node && typeof node==='object' && (node.type==='fieldset'&&node.props.disabled===true || hasDisabledFieldset(node.props?.children))) }
describe('organization project entry retains owner access and collaborator isolation',()=>{
it('sends a verified owner of this exact project to the existing owner workspace',async()=>{
await expect(OrganizationProjectPage({params:{slug:'test-project'}})).rejects.toThrow('REDIRECT:/projects/test-project')
})
it('never redirects an owner into another owner project even if read scope includes it',async()=>{
mocks.owned.mockResolvedValue(null)
const page=await OrganizationProjectPage({params:{slug:'test-project'}})
expect(hasDisabledFieldset(page)).toBe(true)
})
it('keeps the collaborator in a disabled monitoring view',async()=>{
mocks.role.mockResolvedValue({active:true,role:'collaborator'})
const page=await OrganizationProjectPage({params:{slug:'test-project'}})
expect(hasDisabledFieldset(page)).toBe(true)
expect(mocks.owned).not.toHaveBeenCalled()
})
})

it('does not redirect when the RLS-owned project is non-null but has a different ID',async()=>{
mocks.owned.mockResolvedValue({id:'different-project',slug:'test-project'})
const page=await OrganizationProjectPage({params:{slug:'test-project'}})
expect(hasDisabledFieldset(page)).toBe(true)
})
