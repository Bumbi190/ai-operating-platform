export type ProductionRequirement = 'supported_contract'|'active_instance'|'project_resumed'|'content_generation_state'|'execution_approval'|'budget_check';
export type CalendarProductionPreview = {
 planningOnly:true;canStart:false;title:string;state:string|null;cost:'unknown';
 brief:null|{month:string;theme:string;language:string;audience:{min_age:number;max_age:number};pages:{total_pages:number;cover_pages:number;content_pages:number;closing_pages:number}};
 requirements:ProductionRequirement[];
 checks:{key:string;label:string;status:'pending'|'satisfied'|'needs_attention'}[];
};
