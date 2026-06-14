// ─────────────────────────────────────────────────────────────────────────────
//  Supabase types — BRIDGE.
//  `database.types.ts` (generated via `supabase gen types typescript`) is the
//  single source of truth for the Database schema and every table Row/Insert/
//  Update/Relationships. This file re-exports it and re-derives the historically
//  hand-written table type aliases from the generated rows, plus keeps the
//  app-specific unions / JSON shapes that the generator does not produce.
//
//  Regenerate: `supabase gen types typescript --project-id <ref> --schema public`
//  → overwrite database.types.ts (this bridge stays unchanged).
// ─────────────────────────────────────────────────────────────────────────────

import type { Database } from './database.types'

export type { Database }

// ─── App-specific unions (NOT DB-generated) — kept verbatim ──────────────────
// Mirrors public.runs.status CHECK (see migration 20260617_h1p4_pr2_run_rejected_status):
//   awaiting_approval = completed steps, blocked on human approval (H1.P4 gate, flag-gated)
//   rejected          = approval rejected, terminal (business decision, NOT a tech failure)
//   cancelled         = cooperative cancel (H1.P5)
export type RunStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'awaiting_approval'
  | 'cancelled'
  | 'rejected'
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

// ─── Workflow step (stored in workflows.steps JSONB) — app shape, kept ───────
export interface WorkflowStep {
  order: number
  name: string
  agent_id: string
  input_template: string  // Supports {{variable}} interpolation
  output_key: string      // Key written to runs.context
}

// ─── Table row aliases — re-derived from the generated Database ──────────────
type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']

export type Project = Row<'projects'>
export type Agent = Row<'agents'>
export type Workflow = Row<'workflows'>
export type Run = Row<'runs'>
export type RunLog = Row<'run_logs'>
export type Output = Row<'outputs'>
export type Memory = Row<'memories'>
export type CampaignPlan = Row<'campaign_plans'>
export type CampaignBrief = Row<'campaign_briefs'>
export type DraftPost = Row<'draft_posts'>
export type GuardReport = Row<'guard_reports'>
