import {describe,it,expect} from 'vitest'
import {projectDirectoryContext} from '../sales/companies/projects'
const id='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',userId='10000000-0000-4000-8000-000000000003'
const p={userId,allowedProjectIds:[id,other]},row=(value=id)=>({id:value,name:'Synthetic Project',slug:'synthetic-project',owner_id:userId})
describe('real owner-project directory context',()=>{
 it('projects only owned allowed and enabled real identities',()=>{const ctx=projectDirectoryContext([row(),{...row(other),name:'Other',slug:'other'}],p,id,x=>x===id);expect(ctx).toEqual({project:{id,name:'Synthetic Project',slug:'synthetic-project'},projectOptions:[{id,name:'Synthetic Project',slug:'synthetic-project'}]});expect(JSON.stringify(ctx)).not.toContain(userId)})
 it('refuses foreign, duplicate, malformed and oversized catalogues',()=>{for(const rows of [[{...row(),owner_id:other}],[row(),row()],[{...row(),id:'invalid'}],[{...row(),slug:'../../other'}],[{...row(),name:'<script>'}],Array.from({length:101},()=>row())])expect(()=>projectDirectoryContext(rows,p,id,()=>true)).toThrow()})
 it('denies unknown, inaccessible or disabled selected projects',()=>{for(const [principal,selected,enabled] of [[p,other,()=>true],[{...p,allowedProjectIds:[] as string[]},id,()=>true],[p,id,()=>false]] as const)expect(()=>projectDirectoryContext([row()],principal,selected,enabled)).toThrow()})
})
