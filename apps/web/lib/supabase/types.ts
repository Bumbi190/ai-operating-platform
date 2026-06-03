// ─────────────────────────────────────────────────────────────────────────────
//  Database types — manually written to match schema.sql
//  Run `supabase gen types typescript` to regenerate after schema changes
// ─────────────────────────────────────────────────────────────────────────────

export type RunStatus = 'pending' | 'running' | 'done' | 'failed'
export type OutputType = 'text' | 'pdf' | 'image' | 'json'
export type WorkflowTrigger = 'manual' | 'cron' | 'webhook'
export type LogRole = 'user' | 'assistant' | 'system' | 'tool'

// ─── Marketing Engine (Familje-Stunden) — Fas 1 foundation ───────────────────
export type MarketingWorkflowKind =
  | 'marketing_campaign_planner'
  | 'marketing_channel_drafter'
  | 'marketing_brand_guard'
export type MarketingChannel = 'instagram' | 'facebook'
export type MarketingFormat =
  | 'reel' | 'carousel' | 'story' | 'single_post' | 'fb_post' | 'fb_event'
export type MarketingBeat = 'teaser' | 'launch' | 'mid' | 'bridge'

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
  workflow_id: string | null   // null för kod-drivna marketing-runs (dispatch via `kind`)
  project_id: string
  status: RunStatus
  kind: MarketingWorkflowKind | null  // null = legacy agent-step-workflow
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

// ─── Marketing Engine domain rows (Fas 1) ───────────────────────────────────
export interface CampaignPlan {
  id: string
  project_id: string
  run_id: string | null
  plan_key: string
  target_month: string
  theme_key: string | null
  theme_name: string | null
  next_theme_key: string | null
  status: 'draft' | 'approved' | 'archived' | 'superseded'
  campaign_angle: Record<string, unknown> | null
  revenue_strategy: Record<string, unknown> | null
  gaps: unknown[]
  human_input_needed: unknown[]
  canon_level: Record<string, unknown> | null
  generated_at: string | null
  approved_at: string | null
  approved_by: string | null
  created_at: string
  updated_at: string
}

export interface CampaignBrief {
  id: string
  project_id: string
  plan_id: string
  brief_key: string
  post_key: string | null
  channel: MarketingChannel
  format: MarketingFormat
  beat: MarketingBeat
  scheduled_week: string | null
  scheduled_date: string | null
  objective: string | null
  brief_payload: Record<string, unknown> | null
  canon_level: Record<string, unknown> | null
  status: 'planned' | 'drafting' | 'drafted' | 'needs_input'
  created_at: string
  updated_at: string
}

export interface DraftPost {
  id: string
  project_id: string
  run_id: string | null
  brief_id: string
  draft_key: string
  channel: MarketingChannel
  format: MarketingFormat
  beat: string | null
  draft_payload: Record<string, unknown> | null
  self_check: Record<string, unknown> | null
  gaps: unknown[]
  needs_input: unknown[]
  canon_level: Record<string, unknown> | null
  status:
    | 'drafted' | 'needs_input' | 'guard_passed' | 'guard_failed'
    | 'approved' | 'rejected' | 'returned'
  version: number
  created_at: string
  updated_at: string
}

export interface GuardReport {
  id: string
  project_id: string
  run_id: string | null
  draft_id: string
  report_key: string
  verdict: 'approved' | 'warning' | 'rejected' | null
  score: number | null
  score_breakdown: Record<string, unknown> | null
  violations: unknown[]
  warnings: unknown[]
  gap_flags: unknown[]
  checks: Record<string, unknown> | null
  recommendation: string | null
  evaluated_at: string | null
  created_at: string
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
      campaign_plans: {
        Row: CampaignPlan
        Insert: Omit<CampaignPlan, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<CampaignPlan, 'id' | 'project_id' | 'created_at'>>
      }
      campaign_briefs: {
        Row: CampaignBrief
        Insert: Omit<CampaignBrief, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<CampaignBrief, 'id' | 'project_id' | 'plan_id' | 'created_at'>>
      }
      draft_posts: {
        Row: DraftPost
        Insert: Omit<DraftPost, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<DraftPost, 'id' | 'project_id' | 'brief_id' | 'created_at'>>
      }
      guard_reports: {
        Row: GuardReport
        Insert: Omit<GuardReport, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<GuardReport, 'id' | 'project_id' | 'draft_id' | 'created_at'>>
      }
    }
  }
}
