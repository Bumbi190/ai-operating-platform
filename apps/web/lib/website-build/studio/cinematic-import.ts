import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {BuildPrincipal} from '../types'
import type {SavePlanInput} from '../planning/types'
import {saveWebsitePlanRevision} from '../planning/store'
import {WebsiteBuildError,validateBuildUuid} from '../store'
import {CINEMATIC_BINDING,parseCinematicBinding} from './cinematic-binding'
import {cinematicPlanProposal} from './cinematic-package'
export {CINEMATIC_BINDING}
export type CinematicImportInput=Omit<SavePlanInput,'content'>&{expectedPackageSha:string}
export async function importCinematicPlan(db:ReturnType<typeof createAdminClient>,principal:BuildPrincipal,input:CinematicImportInput){
 validateBuildUuid(input.projectId)
 if(!principal.allowedProjectIds.includes(input.projectId))throw new WebsiteBuildError('NOT_FOUND',404)
 let binding
 try{binding=parseCinematicBinding({id:CINEMATIC_BINDING.id,sha256:input.expectedPackageSha})}catch{throw new WebsiteBuildError('CINEMATIC_BINDING_STALE',409)}
 const {expectedPackageSha,...save}=input
 return saveWebsitePlanRevision(db,principal,{...save,content:cinematicPlanProposal(binding)})
}
