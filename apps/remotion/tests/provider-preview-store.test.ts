import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createProviderPreviewStore} from '../../web/lib/media/provider-preview-store'
import {PREVIEW_ID,PREVIEW_PROJECT_ID,PREVIEW_INPUT_HASH,PREVIEW_KIND} from '../../web/lib/media/provider-preview'
function db(){
 let row:any=null,fail=false;const filters:any[]=[]
 const fake:any={from:(table:string)=>{assert.equal(table,'media_scripts');let mode='read',value:any
  const q:any={select:()=>q,eq:(...v:any[])=>{filters.push(v);return q},
   insert:(v:any)=>{mode='insert';value=v;return q},update:(v:any)=>{mode='update';value=v;return q},
   maybeSingle:async()=>{
    if(fail)return{data:null,error:{code:'XX000'}}
    if(mode==='insert'){if(row)return{data:null,error:{code:'23505'}};row=structuredClone(value)}
    if(mode==='update')row={...row,...value}
    return{data:row,error:null}
   }}
  return q
 }}
 return{fake,row:()=>row,filters,break:()=>{fail=true}}
}
const attempt={kind:PREVIEW_KIND,inputHash:PREVIEW_INPUT_HASH,state:'claimed' as const,imageIds:[]}
test('actual store claims by unique script ID and leaves legacy publication fields empty',async()=>{
 const d=db(),s=createProviderPreviewStore(d.fake)
 assert.equal(await s.claim(attempt),true);assert.equal(await s.claim(attempt),false)
 const row=d.row()
 assert.equal(row.id,PREVIEW_ID);assert.equal(row.project_id,PREVIEW_PROJECT_ID)
 assert.equal(row.status,'pending_review');assert.equal(row.video_status,'private_preview')
 assert.equal(row.voice_status,'none');assert.equal(row.raw_output.pilot_image_profile,'the-prompt-illustrated-v2')
 assert.deepEqual(row.images,[]);assert.ok(!row.audio_url&&!row.video_url)
 assert.deepEqual(await s.read(),attempt)
 await s.save(attempt)
 assert.ok(d.filters.some(v=>v[0]==='project_id'&&v[1]===PREVIEW_PROJECT_ID))
 assert.ok(d.filters.some(v=>v[0]==='raw_output->private_provider_preview->>inputHash'&&v[1]===PREVIEW_INPUT_HASH))
})
test('database failure is never read as no attempt and never claims success',async()=>{
 const d=db(),s=createProviderPreviewStore(d.fake);d.break()
 await assert.rejects(s.read());await assert.rejects(s.claim(attempt));await assert.rejects(s.save(attempt))
})
