import type { createAdminClient } from '@/lib/supabase/admin'
import type { ChatConversationModel } from '@/lib/os/chat-shared'
import type { ProjectLifecycleView } from '@/lib/project/lifecycle/types'
import type { BuildPrincipal, BuildSessionView } from '../types'
import type { ProjectRoot, PlanView } from '../planning/types'
export type { ProjectLifecycleView, ProjectLifecycleState, ChangeLifecycleInput } from '@/lib/project/lifecycle/types'
export type Db = ReturnType<typeof createAdminClient>
export type Principal = BuildPrincipal
export type StudioSelection = { projectSlug?:string; conversationId?:string; sessionId?:string }
export type EnsureStudioInput = ({kind:'new';name:string}|{kind:'existing';projectId:string}) & {idempotencyKey:string}
export type StudioWorkspaceRef = {projectId:string;projectSlug:string;conversationId:string}
export type WorkspaceRequestInput = {projectId:string;targetId:string|null;mode:'new'|'existing_git'|'existing_folder';root:ProjectRoot;idempotencyKey:string}
export type WorkspaceRequestView = WorkspaceRequestInput & {requestId:string;generation:number;state:'pending_runner';requestedAt:string}
export type StudioProject = {id:string;slug:string;name:string;lifecycle:ProjectLifecycleView;builderAgentId:string|null;workspaceRequest:WorkspaceRequestView|null;budget:{state:'configured'|'missing'|'unknown';monthlySek:number|null}}
export type StudioView = {operatorId:string;canCreateProject:boolean;projects:StudioProject[];selected:StudioProject|null;conversation:ChatConversationModel|null;plan:PlanView|null;session:BuildSessionView|null;state:'ok'|'error'}
