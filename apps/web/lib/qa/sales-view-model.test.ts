import {describe,it,expect} from 'vitest'
import {salesStatusLabel,canPrepareContact} from '@/lib/sales/view-model'
describe('sales presentation truth',()=>{
 it('does not label queued work as running',()=>expect(salesStatusLabel('queued')).toBe('Väntar på lokal worker'))
 it('does not hide uncertain execution behind success',()=>expect(salesStatusLabel('reconciling')).toBe('Behöver stämmas av'))
 it.each(['contacted','unknown'])('blocks initial drafts for %s history',history=>expect(canPrepareContact({confirmed:true,excluded:false,suppressed:false,history} as never)).toBe(false))
 it('blocks suppressed mailbox',()=>expect(canPrepareContact({confirmed:true,excluded:false,suppressed:true,history:'not_contacted'} as never)).toBe(false))
})
