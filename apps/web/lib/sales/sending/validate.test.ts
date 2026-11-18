import {describe,it,expect} from 'vitest'
import {parseConfirmSend,parseSendRef,parseSendRead,parseSendCancel} from './validate'
const projectId='8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const revisionId='91736c50-3db6-4d68-86f8-1660672fed0f'
const expectedRevisionHash='a'.repeat(64)
const input={projectId,revisionId,expectedRevisionHash,expectedMailboxGeneration:6,idempotencyKey:'b1131538-9775-4f03-bede-9cb86d49f789'}
describe('send confirmation boundary',()=>{
 it('accepts only the immutable revision identity and mailbox generation',()=>expect(parseConfirmSend(input)).toEqual(input))
 for(const field of ['body','subject','toEmail','senderEmail','senderName','approved','decision','replyTo','cc','bcc'])it('refuses browser or model override '+field,()=>expect(()=>parseConfirmSend({...input,[field]:'override'})).toThrow('INVALID_BODY'))
 for(const value of [0,-1,1.2,'6',null,undefined])it('refuses invalid mailbox generation '+value,()=>expect(()=>parseConfirmSend({...input,expectedMailboxGeneration:value})).toThrow('INVALID_BODY'))
 for(const value of ['', 'A'.repeat(64),'a'.repeat(63),null])it('refuses malformed revision hash '+value,()=>expect(()=>parseConfirmSend({...input,expectedRevisionHash:value})).toThrow('INVALID_BODY'))
 it('refuses a missing request key',()=>{const {idempotencyKey,...v}=input;expect(()=>parseConfirmSend(v)).toThrow('INVALID_BODY')})
 it('read cannot smuggle a replacement body',()=>expect(()=>parseSendRead({projectId,sendJobId:revisionId,body:'changed'})).toThrow('INVALID_BODY'))
 it('cancellation binds the expected revision hash',()=>expect(parseSendCancel({projectId,sendJobId:revisionId,expectedRevisionHash})).toEqual({projectId,sendJobId:revisionId,expectedRevisionHash}))
 it('worker claim uses sendJobId and an integer fencing generation',()=>{
  const ref={projectId,sendJobId:revisionId,workerId:'49d30271-cf0b-47c9-a70d-2bce5b9b09ba',claimId:input.idempotencyKey,generation:1}
  expect(parseSendRef(ref)).toEqual(ref)
  expect(()=>parseSendRef({...ref,generation:0})).toThrow('INVALID_BODY')
  expect(()=>parseSendRef({...ref,jobId:revisionId})).toThrow('INVALID_BODY')
 })
})
