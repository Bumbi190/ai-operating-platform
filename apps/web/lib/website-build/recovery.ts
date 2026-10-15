import 'server-only'
import {createHash} from 'node:crypto'
import type {createAdminClient} from '@/lib/supabase/admin'
import {compileWebsiteArtifact} from './artifact'
import {WebsiteBuildPermanentError} from './feedback-interpretation'
import {WEBSITE_BUILD_LIMITS,type WriterRef} from './types'

/** Explicit operator-prepared repair. Never invokes a model or relaxes compilation. */
export async function recoverWebsiteArtifact(db:ReturnType<typeof createAdminClient>,writer:WriterRef,value:unknown){
 const invalid=():never=>{throw new WebsiteBuildPermanentError('INVALID_RECOVERY','Det sparade utkastets källa kunde inte verifieras. Inget nytt modellanrop görs.')}
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid()
 const ref=value as Record<string,unknown>
 if(typeof ref.sourceRunId!=='string'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(ref.sourceRunId)||typeof ref.sourceSha256!=='string'||!(/^[a-f0-9]{64}$/).test(ref.sourceSha256))return invalid()
 const {data:source,error}=await db.from('runs').select('id,project_id,kind,input,status').eq('id',ref.sourceRunId).maybeSingle()
 const sourceInput=source?.input as Record<string,unknown>|null
 if(error||!source||source.status!=='failed'||source.kind!=='website.static.build.v1'||source.project_id!==writer.projectId||sourceInput?.projectId!==writer.projectId||sourceInput?.sessionId!==writer.sessionId||sourceInput?.generation!==writer.generation-1)return invalid()
 const {data:logs,error:logError}=await db.from('run_logs').select('content').eq('run_id',source.id).eq('role','system').limit(20)
 if(logError||!logs)return invalid()
 const evidence=logs.some(row=>{
  try{
   const log=JSON.parse(row.content)
   return log.kind==='website.rejected-draft.v1'&&log.runId===source.id&&log.projectId===writer.projectId&&log.sessionId===writer.sessionId&&log.generation===sourceInput.generation&&log.contentRetained===true&&log.sha256===ref.sourceSha256&&typeof log.content==='string'&&Buffer.byteLength(log.content,'utf8')<=WEBSITE_BUILD_LIMITS.artifactBytes&&createHash('sha256').update(log.content,'utf8').digest('hex')===ref.sourceSha256
  }catch{return false}
 })
 if(!evidence||Buffer.byteLength(JSON.stringify(ref.draft)??'','utf8')>WEBSITE_BUILD_LIMITS.artifactBytes)return invalid()
 return compileWebsiteArtifact(ref.draft)
}
