import {it,expect} from 'vitest'
import {validateManifest,manifestHash} from './manifest'
const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0')
const item={postId:id(2),revisionId:id(3),sha256:'a'.repeat(64),decisionId:id(4),planRevisionId:id(5),bindingId:id(6),accountId:'12345',channel:'facebook',asset:{id:id(7),sha256:'b'.repeat(64)},localMinute:'2026-10-20T17:00',scheduledAt:'2026-10-20T15:00:00.000Z',expiresAt:'2026-10-20T15:10:00.000Z',occasionId:id(8),kind:'ordinary',releaseCondition:null}
const base={projectId:id(1),items:[item]},now='2026-10-18T07:00:00.000Z'
it('pins every bound value using a stable canonical hash',()=>{
 const m=validateManifest(base,now),h=manifestHash(m)
 expect(manifestHash({items:m.items,projectId:m.projectId})).toBe(h)
 for(const patch of [{sha256:'c'.repeat(64)},{asset:{...item.asset,sha256:'d'.repeat(64)}},{accountId:'999'},{scheduledAt:'2026-10-20T15:01:00.000Z'}])expect(manifestHash({...m,items:[{...m.items[0],...patch}]} as any)).not.toBe(h)
})
it('rejects unknown fields duplicate channels and inconsistent times',()=>{
 for(const v of [{...base,extra:true},{...base,items:[item,{...item,postId:id(9)}]},{...base,items:[{...item,scheduledAt:'2026-10-20T16:00:00.000Z'}]},{...base,items:[{...item,asset:{...item.asset,url:'https://evil.test'}}]},{...base,items:[{...item,expiresAt:'2026-10-20T15:11:00.000Z'}]}])expect(()=>validateManifest(v,now)).toThrow()
 expect(()=>validateManifest(base,'2026-10-20T15:00:00.000Z')).toThrow()
})
it('binds a monthly sneak peek to its own month catalog and 1st at 20:30',()=>{
 const monthly={...item,kind:'month_release',localMinute:'2026-11-01T20:30',scheduledAt:'2026-11-01T19:30:00.000Z',expiresAt:'2026-11-01T19:40:00.000Z',releaseCondition:{releaseMonth:'2026-11',catalogSha256:'e'.repeat(64)}}
 expect(validateManifest({...base,items:[monthly]},now).items[0].releaseCondition!.releaseMonth).toBe('2026-11')
 expect(()=>validateManifest({...base,items:[{...monthly,releaseCondition:{...monthly.releaseCondition,releaseMonth:'2027-11'}}]},now)).toThrow()
})
