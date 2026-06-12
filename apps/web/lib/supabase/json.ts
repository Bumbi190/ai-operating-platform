import type { Json } from '@/lib/supabase/database.types'
import type { WorkflowStep } from '@/lib/supabase/types'

/** Pure type-boundary cast: app object → jsonb column. No transformation. */
export function toJson<T>(value: T): Json {
  return value as unknown as Json
}

/** Pure typed accessor for workflows.steps (jsonb). Null-coalesces to []; no validation/filtering. */
export function parseWorkflowSteps(value: Json | null | undefined): WorkflowStep[] {
  return (value ?? []) as unknown as WorkflowStep[]
}

/** Pure typed cast for media_scripts.images (jsonb array of URLs). No filtering. */
export function jsonStringArray(value: Json | null | undefined): string[] {
  return Array.isArray(value) ? (value as unknown as string[]) : []
}
