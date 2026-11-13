import {describe,it,expect} from 'vitest'
import {parsePrepareSalesInput,parseSalesDraft,normalizeSalesEmail,assertDraftBinding} from '@/lib/sales/validate'
import {hashSalesDraft} from '@/lib/sales/binding'
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const input=()=>({projectId:id(1),conversationId:id(2),contactIds:[id(3)],offerRevisionId:id(4),idempotencyKey:'prepare-1'})
const draft=()=>({contactId:id(3),contactVersion:1,offerRevisionId:id(4),senderEmail:'info@handlarborsen.se',toEmail:'info@example.se',subject:'En fråga om er bilhandel',body:'Jag är en AI-assistent. Vill ni veta mer om piloten?',evidenceIds:[id(5)],questions:[]})
describe('sales contracts',()=>{
 it('accepts a bounded explicit project request',()=>expect(parsePrepareSalesInput(input())).toEqual(input()))
 it('rejects six contacts',()=>expect(()=>parsePrepareSalesInput({...input(),contactIds:[3,4,5,6,7,8].map(id)})).toThrow('INVALID_BODY'))
 it('rejects duplicate contacts',()=>expect(()=>parsePrepareSalesInput({...input(),contactIds:[id(3),id(3)]})).toThrow('INVALID_BODY'))
 it('rejects model supplied raw recipient',()=>expect(()=>parsePrepareSalesInput({...input(),toEmail:'other@example.se'})).toThrow('INVALID_BODY'))
 it('rejects missing conversation',()=>expect(()=>parsePrepareSalesInput({...input(),conversationId:null})).toThrow('INVALID_BODY'))
 it('normalizes mailbox without merging branch IDs',()=>{expect(normalizeSalesEmail(' INFO@EXAMPLE.SE ')).toBe('info@example.se');expect(parseSalesDraft({...draft(),contactId:id(6)}).contactId).not.toBe(parseSalesDraft(draft()).contactId)})
 it('allows honest AI disclosure',()=>expect(parseSalesDraft(draft()).body).toContain('AI-assistent'))
 it.each(['senderEmail','toEmail','subject'])('rejects header injection in %s',field=>expect(()=>parseSalesDraft({...draft(),[field]:'a@example.se\r\nBcc: victim@example.se'})).toThrow('INVALID_BODY'))
 it('rejects unknown model fields',()=>expect(()=>parseSalesDraft({...draft(),send:true})).toThrow('INVALID_BODY'))
 it('rejects HTML and unresolved merge tags',()=>{for(const body of ['<div>Hej</div>','Hej {{company}}'])expect(()=>parseSalesDraft({...draft(),body})).toThrow('INVALID_BODY')})
 it('rejects oversized text instead of truncating',()=>expect(()=>parseSalesDraft({...draft(),body:'å'.repeat(2001)})).toThrow('INVALID_BODY'))
 it.each(['senderEmail','toEmail','body','offerRevisionId'])('binds review to %s',field=>expect(hashSalesDraft({...draft(),[field]:field.endsWith('Id')?id(99):field.endsWith('Email')?'new@example.se':'Ändrad text'})).not.toBe(hashSalesDraft(draft())))
 it('hash is stable for evidence ordering and email case',()=>expect(hashSalesDraft({...draft(),toEmail:'INFO@EXAMPLE.SE',evidenceIds:[id(5),id(6)]})).toBe(hashSalesDraft({...draft(),evidenceIds:[id(6),id(5)]})))
 it('refuses a foreign contact and foreign evidence',()=>{const binding={contactId:id(3),contactVersion:1,offerRevisionId:id(4),senderEmail:draft().senderEmail,toEmail:draft().toEmail,evidenceIds:[id(5)]};expect(()=>assertDraftBinding({...draft(),contactId:id(9)},binding)).toThrow('BINDING_MISMATCH');expect(()=>assertDraftBinding({...draft(),evidenceIds:[id(9)]},binding)).toThrow('BINDING_MISMATCH')})
})
