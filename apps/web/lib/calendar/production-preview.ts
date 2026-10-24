import 'server-only';
import {CalendarError,type AdminDb,type CalendarActor} from './types';
import {calendarId} from './validate';
import type {CalendarProductionPreview,ProductionRequirement} from './production-preview-types';
import {findVendoredDefinition} from '../workflows/definitions';
import {composeMonthlyBrief} from '../workflows/brief/compose';
import {readStoryRequirements} from '../workflows/story/requirements';
import {listEvidence} from '../workflows/store';
import {findAdapter} from '../workflows/adapters/registry';
import {summarizeStateEvidence} from '../workflows/evidence-consumption';
import {evidenceTargetHashFor} from '../workflows/evidence-binding';

const LABELS:Record<string,string>={story_generated:'Sagan skapad',story_structurally_valid:'Sagans struktur kontrollerad',story_page_count:'Sidantal i färdigt material granskat'};
/** Informational projection only: no target creation, grant, run or dispatch. */
export async function readCalendarProductionPreview(db:AdminDb,actor:CalendarActor,input:{projectId:string;instanceId:string}):Promise<CalendarProductionPreview>{
 calendarId(input.projectId);calendarId(input.instanceId);
 if(actor.projectScopeAvailable===false)throw new CalendarError('UNAVAILABLE');
 if(!actor.allowedProjectIds.includes(input.projectId))throw new CalendarError('NOT_FOUND');
 const project=await db.from('projects').select('id, execution_paused').eq('id',input.projectId).eq('owner_id',actor.userId).maybeSingle();
 if(project.error)throw new CalendarError('UNAVAILABLE');
 if(!project.data)throw new CalendarError('NOT_FOUND');
 const result=await db.from('workflow_instances').select('id, project_id, def_key, def_version, def_hash, instance_key, current_state, status')
  .eq('id',input.instanceId).eq('project_id',input.projectId).maybeSingle();
 if(result.error)throw new CalendarError('UNAVAILABLE');
 if(!result.data)throw new CalendarError('NOT_FOUND');
 const row=result.data;
 const requirements:ProductionRequirement[]=['execution_approval','budget_check'];
 if(project.data.execution_paused!==false)requirements.push('project_resumed');
 if(row.status!=='active')requirements.push('active_instance');
 if(row.current_state!=='content_generation')requirements.push('content_generation_state');
 const base:CalendarProductionPreview={planningOnly:true,canStart:false,title:'Skapa månadens saga',state:null,cost:'unknown',brief:null,requirements,checks:[]};
 const def=findVendoredDefinition(row.def_key,row.def_version);
 const state=def?.spec.states.find(s=>s.id===row.current_state);
 if(row.def_key!=='familje-stunden.monthly-release'||row.def_version!==2||!def||row.def_hash!==def.def_hash||!state)
  return {...base,requirements:[...requirements,'supported_contract']};
 let brief;
 try{
  brief=composeMonthlyBrief(def.spec.canonical,row.instance_key,{defKey:row.def_key,defVersion:row.def_version});
  readStoryRequirements(def.spec.canonical as Record<string,unknown>);
 }catch{return {...base,requirements:[...requirements,'supported_contract']};}
 const evidence=await listEvidence(db,row.id);
 const declared=findAdapter(row.def_key)!.attestableChecks();
 const summary=summarizeStateEvidence(declared,'content_generation',evidence,evidenceTargetHashFor(row,def.spec,'content_generation',evidence));
 return {...base,state:state.description,brief:{month:brief.month_key,theme:brief.theme,language:brief.language,audience:brief.audience,pages:brief.page_structure},
  checks:summary.verdicts.filter(c=>Object.hasOwn(LABELS,c.check_key)).map(c=>({key:c.check_key,label:LABELS[c.check_key],status:c.satisfies?'satisfied':c.satisfaction==='absent'?'pending':'needs_attention'}))};
}
