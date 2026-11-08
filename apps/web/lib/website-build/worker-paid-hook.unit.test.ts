import {beforeEach,describe,expect,it,vi} from 'vitest'

const provider=vi.hoisted(()=>vi.fn())
const store=vi.hoisted(()=>({
 load:vi.fn(),park:vi.fn(),interpret:vi.fn(),save:vi.fn(),stage:vi.fn(),commit:vi.fn(),
}))
vi.mock('@/lib/ai/runner',()=>({runStep:provider}))
vi.mock('@/lib/ai/atlas-model-policy',()=>({atlasModelPolicy:()=>({profile:'standard',chatModel:'claude-sonnet-4-6',buildModel:null,localAvailable:false})}))
vi.mock('@/lib/governance/run-execution-checkpoint',()=>({
 checkpointClaimedRun:vi.fn(async()=>({allowed:true})),
 settleRefusal:vi.fn(),checkOwnedFinalization:vi.fn(async()=> 'OWNED'),
 RunCheckpointRefusedError:class extends Error{},RunLifecycleWriteError:class extends Error{},
}))
vi.mock('@/lib/skills/compose-agent-skills',()=>({composeAgentDesignSkills:()=>({systemPrompt:'design-taste-frontend'})}))
vi.mock('./planning/design-reference',()=>({assertApprovedWebsiteScope:vi.fn(),approvedWebsitePageKeys:()=>null}))
vi.mock('./model-rasters',()=>({resolveWebsiteModelRasters:(value:unknown)=>value,websiteRasterContext:()=>({referenceDraft:undefined,assets:[],compact:(html:string)=>html,restore:(html:string)=>html})}))
vi.mock('./store',()=>({
 loadBuildSnapshot:store.load,parkBuildSession:store.park,recordBuildInterpretation:store.interpret,
 saveBuildCandidate:store.save,setBuildStage:store.stage,commitBuildRevision:store.commit,
 WebsiteBuildError:class WebsiteBuildError extends Error{code:string;constructor(code:string){super(code);this.code=code}},
}))
vi.mock('./recovery',()=>({recoverWebsiteArtifact:vi.fn()}))
vi.mock('./rejected-draft',()=>({rejectedDraftLog:vi.fn()}))

import {executeWebsiteBuildRun,type WebsiteBuildPaidStep} from './worker'

const projectId='11111111-1111-4111-8111-111111111111'
const sessionId='22222222-2222-4222-8222-222222222222'
const runId='33333333-3333-4333-8333-333333333333'
const claimId='44444444-4444-4444-8444-444444444444'
const agentId='55555555-5555-4555-8555-555555555555'
const run:any={id:runId,project_id:projectId,kind:'website.static.build.v1',claim_id:claimId,input:{projectId,sessionId,generation:1},context:null}
const snapshot:any={agentId,brief:'Premium showroom brief',previousArtifact:null,feedback:[],candidate:null,interpretation:null,controlRequested:null,designReference:null}
const draft={format:'static-website.v1',title:'Svensk hemsida',pages:[{key:'index',title:'Hem',bodyHtml:'<h1>Vår idé</h1>',css:'h1{color:green}',behaviors:[]}]}

function db(){
 const q:any={select:()=>q,eq:()=>q,single:async()=>({data:{id:agentId,name:'Webbbyggare',system_prompt:'base',model:'claude-sonnet-4-6',config:{max_tokens:12000,temperature:.7},skill_ids:[]},error:null})}
 return {from:(table:string)=>{if(table!=='agents')throw Error('unexpected table '+table);return q}} as any
}
beforeEach(()=>{
 vi.clearAllMocks();store.load.mockResolvedValue(snapshot);provider.mockResolvedValue({content:JSON.stringify(draft),tokensIn:1,tokensOut:1,durationMs:1,authorityRefreshRequired:false})
})
describe('website worker attended admission hook',()=>{
 it('refuses before provider and exposes the exact pending request',async()=>{
  const gate=vi.fn(async (_step:WebsiteBuildPaidStep)=>{throw Error('OWNER_ALLOWANCE_EXCEEDED')})
  await expect(executeWebsiteBuildRun(db(),run,claimId,{beforePaidStep:gate} as any)).rejects.toThrow('OWNER_ALLOWANCE_EXCEEDED')
  expect(provider).not.toHaveBeenCalled()
  expect(gate).toHaveBeenCalledTimes(1)
  expect(gate.mock.calls[0][0]).toMatchObject({projectId,sessionId,runId,claimId,operation:'website.artifact.generate',model:'claude-sonnet-4-6',maxTokens:12000,temperature:.7})
  expect(gate.mock.calls[0][0].systemPrompt).toContain('design-taste-frontend')
  expect(gate.mock.calls[0][0].userMessage).toContain('Premium showroom brief')
 })
 it('keeps default production behavior unchanged when no hook is supplied',async()=>{
  await executeWebsiteBuildRun(db(),run,claimId)
  expect(provider).toHaveBeenCalledTimes(1)
  expect(store.commit).toHaveBeenCalledTimes(1)
 })
})
