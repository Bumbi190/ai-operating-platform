import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Narrow transport contracts for the unapplied PostHog schema. Keeps draft
 * tables/RPCs out of the generated production Database types. SQL tests verify
 * these contracts. Remove this bridge after rollout + database type generation.
 */
type Result<T> = PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>
type BindingRow = {
  binding_id: string; project_id: string; mission_id: string; mission_version: number;
  delegation_id: string; workflow_instance_id: string; authorization_id: string;
  principal_id: string; version_hash: string; payload: unknown;
  mission_record_ids: string[]; delegation_record_ids: string[]; authorization_event_ids: string[];
}
interface BindingQuery {
  select(columns: string): BindingQuery
  eq(column: 'project_id' | 'mission_id' | 'mission_version', value: string | number): BindingQuery
  limit(count: 2): Result<BindingRow[]>
}
interface PosthogStoreClient {
  from(table: 'atlas_posthog_workflow_bindings'): BindingQuery
  rpc(name: 'atlas_posthog_reserve_read', args: {
    p_project_id: string; p_principal_id: string; p_authorization_id: string;
    p_request_hash: string; p_authorization_event_ids: string[];
  }): Result<unknown>
  rpc(name: 'atlas_posthog_finish_read', args: {
    p_attempt_id: string; p_principal_id: string; p_outcome: 'succeeded' | 'failed';
  }): Result<unknown>
  rpc(name: 'atlas_posthog_create_workflow_binding', args: {
    p_payload: unknown; p_version_hash: string; p_principal_id: string; p_authorization_id: string;
    p_mission_record_ids: string[]; p_delegation_record_ids: string[]; p_authorization_event_ids: string[];
  }): Result<unknown>
}
export function createPosthogStoreClient(): PosthogStoreClient {
  return createAdminClient() as unknown as PosthogStoreClient
}
