import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import * as core from '../../web/lib/media/provider-preview'
import * as store from '../../web/lib/media/provider-preview-store'
import * as voiceReceipt from '../../web/lib/media/pilot-voice-receipt'
import {planIllustratedNewsShots} from '../../web/lib/media/illustrated-news-shots'
const require=createRequire(import.meta.url),ts=require('typescript') as typeof import('typescript')
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex')
// PostgreSQL jsonb preserves array order but not object property insertion order.
function jsonbRoundtrip(value:any):any{
 if(Array.isArray(value))return value.map(jsonbRoundtrip)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value)
  .sort(([a],[b])=>a.length-b.length||a.localeCompare(b)).map(([key,v])=>[key,jsonbRoundtrip(v)]))
 return value
}
test('real runtime uses governed generators, internal admission and verified signed delivery; reload never regenerates',async(t)=>{
 const old={...process.env},oldNow=Date.now,oldFetch=globalThis.fetch
 process.env.VERCEL_ENV='preview';process.env.H1_SPEND_GATE='1'
 for(const k of ['ANTHROPIC_API_KEY','IDEOGRAM_API_KEY','ELEVENLABS_API_KEY'])process.env[k]='unit-only'
 Date.now=()=>Date.parse('2026-10-18T06:00:00Z')
 try{
  let row:any=null,generated=0,voiced=0,foreign=false,badAudioHash=false,ledgerMode='ok'
  const admissions:any[]=[],assets=new Map<string,any>()
  const eventIds=[1,2,3,4].map(i=>'22222222-2222-4222-a222-'+String(i).padStart(12,'0'))
  const reservationIds=[1,2,3,4].map(i=>'33333333-3333-4333-a333-'+String(i).padStart(12,'0'))
  const db={from:(table:string)=>{
   let mode='',value:any;const filters:Record<string,unknown>={}
   const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q},
    insert:(v:any)=>{assert.equal(table,'media_scripts');mode='insert';value=v;return q},
    update:(v:any)=>{assert.equal(table,'media_scripts');mode='update';value=v;return q},
    maybeSingle:async()=>{
     if(table==='media_scripts'){
      if(mode==='insert'){if(row)return{data:null,error:{code:'23505'}};row=value}
      if(mode==='update')row={...row,...value}
      return{data:jsonbRoundtrip(row),error:null}
     }
     assert.ok(['spend_reservations','cost_events'].includes(table))
     const index=table==='spend_reservations'
      ?['canonical-image-key-0','canonical-image-key-1','canonical-image-key-2','canonical-voice-key'].indexOf(String(filters.idempotency_key))
      :reservationIds.indexOf(String(filters.reservation_id))
     assert.notEqual(index,-1,'query must name this exact provider flight, never a latest/timestamp guess')
     const voice=index===3,provider=voice?'elevenlabs':'ideogram',operation=voice?'generateVoiceover':'Scene Image'
     const target=ledgerMode.startsWith('voice_')?3:0,bad=index===target
     if(bad&&ledgerMode==='read_failed')return{data:null,error:{code:'XX000'}}
     if(bad&&((table==='spend_reservations'&&ledgerMode==='missing_reservation')||
        (table==='cost_events'&&ledgerMode==='missing_event')))return{data:null,error:null}
     if(table==='spend_reservations'){
      const r={id:reservationIds[index],project_id:core.PREVIEW_PROJECT_ID,provider,operation,
       idempotency_key:filters.idempotency_key,status:'settled',settlement_kind:'metered',ceiling_exceeded:false,
       dispatched_at:'2026-10-18T06:00:00Z'}
      if(bad){if(ledgerMode==='unsettled')r.status='open'
       if(ledgerMode==='reservation_foreign')r.project_id='foreign'
       if(ledgerMode==='wrong_key')r.idempotency_key='other-key'
       if(ledgerMode==='undispatched')r.dispatched_at=null as any
       if(ledgerMode==='reservation_provider')r.provider='openai'
       if(ledgerMode==='reservation_operation')r.operation='different'
       if(ledgerMode==='exceeded')r.ceiling_exceeded=true
       if(ledgerMode==='reservation_ambiguous')r.settlement_kind='estimate_ambiguous'}
      return{data:r,error:null}
     }
     if(bad&&ledgerMode==='duplicate_event')return{data:null,error:{code:'PGRST116'}}
     const c={id:eventIds[index],reservation_id:reservationIds[index],project_id:core.PREVIEW_PROJECT_ID,provider,
      operation:voice?'Generate Voiceover':'Scene Image',model:voice?'tts':'ideogram-v3',
      unit_type:voice?'characters':'images',units:voice?String(core.PREVIEW_CANDIDATE.script.length)+'.00':'1.00',
      settlement_kind:'metered',cost_sek:'0.8400',metadata:voice?{voice:'victoria',model:'eleven_turbo_v2_5'}:{}}
     if(bad){if(ledgerMode==='event_foreign')c.project_id='foreign'
      if(ledgerMode==='wrong_reservation')c.reservation_id=reservationIds[1]
      if(ledgerMode==='event_provider')c.provider='openai'
      if(ledgerMode==='event_operation')c.operation='different'
      if(ledgerMode==='event_model')c.model='different'
      if(ledgerMode==='invalid_event_id')c.id='not-an-id'
      if(ledgerMode==='event_ambiguous')c.settlement_kind='estimate_ambiguous'
      if(ledgerMode==='wrong_units'||ledgerMode==='voice_wrong_units')c.units='2.00'
      if(ledgerMode==='wrong_unit_type')c.unit_type='requests'
      if(ledgerMode==='invalid_cost')c.cost_sek='NaN'
      if(ledgerMode==='voice_metadata')c.metadata={voice:'other',model:'other'}}
     return{data:c,error:null}
    }}
   return q
  }}
  const audio=Buffer.alloc(300,1)
  const voice={audioBuffer:audio,words:Array.from({length:20},(_,i)=>({word:'word',startMs:i*1000,endMs:i*1000+800})),durationMs:21000}
  const admit=async(input:any)=>{
   admissions.push(input)
   assert.equal(input.projectId,core.PREVIEW_PROJECT_ID);assert.equal(input.visibility,'internal')
   const id='11111111-1111-4111-a111-'+String(admissions.length).padStart(12,'0')
   const a={id,projectId:input.projectId,kind:input.kind,visibility:'internal',status:'active',
    storage:{bucket:'media-assets-private',path:input.storage.path},checksumSha256:input.kind==='audio'?sha(audio):'a'.repeat(64),
    mimeType:input.kind==='audio'?'audio/mpeg':'image/jpeg',byteSize:300}
   assets.set(id,a);return{asset:a}
  }
  globalThis.fetch=async(input:any)=>{assert.equal(String(input),core.PREVIEW_CANDIDATE.sourceUrl)
   return new Response('<html>'+core.PREVIEW_CANDIDATE.publishedAt+'</html>',{headers:{'content-type':'text/html'}})}
  const deps:Record<string,any>={
   'server-only':{},'node:crypto':{createHash},
   '@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/cost/rates':{getRates:async()=>({})},
   '@/lib/cost/spend-identity':{spendIdempotencyKey:(i:any)=>{
    assert.deepEqual(i.project,{projectId:core.PREVIEW_PROJECT_ID})
    if(i.provider==='elevenlabs'){assert.equal(i.operation,'generateVoiceover');assert.equal(i.subject,core.PREVIEW_ID);return 'canonical-voice-key'}
    assert.equal(i.provider,'ideogram');assert.equal(i.operation,'Scene Image')
    const index=[core.PREVIEW_ID+'#0',core.PREVIEW_ID+'#1',core.PREVIEW_ID+'#2'].indexOf(i.subject)
    assert.notEqual(index,-1);return 'canonical-image-key-'+index
   }},
   '@/lib/cost/budget-gate':{estimateImageSek:async(n:number)=>{assert.equal(n,3);return 2.52},estimateVoiceSek:async()=>1.2},
   '@/lib/ai/anthropic':{estimateAnthropicSek:async()=>1.75},'@/lib/ai/openai-client':{estimateOpenAIChatSek:async()=>3.23},
   '@/lib/governance/execution-stop':{projectScope:(p:any)=>p},
   '@/lib/governance/execution-dispatch':{assertExecutionDispatchAllowed:async(e:any)=>assert.equal(e.context,'OPERATOR_EXECUTION')},
   './ideogram':{generateNewsImages:async(...a:any[])=>{generated++;assert.equal(row?.id,core.PREVIEW_ID);assert.equal(row?.raw_output?.private_provider_preview?.state,'claimed');assert.equal(a[2],3);assert.equal(a[3].scope.projectId,core.PREVIEW_PROJECT_ID)
    assert.deepEqual(a[4],{projectId:core.PREVIEW_PROJECT_ID});assert.equal(a[5],core.PREVIEW_ID);assert.equal(a[6],'the-prompt-illustrated-v2');return['https://provider.invalid/0','https://provider.invalid/1','https://provider.invalid/2']}},
   './elevenlabs':{generateVoiceover:async(...a:any[])=>{voiced++;assert.equal(row?.id,core.PREVIEW_ID);assert.equal(row?.raw_output?.private_provider_preview?.state,'claimed');assert.equal(row?.raw_output?.private_provider_preview?.imageIds.length,3);assert.equal(a[2],'victoria');assert.equal(a[1].scope.projectId,core.PREVIEW_PROJECT_ID);assert.deepEqual(a[3],{projectId:core.PREVIEW_PROJECT_ID});assert.equal(a[4],'canonical-voice-key');return voice}},
   './asset/admission':{admitAssetFromUrl:admit,admitAssetBytes:admit},
   './asset/store':{getAsset:async(id:string)=>{const a=assets.get(id);return {...a,
    projectId:foreign?'foreign':a.projectId,checksumSha256:badAudioHash&&a.kind==='audio'?'bad':a.checksumSha256}},
    signedAssetUrl:async(s:any,ttl:number)=>{assert.equal(s.bucket,'media-assets-private');assert.ok(ttl<=1800);return'https://private.invalid/'+s.path}},
   './asset/types':{asAssetId:(s:string)=>s},'./pilot-voice-receipt':voiceReceipt,'./provider-preview-store':store,'./provider-preview':core,
   './illustrated-news-shots':{planIllustratedNewsShots},'./illustrated-news-profile':{ILLUSTRATED_NEWS_PROFILE:'the-prompt-illustrated-v2'},
  }
  const source=readFileSync(new URL('../../web/lib/media/provider-preview-runtime.ts',import.meta.url),'utf8')
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText,m={exports:{} as any}
  new Function('require','module','exports',js)((id:string)=>{if(!(id in deps))throw Error('Unapproved dependency '+id);return deps[id]},m,m.exports)
  const s=m.exports.createRuntimeProviderPreview({ok:true,userId:'owner',allowedProjectIds:[core.PREVIEW_PROJECT_ID]})
  const q=await s.inspect();assert.equal(generated,0);assert.equal(voiced,0)
  const result=await s.generate({quoteHash:q.quoteHash,maximumSek:12})
  assert.equal(result.status,'ready');assert.equal(admissions.length,4)
  await t.test('every admitted byte set carries its exact settled cost event',()=>assert.deepEqual(admissions.map(a=>a.provenance.costEventId),eventIds))
  assert.equal(result.media.props.images.length,3);assert.equal(result.media.releaseApproved,false)
  assert.ok(result.media.props.illustratedShots.length>=3);assert.equal(row.voice_status,'none');assert.equal(row.video_status,'private_preview')
  // Existing private galleries remain readable without rewriting old provenance.
  ledgerMode='read_failed'
  assert.equal((await s.inspect()).status,'ready');assert.equal(generated,1);assert.equal(voiced,1)
  ledgerMode='ok'
  foreign=true;await assert.rejects(s.inspect(),/PREVIEW_ASSET_NOT_VERIFIED/)
  foreign=false;badAudioHash=true;await assert.rejects(s.inspect(),/PREVIEW_VOICE_NOT_VERIFIED/)
  badAudioHash=false
  row.raw_output.private_provider_preview.words[0].endMs+=1
  await assert.rejects(s.inspect(),/PREVIEW_VOICE_NOT_VERIFIED/)
  assert.equal(generated,1);assert.equal(voiced,1)
  for(const failure of ['missing_reservation','missing_event','unsettled','undispatched','exceeded',
   'reservation_foreign','reservation_provider','reservation_operation','reservation_ambiguous','wrong_key',
   'event_foreign','wrong_reservation','event_provider','event_operation','event_model','event_ambiguous',
   'invalid_event_id','wrong_units','wrong_unit_type','invalid_cost','duplicate_event','read_failed',
   'voice_metadata','voice_wrong_units']){
   await t.test('missing or mismatched cost evidence refuses admission and never regenerates: '+failure,async()=>{
    ledgerMode=failure;row=null;generated=0;voiced=0;admissions.length=0;assets.clear()
    const fresh=m.exports.createRuntimeProviderPreview({ok:true,userId:'owner',allowedProjectIds:[core.PREVIEW_PROJECT_ID]})
    const q=await fresh.inspect()
    const failed=await fresh.generate({quoteHash:q.quoteHash,maximumSek:12})
    assert.equal(failed.status,'review_required')
    assert.equal(admissions.length,failure.startsWith('voice_')?3:0)
    assert.equal((await fresh.generate({quoteHash:q.quoteHash,maximumSek:12})).status,'review_required')
    assert.equal(generated,1);assert.equal(voiced,failure.startsWith('voice_')?1:0)
   })
  }
 }finally{Date.now=oldNow;globalThis.fetch=oldFetch
  for(const k of ['VERCEL_ENV','H1_SPEND_GATE','ANTHROPIC_API_KEY','IDEOGRAM_API_KEY','ELEVENLABS_API_KEY']){
   if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]
  }}
})
