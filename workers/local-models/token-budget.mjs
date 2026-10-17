import {createHash} from 'node:crypto';
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
/** Evidence is operator-qualified, bound to actual artifacts, never inferred from a job. */
export function provePromptBudget({task,renderedPrompt,schemaJson,tokenizerEvidence:e}={}){
 const refused=reason=>({status:'refused',reason});
 if(!task||!['classify','extract','summarize'].includes(task.kind)||typeof task.text!=='string'||typeof renderedPrompt!=='string'||typeof schemaJson!=='string'||!e||e.version!==1||e.tokenizer!=='gpt2-byte-bpe'||e.byteCoverageVerified!==true||!hash(e.byteCoverageSha256)||e.rawGenerationVerified!==true||!hash(e.rawGenerationEvidenceSha256)||!/^sha256:[a-f0-9]{64}$/.test(e.modelDigest??'')||typeof e.serverVersion!=='string'||!e.serverVersion||!Number.isInteger(e.bosTokenUpperBound)||e.bosTokenUpperBound<0||e.bosTokenUpperBound>32)return refused('TOKEN_BUDGET_UNVERIFIED');
 // GPT-2 byte BPE with verified coverage has <= one token per original UTF-8 byte.
 // Schema is included in the raw prompt AND conservatively charged again.
 const promptUpperBound=Buffer.byteLength(renderedPrompt,'utf8')+Buffer.byteLength(schemaJson,'utf8')+e.bosTokenUpperBound;
 if(promptUpperBound+384>4096)return refused('INPUT_TOO_LARGE');
 const evidenceHash=createHash('sha256').update(JSON.stringify([e.version,e.modelDigest,e.serverVersion,e.tokenizer,e.byteCoverageSha256,e.bosTokenUpperBound,e.rawGenerationEvidenceSha256,renderedPrompt,schemaJson])).digest('hex');
 return {status:'verified',promptUpperBound,reserve:384,context:4096,evidenceHash};
}
