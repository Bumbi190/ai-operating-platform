import {createHash} from 'node:crypto'
import {WEBSITE_BUILD_LIMITS,type WriterRef} from './types'

/** Private, inert failure evidence. Never a candidate or a preview, and never a claim credential. */
export function rejectedDraftLog(writer:WriterRef,model:string,content:string,code:string):string {
 const bytes=Buffer.byteLength(content,'utf8')
 const contentRetained=bytes<=WEBSITE_BUILD_LIMITS.artifactBytes
 return JSON.stringify({
  kind:'website.rejected-draft.v1',projectId:writer.projectId,sessionId:writer.sessionId,
  runId:writer.runId,generation:writer.generation,model,code,bytes,
  sha256:createHash('sha256').update(content,'utf8').digest('hex'),contentRetained,
  ...(contentRetained?{content}:{}),
 })
}
