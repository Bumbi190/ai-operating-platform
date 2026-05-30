// ─────────────────────────────────────────────────────────────────────────────
//  Database types — manually written to match schema.sql
//  Run `supabase gen types typescript` to regenerate after schema changes
// ─────────────────────────────────────────────────────────────────────────────

export type RunStatus = 'pending' | 'running' | 'done' | 'failed'
export type OutputType = 'text' | 'pdf' | 'image' | 'json'
export type WorkflowTrigger = 'manual' | 'cron' | 'webhook'
export type LogRole = 'user' | 'assistant' | 'system' | 'tool'

// ─── Workflow step (stored in workflows.steps JSONB) ─────────────────────────
export interface WorkflowStep {
  order: number
  name: string
  agent_id: string
  input_template: string  // Supports {{variable}} interpolation
  output_key: string      // Key written to runs.context
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string
  owner_id: string
  name: string
  slug: string
  color: string
  settings: Record<string, unknown>
  created_at: string
}

export interface Agent {
  id: string
  project_id: string
  name: string
  description: string | null
  system_prompt: string
  model: string
  skill_ids: string[]
  config: {
    max_tokens?: number
    temperature?: number
  }
  created_at: string
}

export interface Workflow {
  id: string
  project_id: string
  name: string
  description: string | null
  steps: WorkflowStep[]
  trigger: WorkflowTrigger
  cron_expr: string | null
  active: boolean
  created_at: string
}

export interface Run {
  id: string
  workflow_id: string
  project_id: string
  status: RunStatus
  input: Record<string, string>
  context: Record<string, string>  // output_key → value accumulator
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export interface RunLog {
  id: string
  run_id: string
  step_order: number | null
  step_name: string | null
  role: LogRole
  content: string
  tokens_in: number | null
  tokens_out: number | null
  duration_ms: number | null
  created_at: string
}

export interface Output {
  id: string
  run_id: string
  project_id: string
  name: string
  type: OutputType
  content: string | null
  file_url: string | null
  file_size: number | null
  created_at: string
}

export interface Memory {
  id: string
  project_id: string
  key: string
  value: string
  source: string | null
  updated_at: string
}

// ─── Supabase database definition ────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: Project
        Insert: Omit<Project, 'id' | 'created_at'>
        Update: Partial<Omit<Project, 'id' | 'owner_id' | 'created_at'>>
      }
      agents: {
        Row: Agent
        Insert: Omit<Agent, 'id' | 'created_at'>
        Update: Partial<Omit<Agent, 'id' | 'project_id' | 'created_at'>>
      }
      workflows: {
        Row: Workflow
        Insert: Omit<Workflow, 'id' | 'created_at'>
        Update: Partial<Omit<Workflow, 'id' | 'project_id' | 'created_at'>>
      }
      runs: {
        Row: Run
        Insert: Omit<Run, 'id' | 'created_at'>
        Update: Partial<Omit<Run, 'id' | 'workflow_id' | 'project_id' | 'created_at'>>
      }
      run_logs: {
        Row: RunLog
        Insert: Omit<RunLog, 'id' | 'created_at'>
        Update: never
      }
      outputs: {
        Row: Output
        Insert: Omit<Output, 'id' | 'created_at'>
        Update: Partial<Omit<Output, 'id' | 'run_id' | 'project_id' | 'created_at'>>
      }
      memories: {
        Row: Memory
        Insert: Omit<Memory, 'id' | 'updated_at'>
        Update: Partial<Pick<Memory, 'value' | 'source'>>
      }
    }
  }
}
