export type ProjectLifecycleState = 'active' | 'archived' | 'trashed'
export type ProjectLifecycleView = { projectId:string; state:ProjectLifecycleState; version:number; executionPaused:boolean; stopping:boolean }
export type ChangeLifecycleInput = { projectId:string; expectedVersion:number; action:'archive'|'trash'|'restore'; idempotencyKey:string }
