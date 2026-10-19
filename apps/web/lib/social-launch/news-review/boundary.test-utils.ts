import {reviewFixture,id,sha} from './fixtures.test-utils'
export function boundaryFixture(){
 const snapshot=reviewFixture();snapshot.provenanceId=snapshot.video.id;snapshot.receipt.assetProvenanceIds=[...snapshot.receipt.images.map(a=>a.id),snapshot.receipt.audio.id]
 snapshot.receipt.costEventIds=[id(30),id(31)]
 const r=snapshot.receipt,videoBytes=Buffer.from('test video bytes');r.video.byteSize=videoBytes.length;snapshot.video.byteSize=videoBytes.length
 const bytes=new Map<string,Uint8Array>([[r.audio.id,new Uint8Array(200).fill(7)],[snapshot.video.id,videoBytes]])
 for(const [i,a] of r.images.entries()){const b=Buffer.from('image'+(7+i));a.byteSize=b.length;bytes.set(a.id,b)}
 const assets=[{...snapshot.video,kind:'video',mime_type:'video/mp4'},...r.images.map(a=>({...a,kind:'image',mime_type:'image/png'})),{...r.audio,kind:'audio',mime_type:'audio/mpeg'}].map(a=>({id:a.id,project_id:id(1),kind:a.kind,mime_type:a.mime_type,byte_size:a.byteSize,checksum_sha256:a.sha256,width:720,height:1280,duration_ms:a.kind==='video'?11000:8000,visibility:'internal',status:'active',storage_bucket:'media-assets-private',storage_path:'test/'+a.id}))
 const tables:Record<string,any[]>={
 projects:[{id:id(1),owner_id:id(2),execution_paused:false}],
 media_scripts:[{id:id(3),project_id:id(1),news_item_id:id(4),script:r.transcript,hook:'AI agents',captions:[r.transcript],hashtags:[],cta:null,status:'pending_review',voice_status:'ready',duration_ms:8000,video_status:'none',raw_output:{pilot_voice_receipt:r.voiceReceipt}}],
 media_news_items:[{id:id(4),project_id:id(1),url:r.source.url,title:'Anthropic launches AI agents',summary:'A new AI agent',raw_output:{source_key:r.source.key,source_published_at:r.source.publishedAt}}],
 assets,asset_provenance:[
 {asset_id:snapshot.video.id,source:'derived',adapter_version:'the-prompt-review-admission-v1',simulated:false,provider_metadata:{receipt:r},reference_asset_ids:r.assetProvenanceIds},
 ...r.assetProvenanceIds.map(a=>({asset_id:a,source:'generated',provider:a===r.audio.id?'elevenlabs':'ideogram',model:a===r.audio.id?'eleven_turbo_v2_5':'ideogram-v3',adapter_version:'test-source-v1',simulated:false,cost_event_id:a===r.audio.id?id(31):id(30),provider_metadata:{}}))],
 cost_events:[{id:id(30),project_id:id(1),provider:'ideogram',cost_sek:1},{id:id(31),project_id:id(1),provider:'elevenlabs',cost_sek:1}],
 social_account_bindings:[]}
 let plan:any={project:{id:id(1),name:'The Prompt',slug:'ai-media-automation'},currentRevision:{id:id(20),sha256:'c'.repeat(64),sequence:1,choices:[{channel:'instagram',format:'video',purpose:'News',cadence:'daily'},{channel:'facebook',format:'text',purpose:'News',cadence:'daily'}]},decision:{decision:'approve',revisionId:id(20),sha256:'c'.repeat(64)}}
 const effects={writes:0,signs:0,reads:0};let failure=false,stopped=false
 const db:any={
 from(table:string){let filter:(row:any)=>boolean=()=>true;const q:any={select(){return q},eq(k:string,v:any){const old=filter;filter=row=>old(row)&&row[k]===v;return q},is(k:string,v:any){return q.eq(k,v)},then(resolve:any){resolve(failure?{data:null,error:{message:'offline'}}:{data:(tables[table]??[]).filter(filter),error:null})},insert(){effects.writes++;throw Error('Unexpected write')},update(){effects.writes++;throw Error('Unexpected write')}};return q},
 rpc:async(name:string)=>failure?{data:null,error:{message:'offline'}}:name==='social_content_active'?{data:null,error:stopped?{message:'SOCIAL_CONTENT_STOPPED'}:null}:{data:plan,error:null},
 storage:{from:(_bucket:string)=>({download:async(path:string)=>{effects.reads++;const b=bytes.get(path.split('/').at(-1)!);return {data:b?new Blob([b as BlobPart]):null,error:b?null:{message:'missing'}}},createSignedUrl(){effects.signs++;throw Error('Unexpected signing')}})}}
 return {db,tables,bytes,snapshot,principal:{userId:id(2),allowedProjectIds:[id(1)]},input:{projectId:id(1),scriptId:id(3),videoAssetId:id(5),idempotencyKey:'same-1'},effects,setPlan:(v:any)=>{plan=v},getPlan:()=>plan,setFailure:()=>{failure=true},setStopped:()=>{stopped=true},now:Date.parse('2026-10-18T08:00:00Z')}
}
