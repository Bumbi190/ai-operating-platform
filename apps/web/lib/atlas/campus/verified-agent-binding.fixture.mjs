/**
 * CPU-only VM harness: load real TypeScript binding with a mocked resolver
 * for its sanctioned, approved voice identity dependency. Never contacts DB.
 */
import {readFileSync} from 'node:fs'
import {createContext,SourceTextModule,SyntheticModule} from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'
import {PLING_APPROVED_VOICE} from './voice-identity.ts'

const code=readFileSync(new URL('./verified-agent-binding.ts',import.meta.url),'utf8')
const ctx=createContext({Date,Object,Number,RegExp,String,Set})
const approved=new SyntheticModule(['PLING_APPROVED_VOICE'],function(){
  this.setExport('PLING_APPROVED_VOICE',PLING_APPROVED_VOICE)
},{context:ctx,identifier:'./voice-identity'})
const serverOnly=new SyntheticModule([],function(){},{context:ctx,identifier:'server-only'})
const ts=new SourceTextModule(stripTypeScriptTypes(code),{
  context:ctx,identifier:'verified-agent-binding.ts'
})
await ts.link((specifier)=>{
  if(specifier==='server-only')return serverOnly
  if(specifier==='./voice-identity')return approved
  throw new Error('Unexpected verified-agent-binding dependency '+specifier)
})
await ts.evaluate()
export const resolveVerifiedAgentBinding=ts.namespace.resolveVerifiedAgentBinding
export const AGENT_BINDING_SOURCE=ts.namespace.AGENT_BINDING_SOURCE
