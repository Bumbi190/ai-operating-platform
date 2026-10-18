import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {boundaryFixture} from './boundary.test-utils'
import {id,sha} from './fixtures.test-utils'
import {renderReceiptSha256} from './contract'
import {testSql,TEST_PRINCIPAL} from '../../website-build/test-db'
import {proposeSocialLaunchPlan,decideSocialLaunchPlan} from '../store'
export const literal=(v:unknown)=>v===null||v===undefined?'null':typeof v==='boolean'||typeof v==='number'?String(v):"'"+(typeof v==='string'?v:JSON.stringify(v)).replaceAll("'","''")+"'"+(typeof v==='object'?'::jsonb':'')
export async function sqlReviewFixture(db:any,ageMs=3600000){
 const f=boundaryFixture(),ids=new Map<number,string>();for(let n=1;n<=40;n++)ids.set(n,n===2?TEST_PRINCIPAL.userId:randomUUID())
 let text=JSON.stringify({tables:f.tables,snapshot:f.snapshot,input:f.input});for(const [n,v] of ids)text=text.replaceAll(id(n),v)
 const {tables,snapshot,input}=JSON.parse(text),principal={userId:TEST_PRINCIPAL.userId,allowedProjectIds:[ids.get(1)!]},now=Date.now()
 const r=snapshot.receipt;r.source.publishedAt=new Date(now-ageMs).toISOString();r.qa.reviewedAt=new Date(now-300000).toISOString();r.usage.forEach((u:any)=>u.reviewedAt=new Date(now-300000).toISOString())
 tables.media_news_items[0].raw_output.source_published_at=r.source.publishedAt
 const videoBytes=Buffer.from(readFileSync(new URL('./silent-review.mp4.base64',import.meta.url),'utf8'),'base64')
 r.video={sha256:sha(videoBytes),byteSize:videoBytes.length};snapshot.video={id:input.videoAssetId,...r.video}
 Object.assign(tables.assets[0],{checksum_sha256:r.video.sha256,byte_size:r.video.byteSize})
 tables.asset_provenance[0].provider_metadata={receipt:r}
 let sql=''
 for(const table of ['projects','media_news_items','media_scripts','assets','cost_events','asset_provenance']){
  for(const row of tables[table]){
   if(table==='projects'){row.name='The Prompt';row.slug='review-'+row.id}
   if(table==='asset_provenance')sql+='set local role service_role;'
   sql+='insert into public.'+table+'('+Object.keys(row).join(',')+') values('+Object.entries(row).map(([k,v])=>k==='reference_asset_ids'?'array['+(v as string[]).map(literal).join(',')+']::uuid[]':literal(v)).join(',')+');'
   if(table==='asset_provenance')sql+='reset role;'
  }
 }
 testSql('begin;'+sql+'commit;')
 const plan=await proposeSocialLaunchPlan(db,principal,{projectId:input.projectId,expectedRevisionId:null,idempotencyKey:randomUUID(),choices:[{channel:'instagram',purpose:'AI news',format:'video',cadence:'daily'},{channel:'facebook',purpose:'AI news',format:'video',cadence:'daily'}]})
 await decideSocialLaunchPlan(db,principal,{projectId:input.projectId,revisionId:plan.currentRevision!.id,sha256:plan.currentRevision!.sha256,decision:'approve',idempotencyKey:randomUUID()})
 snapshot.planRevisionId=plan.currentRevision!.id;snapshot.destinations=[{channel:'facebook',bindingId:null,accountId:null},{channel:'instagram',bindingId:null,accountId:null}];snapshot.receiptSha256=renderReceiptSha256(r)
 const bytes=new Map<string,Uint8Array>([[input.videoAssetId,videoBytes],[r.audio.id,new Uint8Array(200).fill(7)]])
 r.images.forEach((a:any,i:number)=>bytes.set(a.id,Buffer.from('image'+(7+i))))
 db.storage={from:()=>({download:async(path:string)=>{const b=bytes.get(path.split('/').at(-1)!);return {data:b?new Blob([b as BlobPart]):null,error:b?null:{message:'missing'}}}})}
 return {db,principal,input,snapshot,bytes,now}
}
export async function prepareSql(f:Awaited<ReturnType<typeof sqlReviewFixture>>){
 const result=await f.db.rpc('media_news_review_prepare',{p_principal:f.principal,p_input:f.input,p_snapshot:f.snapshot})
 if(result.error)throw Error(result.error.message);return result.data as any[]
}
