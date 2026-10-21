import 'server-only'
import {WebsiteBuildError,validateBuildUuid} from '../store'
import {studioObject,studioPrincipal,studioKey,studioRpc} from './store'
import type {Db,Principal} from './types'
export type StudioBudgetInput={projectId:string;monthlySek:number;expectedMonthlySek:number|null;idempotencyKey:string}
function amount(value:unknown):value is number{return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1_000_000&&Number(value.toFixed(2))===value}
export async function setStudioProjectBudget(db:Db,p:Principal,value:StudioBudgetInput):Promise<{projectId:string;monthlySek:number}>{
 const input=studioObject(value,['projectId','monthlySek','expectedMonthlySek','idempotencyKey'])
 validateBuildUuid(input.projectId);studioPrincipal(p,input.projectId);studioKey(input.idempotencyKey)
 if(!amount(input.monthlySek)||input.expectedMonthlySek!==null&&!amount(input.expectedMonthlySek))throw new WebsiteBuildError('INVALID_BUDGET')
 return studioRpc(db,'website_build_studio_budget_set',p,input)
}
