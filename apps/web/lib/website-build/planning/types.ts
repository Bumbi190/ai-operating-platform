export type IntegrationProvider = 'terminal' | 'vercel' | 'supabase' | 'strato' | 'form_delivery'
export type PlanContent = {
 title:string; purpose:string; audience:string
 pages:{key:string;title:string;purpose:string}[]
 design:{style:string;reference:string|null}
 features:{name:string;mode:'preview_demo'|'live_required';provider:IntegrationProvider|null}[]
 architecture:string; steps:string[]
 domain:{registrar:'strato';requestedName:string|null}
}
export type PlanRef={projectId:string;planId:string}
export type PlanRevisionRef=PlanRef&{revisionId:string;sha256:string;mockupDecisionId?:string|null}
export type PlanRevision=PlanRevisionRef&{number:number;content:PlanContent;brief:string;createdAt:string}
export type PlanDecision={id:string;revisionRef:PlanRevisionRef;approvedBy:string;scope:'static_preview';builderAgentId:string;startIntentId:string;sessionId:string|null}
export type ProjectRoot={os:'windows'|'macos'|'linux';root:string;targetId:string|null}
export type ProjectLocation=ProjectRoot&{projectId:string;folderName:string;status:'pending_runner'}
export type BuilderSetting={projectId:string;builderAgentId:string|null;domainRegistrar:'strato';location:ProjectLocation|null}
export type MockupOption={id:string;key:string;title:string;summary:string;sha256:string}
export type DesignReview={required:boolean;options:MockupOption[];approved:{id:string;mockupId:string;sha256:string;approvedBy:string}|null}
export type MockupApprovalInput=PlanRevisionRef&{mockupId:string;mockupSha256:string;idempotencyKey:string}
export type PlanView={designReview?:DesignReview;ref:PlanRef;conversationId:string;currentRevision:PlanRevision;approvedDecision:PlanDecision|null;activeSessionId:string|null;budget:{state:'configured'|'missing'|'unknown';monthlySek:number|null};setting:BuilderSetting}
export type SavePlanInput={projectId:string;conversationId:string;planId?:string;expectedRevisionId:string|null;content:PlanContent;idempotencyKey:string}
export type ApprovePlanInput=PlanRevisionRef&{idempotencyKey:string}
export type StartApprovedPlanInput=PlanRevisionRef&{decisionId:string}
