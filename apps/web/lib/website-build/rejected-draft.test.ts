import {it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import {rejectedDraftLog} from './rejected-draft'
import {WEBSITE_BUILD_LIMITS} from './types'
const writer={projectId:'project',sessionId:'session',runId:'run',generation:2,claimId:'PRIVATE_CLAIM'}
it('retains a bounded rejected draft with its provenance and exact digest, excluding the claim credential',()=>{
 const content='{"title":"Å"}'
 const log=JSON.parse(rejectedDraftLog(writer,'gpt-5.4-mini',content,'INVALID_LINK'))
 expect(log).toMatchObject({kind:'website.rejected-draft.v1',projectId:'project',sessionId:'session',runId:'run',generation:2,model:'gpt-5.4-mini',code:'INVALID_LINK',contentRetained:true,content,bytes:Buffer.byteLength(content,'utf8'),sha256:createHash('sha256').update(content,'utf8').digest('hex')})
 expect(JSON.stringify(log)).not.toContain('PRIVATE_CLAIM')
})
it('uses UTF8 byte bounds and metadata only for an oversized rejected result',()=>{
 const content='Å'.repeat(WEBSITE_BUILD_LIMITS.artifactBytes/2+1)
 const log=JSON.parse(rejectedDraftLog(writer,'gpt-5.4-mini',content,'ARTIFACT_TOO_LARGE'))
 expect(log.contentRetained).toBe(false);expect(log.content).toBeUndefined()
 expect(log.bytes).toBe(Buffer.byteLength(content,'utf8'))
 expect(JSON.stringify(log).length).toBeLessThan(1000)
})
