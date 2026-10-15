import 'server-only'
import {WebsiteBuildError} from '@/lib/website-build/store'
import {studioObject,studioPrincipal,studioKey,studioRpc} from '@/lib/website-build/studio/store'
import type {Db,Principal} from '@/lib/website-build/studio/types'
import type {ChangeLifecycleInput,ProjectLifecycleView} from './types'
export async function readProjectLifecycle(db:Db,p:Principal,projectId:string):Promise<ProjectLifecycleView>{
 studioPrincipal(p,projectId)
 return studioRpc(db,'project_lifecycle_read',p,{projectId})
}
export async function changeProjectLifecycle(db:Db,p:Principal,value:ChangeLifecycleInput):Promise<ProjectLifecycleView>{
 const input=studioObject(value,['projectId','expectedVersion','action','idempotencyKey'])
 studioPrincipal(p,input.projectId as string);studioKey(input.idempotencyKey)
 if(!Number.isSafeInteger(input.expectedVersion)||Number(input.expectedVersion)<0||!['archive','trash','restore'].includes(String(input.action)))throw new WebsiteBuildError('INVALID_LIFECYCLE_INPUT')
 return studioRpc(db,'project_lifecycle_change',p,input)
}
