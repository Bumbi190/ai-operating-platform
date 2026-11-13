import {describe,it,expect,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {parseInboxConfig,parseInboxBatch,contentHash} from '@/lib/sales/inbox/validate'
import {configureInbox,readInbox,readInboxMessage} from '@/lib/sales/inbox/store'
const projectId='10000000-0000-4000-8000-000000000001',mailboxId='80000000-0000-4000-8000-000000000001'
const messageId='90000000-0000-4000-8000-000000000001',id='70000000-0000-4000-8000-000000000001'
const principal={userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:[projectId]}
const config=()=>({projectId,mailboxId,expectedVersion:0,folder:'INBOX',since:'2026-10-07T22:00:00Z',selectedContactIds:[]})
const record=()=>({uid:12,internalDate:'2026-10-08T10:00:00Z',size:100,headerSha256:'a'.repeat(64),header:{from:'dealer@example.se',to:'info@example.se',subject:'Svar',messageId:'<one@example.se>',inReplyTo:null,references:[]},text:null,textState:'not_selected',contentSha256:null})
const batch=()=>({ref:{projectId,mailboxId,configVersion:1,mailboxGeneration:6,hostGeneration:2,claimId:id,batchId:id},mode:'scan',expectedCursor:{uidValidity:null,scannedThroughUid:0,epoch:0},uidValidity:'10',throughUid:12,rangeEnd:20,records:[record()]})
describe('scoped inbox inputs and repository boundary',()=>{
 it('keeps the exact selected history and empty contact selection',()=>expect(parseInboxConfig(config())).toEqual(config()))
 it.each([{folder:'Sent'},{password:'SECRET'},{expectedVersion:-1},{since:'2039-01-01T00:00:00Z'},{selectedContactIds:[id,id]}])('rejects unsafe scope %j',patch=>expect(()=>parseInboxConfig({...config(),...patch})).toThrow('INVALID_BODY'))
 it('refuses unauthorized project before any database access',async()=>{const rpc=vi.fn();await expect(configureInbox({rpc} as never,{...principal,allowedProjectIds:[]},config())).rejects.toThrow('NOT_FOUND');expect(rpc).not.toHaveBeenCalled()})
 it('validates scope before calling the real server operation',async()=>{const rpc=vi.fn().mockResolvedValue({data:{version:1},error:null});await configureInbox({rpc} as never,principal,config());expect(rpc).toHaveBeenCalledWith('sales_inbox_configure_inbox',{p_principal:principal,p_input:config()})})
 it('refuses foreign detail IDs and unbounded pagination fields before RPC',async()=>{const rpc=vi.fn();await expect(readInboxMessage({rpc} as never,principal,{projectId:'bad',messageId})).rejects.toThrow();await expect(readInbox({rpc} as never,principal,{projectId,mailboxId,cursor:'bad'})).rejects.toThrow('INVALID_BODY');expect(rpc).not.toHaveBeenCalled()})
 it('accepts headers without granting body access',()=>expect(parseInboxBatch(batch()).records[0].textState).toBe('not_selected'))
 it.each([0,4294967296,1.5])('rejects invalid UID %s',uid=>expect(()=>parseInboxBatch({...batch(),records:[{...record(),uid}]})).toThrow('INVALID_BODY'))
 it('rejects mismatched text digest and body attached to unselected state',()=>{for(const textState of ['complete','not_selected'])expect(()=>parseInboxBatch({...batch(),records:[{...record(),text:'PRIVATE_TEXT',textState,contentSha256:'b'.repeat(64)}]})).toThrow('INVALID_BODY')})
 it('binds content digest to header digest and exact UTF8 text',()=>{const text='Tack åäö';const bytes=Buffer.from(text),length=Buffer.alloc(8);length.writeBigUInt64BE(BigInt(bytes.length));const expected=createHash('sha256').update('OmniraInbox/v1\n').update(Buffer.from('a'.repeat(64),'hex')).update(length).update(bytes).digest('hex');expect(contentHash('a'.repeat(64),text)).toBe(expected);expect(parseInboxBatch({...batch(),records:[{...record(),text,textState:'complete',contentSha256:expected}]}).records[0].text).toBe(text)})
 it('represents vanished mail without invented headers or dates',()=>expect(parseInboxBatch({...batch(),records:[{uid:12,internalDate:null,size:null,headerSha256:null,header:null,text:null,textState:'vanished',contentSha256:null}]}).records[0].header).toBeNull())
 it('keeps selected-text fills behind the already saved cursor',()=>{const value={...batch(),mode:'selected_text',expectedCursor:{uidValidity:'10',scannedThroughUid:30,epoch:1},throughUid:30,rangeEnd:30};expect(parseInboxBatch(value).throughUid).toBe(30);expect(()=>parseInboxBatch({...value,throughUid:31})).toThrow('INVALID_BODY')})
 it('rejects duplicate occurrences, controls, and oversized UTF8 text',()=>{expect(()=>parseInboxBatch({...batch(),records:[record(),record()]})).toThrow('INVALID_BODY');expect(()=>parseInboxBatch({...batch(),records:[{...record(),header:{...record().header,subject:'x\u0000y'}}]})).toThrow('INVALID_BODY');const text='å'.repeat(4097);expect(()=>parseInboxBatch({...batch(),records:[{...record(),text,textState:'complete',contentSha256:contentHash('a'.repeat(64),text)}]})).toThrow('INVALID_BODY')})
})
