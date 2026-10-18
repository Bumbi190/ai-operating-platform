import {describe,it,expect} from 'vitest'
import {parsePrepareReply,parseReplyDraft,parseReplyRef,parseReplyReview} from './validate'
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const input={projectId:id(1),conversationId:id(2),messageId:id(3),messageVersion:2,contactId:id(4),contactVersion:3,offerRevisionId:id(5),idempotencyKey:id(6)}
const draft={subject:'Svar på din fråga',body:'Tack, vi återkommer med bekräftade uppgifter.',evidenceIds:[id(3)],questions:[]}
describe('reply version and text boundaries',()=>{
 it('accepts exact versioned request without raw addresses',()=>expect(parsePrepareReply(input)).toEqual(input))
 it.each([{...input,toEmail:'other@example.se'},{...input,messageVersion:0},{...input,contactVersion:1.1},{...input,idempotencyKey:'free text'},{...input,conversationId:null}])('rejects changed authority or missing identity %j',v=>expect(()=>parsePrepareReply(v)).toThrow())
 it('allows one plain draft with the bound incoming evidence',()=>expect(parseReplyDraft(draft,id(3))).toEqual(draft))
 it.each([{...draft,toEmail:'other@example.se'},{...draft,subject:'x\r\nBcc: evil@example.se'},{...draft,body:'<img src="https://evil.invalid">'},{...draft,evidenceIds:[id(7)]},{...draft,evidenceIds:[]},{...draft,questions:Array(11).fill('x')},{...draft,body:'x'.repeat(2001)}])('refuses model authority, foreign evidence and oversized output %j',v=>expect(()=>parseReplyDraft(v,id(3))).toThrow())
 it('requires a current exact revision/hash for editorial review',()=>{expect(parseReplyReview({projectId:id(1),revisionId:id(7),expectedHash:'a'.repeat(64),decision:'approved'})).toMatchObject({decision:'approved'});expect(()=>parseReplyReview({projectId:id(1),revisionId:id(7),expectedHash:'a'.repeat(64),decision:'send'})).toThrow()})
 it('rejects incomplete or foreign worker refs',()=>{expect(parseReplyRef({projectId:id(1),jobId:id(7),workerId:id(8),claimId:id(9),generation:2})).toMatchObject({generation:2});expect(()=>parseReplyRef({projectId:id(1),generation:2})).toThrow()})
})
