/**
 * Operator-only, disabled-by-default importer for FOUR SHA-256-pinned MP4s.
 * No cron, Next route or publisher imports this script.
 *
 * Normal execution: DRY-RUN and no network.
 * Real import requires ALL: --apply, --expected-project-id=<UUID>,
 * OMNIRA_THEPROMPT_IMPORT_APPROVED=1, and server-only Supabase credentials.
 *
 * The only write path calls existing canonical admitAssetBytes. No direct
 * storage or assets SQL inserts, no overwrite and no paid generation.
 */
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {
  APPROVED_CLIPS,ApprovedClipRefusal,inspectApprovedClipDirectory,verifyClipBytes,
} from './approved-clips-preflight.mjs'

const EXPECTED_PROJECT_SLUG='ai-media-automation'
const EXPECTED_SUPABASE_HOST='iboepohjwrhtgshrqaol.supabase.co'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MODEL='grok_video_v15_lite'

export class ApprovedImportRefusal extends Error{
  constructor(code){
    super('THEPROMPT_CANONICAL_IMPORT_REFUSED')
    this.name='ApprovedImportRefusal'
    this.code=code
  }
}

/** Pure gate for the returned DB row. An existing row is not sufficient. */
export function existingAssetMatches(clip,row,provenance,projectId){
  return !!row&&row.project_id===projectId&&
    row.kind==='video'&&row.mime_type==='video/mp4'&&row.status==='active'&&
    row.visibility==='internal'&&
    row.storage_bucket==='media-assets-private'&&
    row.storage_path===clip.storagePath+'.mp4'&&
    row.checksum_sha256===clip.sha256&&Number(row.byte_size)===clip.size&&
    row.width===clip.width&&row.height===clip.height&&
    row.duration_ms===clip.durationMs&&
    !!provenance&&provenance.asset_id===row.id&&
    provenance.source==='imported'&&provenance.provider==='higgsfield'&&
    provenance.model===MODEL&&provenance.simulated===false
}

/**
 * Injectable adapter for isolated unit tests. Queries ALL four existing rows
 * before the first mutation, and re-checks bytes before EACH admission.
 * Multi-asset import is intentionally resumable, not falsely 'atomic'.
 */
export async function importApprovedClips({clips,projectId,findExisting,readSource,admit}){
  if(!UUID.test(projectId)||!Array.isArray(clips)||clips.length!==APPROVED_CLIPS.length)
    throw new ApprovedImportRefusal('invalid_plan')
  for(let i=0;i<clips.length;i++){
    const c=clips[i],expected=APPROVED_CLIPS[i]
    if(c?.index!==i||c.name!==expected.name||c.sha256!==expected.sha256||
      c.size!==expected.bytes||c.width!==720||c.height!==1280||
      c.durationMs!==4042||!c.storagePath||typeof c.filepath!=='string')
      throw new ApprovedImportRefusal('invalid_plan')
  }

  // Read all lookup results BEFORE any write. Do not silently resurrect
  // inconsistent or unverifiable records from a previous partial import.
  const plans=[]
  for(const clip of clips){
    let existing
    try{existing=await findExisting(clip)}catch{
      throw new ApprovedImportRefusal('lookup_unavailable')
    }
    if(existing===null){plans.push({clip,existing:null});continue}
    if(!existingAssetMatches(clip,existing.asset,existing.provenance,projectId))
      throw new ApprovedImportRefusal('existing_record_conflict')
    plans.push({clip,existing})
  }

  // All required source bytes are re-read and SHA checked BEFORE the first
  // mutation. A changed fourth clip cannot leave the first three half-imported.
  // Four MP4s together are ~5 MiB, bounded and safe for the workstation.
  const verifiedBytes=new Map()
  for(const {clip,existing} of plans){
    if(existing)continue
    let bytes
    try{bytes=await readSource(clip)}catch{throw new ApprovedImportRefusal('source_unavailable')}
    try{verifyClipBytes(clip.index,bytes)}catch(e){
      if(e instanceof ApprovedClipRefusal)throw new ApprovedImportRefusal('source_changed')
      throw e
    }
    verifiedBytes.set(clip.index,bytes)
  }

  const receipts=[]
  for(const {clip,existing} of plans){
    if(existing){
      receipts.push({name:clip.name,assetId:existing.asset.id,status:'already_imported'})
      continue
    }
    const bytes=verifiedBytes.get(clip.index)
    if(!bytes)throw new ApprovedImportRefusal('source_unavailable')

    let result
    try{
      result=await admit({
        projectId,kind:'video',visibility:'internal',
        mimeType:'video/mp4',bytes,width:clip.width,height:clip.height,
        durationMs:clip.durationMs,
        storage:{path:clip.storagePath},
        provenance:{
          source:'imported',provider:'higgsfield',model:MODEL,
          simulated:false,durationMs:clip.durationMs,
          // Historical source clips were paid for outside this import path.
          // No new charge or fabricated costEventId/providerRequestId.
          providerMetadata:{
            sourceBatch:'theprompt-owner-approved-reel-20261022',
            sourceFilename:clip.name,
            checksumSha256:clip.sha256,
            publicationApproved:false,
          },
        },
      })
    }catch{
      // Canonical admission is responsible for unwinding failed rows/bytes.
      // Never retry automatically: the outcome may be ambiguous.
      throw new ApprovedImportRefusal('admission_failed_review_required')
    }
    if(result?.asset?.projectId!==projectId||
      result.asset.kind!=='video'||
      result.asset.checksumSha256!==clip.sha256||
      result.asset.visibility!=='internal'||
      result.asset.storage?.bucket!=='media-assets-private'||
      result.asset.storage.path!==clip.storagePath+'.mp4'||
      result.provenance?.assetId!==result.asset.id||
      result.provenance.source!=='imported'){
      throw new ApprovedImportRefusal('receipt_mismatch_review_required')
    }
    receipts.push({name:clip.name,assetId:result.asset.id,status:'imported'})
  }
  return receipts
}

function option(name){
  const idx=process.argv.findIndex(v=>v===name||v.startsWith(name+'='))
  if(idx<0)return null
  return process.argv[idx]===name?process.argv[idx+1]??null:process.argv[idx].slice(name.length+1)
}

async function main(){
  if(process.argv.includes('--help')){
    console.log('Usage: node import-approved-clips.mjs --source-dir <path>')
    console.log('Optional: --apply --expected-project-id <The Prompt project UUID>')
    console.log('Apply requires OMNIRA_THEPROMPT_IMPORT_APPROVED=1 and local server-only environment.')
    return
  }
  const dir=option('--source-dir')
  const clips=await inspectApprovedClipDirectory(dir)
  if(!process.argv.includes('--apply')){
    for(const c of clips)console.log(c.name+' VERIFIED '+c.sha256.slice(0,16)+'…')
    console.log('DRY-RUN PASS; NO DATABASE/UPLOAD/GENERATION/PUBLISHING')
    return
  }
  if(process.env.OMNIRA_THEPROMPT_IMPORT_APPROVED!=='1')
    throw new ApprovedImportRefusal('operator_gate_off')
  const projectId=option('--expected-project-id')
  if(!projectId||!UUID.test(projectId))throw new ApprovedImportRefusal('project_identity_missing')
  let url
  try{url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??'')}catch{
    throw new ApprovedImportRefusal('supabase_not_configured')
  }
  if(url.protocol!=='https:'||url.host!==EXPECTED_SUPABASE_HOST||url.pathname!=='/')
    throw new ApprovedImportRefusal('wrong_supabase_target')
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new ApprovedImportRefusal('supabase_not_configured')

  // Modules loaded only after the operator gate. Under the supported app
  // server environment, 'server-only' must resolve to its server condition.
  const [{createAdminClient},{admitAssetBytes}]=await Promise.all([
    import('../../lib/supabase/admin.ts'),
    import('../../lib/media/asset/admission.ts'),
  ])
  const db=createAdminClient()
  const {data:project,error:projectError}=await db.from('projects')
    .select('id,slug').eq('slug',EXPECTED_PROJECT_SLUG).maybeSingle()
  if(projectError||!project||project.id!==projectId||project.slug!==EXPECTED_PROJECT_SLUG)
    throw new ApprovedImportRefusal('project_identity_mismatch')

  const receipts=await importApprovedClips({
    clips,projectId,
    findExisting:async clip=>{
      const {data,error}=await db.from('assets').select('*')
        .eq('project_id',projectId).eq('kind','video')
        .eq('checksum_sha256',clip.sha256).limit(2)
      if(error||!data||data.length>1)throw new ApprovedImportRefusal('lookup_unavailable')
      if(data.length===0)return null
      const {data:prov,error:provError}=await db.from('asset_provenance')
        .select('asset_id,source,provider,model,simulated')
        .eq('asset_id',data[0].id).maybeSingle()
      if(provError||!prov)throw new ApprovedImportRefusal('lookup_unavailable')
      return {asset:data[0],provenance:prov}
    },
    readSource:async clip=>readFile(clip.filepath),
    admit:admitAssetBytes,
  })
  for(const rec of receipts)console.log(rec.name+' '+rec.status+' asset='+rec.assetId)
  console.log('PRIVATE CANONICAL IMPORT VERIFIED. Publishing remains OFF.')
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{
    console.error('NO-GO: '+(e instanceof ApprovedImportRefusal||e instanceof ApprovedClipRefusal
      ?e.code:'unexpected_failure'))
    process.exitCode=1
  })
}
