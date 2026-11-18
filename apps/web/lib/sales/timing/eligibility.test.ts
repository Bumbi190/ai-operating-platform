import {it,expect} from 'vitest'
import {canPrepareContact} from '../view-model'
const c={id:'10000000-0000-4000-8000-000000000001',version:1,confirmed:true,excluded:false,suppressed:false,history:'not_contacted'} as any
it('missing timing cannot silently allow an initial draft',()=>expect(canPrepareContact(c,undefined)).toBe(false))
it('server blocked result cannot be ignored',()=>expect(canPrepareContact(c,{contactId:c.id,contactVersion:1,initialPreparationAllowed:false} as any)).toBe(false))
it('matching server eligibility and contact version is necessary',()=>{
 expect(canPrepareContact(c,{contactId:c.id,contactVersion:1,initialPreparationAllowed:true} as any)).toBe(true)
 expect(canPrepareContact(c,{contactId:c.id,contactVersion:2,initialPreparationAllowed:true} as any)).toBe(false)
})
