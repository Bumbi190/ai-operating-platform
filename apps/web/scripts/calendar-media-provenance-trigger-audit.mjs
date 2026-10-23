import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

// Test-only inventory. Bound to media-news admission/provenance evidence,
// not proof of any Facebook/Instagram publish receipt.
const expected=[
 ['asset_provenance','asset_provenance_no_delete','asset_provenance_reject_orphan_delete()',11],
 ['asset_provenance','asset_provenance_no_update','asset_reject_mutation()',19],
 ['asset_provenance','media_news_review_reserved_provenance','media_news_review_guard_provenance()',7],
 ['media_news_review_evidence','media_news_review_insert_guard','media_news_review_guard_evidence()',7],
 ['media_news_review_evidence','media_news_review_no_mutation','media_news_review_reject_mutation()',27],
 ['media_news_review_evidence','media_news_review_no_truncate','media_news_review_reject_mutation()',34],
]
const required={
 asset_provenance_reject_orphan_delete:['public.assets','append-only'],
 asset_reject_mutation:['append-only','tg_op'],
 media_news_review_guard_provenance:['the-prompt-review-admission-v1','service_role','REVIEW_ADMISSION_SERVER_ONLY'],
 media_news_review_guard_evidence:['social_content_decisions','social_content_revisions',
  'media_news_canonical_json','media_news_snapshot_requirements','SOCIAL_CONTENT_REVIEW_REQUIRED'],
 media_news_review_reject_mutation:['append-only'],
}
const sha=x=>createHash('sha256').update(x).digest('hex')
export const mediaProvenancePins={functions:{
 'asset_provenance_reject_orphan_delete()':'100e1f94be556711adf72374462832490c922d59b296fb6e784620abbe36732e',
 'asset_reject_mutation()':'99ce89da886e344f1a068f8ebe24aad6add29d4a1e72b36efece1baa41d204ce',
 'media_news_review_guard_provenance()':'178232653f5fb9011701c3062a6becef533e46a6b7e737a2f4ee52877ec278d6',
 'media_news_review_guard_evidence()':'81fc5e3a5068de01d170ae3b86ab4b510cd4d6780bc54f811e0a076d4373528a',
 'media_news_review_reject_mutation()':'2f3392246817273a2d7c8e3579c3c3479f476eb5e830b491505d2935533a773d',
},triggers:{
 'media_news_review_evidence.media_news_review_no_truncate':'e45f838feaf28dbc4b93292723c4cab8ba03d4bc2a0d2726cbe9d383415b1383',
 'media_news_review_evidence.media_news_review_no_mutation':'0aa0c99938648b173176b32da313a18953f059fec70bbcaf7ebe9b90143c8292',
 'media_news_review_evidence.media_news_review_insert_guard':'00146bf600c0256ab0d8c7269d776cc5cd1fa008bb85c7a3f080d5a08cb963a1',
 'asset_provenance.media_news_review_reserved_provenance':'558ab5c62edbbdcece2645dc8de1cc0a7fbf56e81dbc11bd4855b6a85edbf9ee',
 'asset_provenance.asset_provenance_no_update':'2b1de234f80b11ab6a54850df7a6bfd9db8f994e6e4db595bf95e88d9f5f8972',
 'asset_provenance.asset_provenance_no_delete':'c288aafc149ef796e3a38604771e3edbbf2a0808a1a2a022b0e8006041f384f0',},acl:{}}
export function auditMediaProvenanceTriggers(catalog,{pins=mediaProvenancePins,enforce=false}={}){
 assert.ok(catalog&&Array.isArray(catalog.triggers),'missing test-only trigger catalog')
 assert.deepEqual(catalog.triggers.map(x=>[x.table,x.trigger,x.callback,x.eventBits]).sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1])),
  expected,'media provenance trigger topology changed')
 const fns=new Map()
 const trigs=[]
 for(const row of catalog.triggers){
  const id=row.table+'.'+row.trigger
  assert.equal(row.enabled,'O','disabled media protection trigger: '+id)
  assert.equal(row.owner,'supabase_admin','media trigger function owner changed')
  assert.equal(row.definer,false,'media trigger escalated to SECURITY DEFINER')
  assert.equal(row.language,'plpgsql','media trigger language changed')
  assert.deepEqual(row.config,
   row.callback==='asset_provenance_reject_orphan_delete()'||row.callback==='asset_reject_mutation()'?[]:['search_path=""'],
   'media trigger search_path changed')
  const older=row.callback==='asset_provenance_reject_orphan_delete()'||row.callback==='asset_reject_mutation()'
  if(!older){
   assert.equal(row.publicExecute,false,'news-specific media guard exposed to PUBLIC')
   for(const role of ['anon','authenticated','social_schedule_rpc_only_fixture'])
    assert.equal(row.grants[role],false,'news-specific media guard callable by '+role)
  }
  if(enforce&&!older)assert.deepEqual({publicExecute:row.publicExecute,grants:row.grants},
   {publicExecute:false,grants:{anon:false,authenticated:false,social_schedule_rpc_only_fixture:false}},
   'news-specific media guard grant changed: '+id)
  for(const token of required[row.callback.split('(')[0]]||[])
   assert.ok(row.body.includes(token),'critical media-evidence condition removed: '+token)
  const prev=fns.get(row.callback)
  const digest=sha(row.body)
  if(prev)assert.equal(prev.hash,digest,'same guard function reported inconsistent source')
  else fns.set(row.callback,{hash:digest,source:row.body})
  if(enforce)assert.equal(pins.triggers[id],sha(row.definition),'media trigger definition changed')
  trigs.push({id,hash:sha(row.definition),callback:row.callback})
 }
 assert.equal(fns.size,5)
 const functions=[...fns].map(([signature,v])=>({signature,sha256:v.hash}))
 for(const f of functions){
  if(enforce)assert.equal(pins.functions[f.signature],f.sha256,
   'media provenance guard body changed: '+f.signature)
 }
 return {triggers:trigs,functions}
}
export function mediaProvenanceCatalogSql(){
 const rels=["'asset_provenance'","'media_news_review_evidence'"].join(',')
 return `SELECT jsonb_build_object('triggers',coalesce(jsonb_agg(jsonb_build_object(
 'table',c.relname,'trigger',t.tgname,'callback',p.oid::regprocedure::text,
 'eventBits',t.tgtype,'enabled',t.tgenabled,'owner',pg_get_userbyid(p.proowner),
 'definer',p.prosecdef,'language',l.lanname,
 'config',coalesce(to_jsonb(p.proconfig),'[]'::jsonb),
 'body',pg_get_functiondef(p.oid),'definition',pg_get_triggerdef(t.oid,true),
 'publicExecute',coalesce((select bool_or(x.grantee=0 AND x.privilege_type='EXECUTE')
  from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x),false),
 'grants',jsonb_build_object('anon',has_function_privilege('anon',p.oid,'EXECUTE'),
  'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
  'social_schedule_rpc_only_fixture',has_function_privilege('social_schedule_rpc_only_fixture',p.oid,'EXECUTE'))
 ) ORDER BY c.relname,t.tgname),'[]'::jsonb))
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_language l ON l.oid=p.prolang
 WHERE n.nspname='public' AND c.relname IN (${rels}) AND NOT t.tgisinternal`
}
