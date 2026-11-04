import {it,expect,vi} from 'vitest'
import {parsePrepareSalesInput} from '@/lib/sales/validate'
import {prepareSalesDrafts} from '@/lib/sales/store'
const projectId='10000000-0000-4000-8000-000000000001',userId='20000000-0000-4000-8000-000000000001'
const input={projectId,conversationId:'50000000-0000-4000-8000-000000000001',contactIds:['30000000-0000-4000-8000-000000000001'],offerRevisionId:'40000000-0000-4000-8000-000000000001',idempotencyKey:'editorial-case'}
it('accepts explicit editorial-only preparation without turning it into initial permission',()=>{
 expect(parsePrepareSalesInput({...input,preparationMode:'editorial_only'})).toEqual({...input,preparationMode:'editorial_only'})
})
it('ordinary preparation remains the default when no mode is supplied',()=>{
 expect(parsePrepareSalesInput(input)).toEqual(input)
})
it.each(['send','initial','EDITORIAL_ONLY',null,true])('rejects unsupported preparation mode %s',(preparationMode)=>{
 expect(()=>parsePrepareSalesInput({...input,preparationMode})).toThrow('INVALID_BODY')
})
it('routes only explicit editorial mode to its separate guarded RPC',async()=>{
 const receipt={id:input.conversationId,status:'queued',preparationMode:'editorial_only'}
 const rpc=vi.fn().mockResolvedValue({data:receipt,error:null})
 expect(await prepareSalesDrafts({rpc} as never,{userId,allowedProjectIds:[projectId]},{...input,preparationMode:'editorial_only'} as never)).toEqual(receipt)
 expect(rpc).toHaveBeenCalledWith('sales_prepare_editorial_job',{p_principal:{userId,allowedProjectIds:[projectId]},p_input:{...input,preparationMode:'editorial_only'}})
})
it('still checks project scope before editorial database access',async()=>{
 const rpc=vi.fn()
 await expect(prepareSalesDrafts({rpc} as never,{userId,allowedProjectIds:[]},{...input,preparationMode:'editorial_only'} as never)).rejects.toThrow('NOT_FOUND')
 expect(rpc).not.toHaveBeenCalled()
})

// The server, which sees recorded sends and all source states, owns eligibility.
it('does not offer editorial preparation from blockers alone',async()=>{
 const {canPrepareEditorialContact}=await import('@/lib/sales/view-model')
 const c={id:input.contactIds[0],version:1,confirmed:true,excluded:false,suppressed:false,history:'not_contacted'} as never
 const t={contactId:input.contactIds[0],contactVersion:1,historyRevisionId:input.offerRevisionId,blockers:['SOURCE_GAP','HISTORY_REVIEW_REQUIRED','NOT_INITIAL_CONTACT']} as never
 expect(canPrepareEditorialContact(c,t)).toBe(false)
 expect(canPrepareEditorialContact(c,{...t as object,editorialPreparationAllowed:false} as never)).toBe(false)
 expect(canPrepareEditorialContact(c,{...t as object,editorialPreparationAllowed:true} as never)).toBe(true)
})
