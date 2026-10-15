import 'server-only'
import {isSpendGateEnforced} from '@/lib/cost/spend-gate-flag'
import {operatorActor,setProjectExecutionStop} from '@/lib/governance/execution-stop'
import {WebsiteBuildError,validateBuildUuid} from '../store'
import {studioObject,studioPrincipal} from './store'
import type {Db,Principal} from './types'

export type StudioCostSnapshot={
 projectId:string;paused:boolean;enforced:boolean;observedAt:string
 monthly:{spentSek:number;heldSek:number;limitSek:number;remainingSek:number}|null
}
async function ownedProject(db:Db,p:Principal,projectId:unknown){
 validateBuildUuid(projectId);studioPrincipal(p,projectId)
 const {data,error}=await db.from('projects').select('id,execution_paused').eq('id',projectId).eq('owner_id',p.userId).maybeSingle()
 if(error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 if(!data)throw new WebsiteBuildError('NOT_FOUND',404)
 if(typeof data.execution_paused!=='boolean')throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 return data
}
export function studioCostProject(params:URLSearchParams):string{
 if([...params.keys()].some(key=>key!=='projectId')||params.getAll('projectId').length!==1)throw new WebsiteBuildError('INVALID_STUDIO_INPUT')
 const id=params.get('projectId');validateBuildUuid(id);return id
}
function amount(value:unknown):number{
 if(typeof value!=='number'&&typeof value!=='string'||value==='')throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 const n=Number(value);if(!Number.isFinite(n))throw new WebsiteBuildError('BUILD_UNAVAILABLE',503);return n
}
export async function readStudioCosts(db:Db,p:Principal,projectId:string):Promise<StudioCostSnapshot>{
 const project=await ownedProject(db,p,projectId)
 // The gate's own calendar window and durable reservations. Filter at the
 // PostgREST boundary and again below; global and other-project totals never leave.
 const {data,error}=await db.rpc('budget_headroom',{p_stale_minutes:30}).eq('project_id',projectId).eq('scope','project_monthly')
 if(error||!Array.isArray(data))throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 const rows=data.filter(row=>row.project_id===projectId&&row.scope==='project_monthly')
 if(rows.length>1)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 const row=rows[0],monthly=row?{spentSek:amount(row.spent_sek),heldSek:amount(row.held_sek),limitSek:amount(row.limit_sek),remainingSek:amount(row.remaining_sek)}:null
 if(monthly&&[monthly.spentSek,monthly.heldSek,monthly.limitSek].some(n=>n<0))throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 return {projectId,paused:project.execution_paused,enforced:isSpendGateEnforced(),observedAt:new Date().toISOString(),monthly}
}
export async function stopStudioProject(db:Db,p:Principal,value:unknown):Promise<{projectId:string;paused:true}>{
 const input=studioObject(value,['projectId']),project=await ownedProject(db,p,input.projectId)
 // This endpoint can only stop ONE owned project. Resume stays in its existing
 // explicit controls; no budget setter, global stop or new run is reachable here.
 const receipt=await setProjectExecutionStop(db,{projectId:project.id,paused:true,actor:operatorActor(p.userId),reason:'Stoppad från byggstudions kostnadskontroll'})
 if(!receipt.newPaused)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 return {projectId:project.id,paused:true}
}
