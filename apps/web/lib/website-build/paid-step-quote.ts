import {createHash} from 'node:crypto'
import {ceilToLedgerScale,tokenWindowCeiling,type RateSnapshot} from '@/lib/cost/spend-ceiling'
import type {WebsiteBuildPaidStep} from './worker'

const operations=new Set(['website.artifact.generate','website.feedback.interpret'])
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value),'utf8').digest('hex')
function fail(reason:string):never{throw Error('UNBOUND_WEBSITE_PILOT_QUOTE:'+reason)}

export type WebsitePaidStepQuote={
 model:string;operation:string;maxTokens:number;basis:'token_window';detail:string
 ceilingSek:number;ceilingUsdMicros:number;payloadSha256:string;priceEvidenceSha256:string
}

/** Conservative owner-allowance quote for the exact request the canonical paid path is about to make.
 * It never authorizes dispatch; it only translates the same token-window ceiling into integer micro-USD. */
export function quoteWebsitePaidStep(step:WebsiteBuildPaidStep,rates:RateSnapshot):WebsitePaidStepQuote{
 if(!step||typeof step!=='object'||!operations.has(step.operation))fail('operation')
 if(typeof step.model!=='string'||typeof step.systemPrompt!=='string'||typeof step.userMessage!=='string')fail('payload')
 if(!Number.isInteger(step.maxTokens)||step.maxTokens<=0||!Number.isFinite(step.temperature))fail('request')
 const fx=rates.usd_sek
 if(typeof fx!=='number'||!Number.isFinite(fx)||fx<=0)fail('fx')
 const ceiling=tokenWindowCeiling(step.model,step.maxTokens,rates)
 if(!ceiling.ok||ceiling.basis!=='token_window')fail(ceiling.ok?'basis':ceiling.reason)
 const ceilingSek=ceilToLedgerScale(ceiling.sek)
 if(!Number.isFinite(ceilingSek)||ceilingSek<=0)fail('ceiling')
 const ceilingUsdMicros=Math.ceil((ceilingSek/fx)*1_000_000)
 if(!Number.isSafeInteger(ceilingUsdMicros)||ceilingUsdMicros<=0)fail('usd')
 const payload={
  projectId:step.projectId,sessionId:step.sessionId,runId:step.runId,claimId:step.claimId,generation:step.generation,
  operation:step.operation,model:step.model,maxTokens:step.maxTokens,temperature:step.temperature,
  systemPrompt:step.systemPrompt,userMessage:step.userMessage,
 }
 const priceEvidence={model:step.model,maxTokens:step.maxTokens,basis:ceiling.basis,detail:ceiling.detail,usdSek:fx,ceilingSek}
 return {model:step.model,operation:step.operation,maxTokens:step.maxTokens,basis:'token_window',detail:ceiling.detail,ceilingSek,ceilingUsdMicros,payloadSha256:hash(payload),priceEvidenceSha256:hash(priceEvidence)}
}
