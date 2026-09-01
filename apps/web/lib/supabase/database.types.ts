export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_snapshots: {
        Row: {
          captured_at: string
          followers: number | null
          following: number | null
          id: string
          media_count: number | null
          platform: string
          profile_views: number | null
          project_id: string | null
          raw: Json | null
          reach: number | null
          snapshot_date: string
        }
        Insert: {
          captured_at?: string
          followers?: number | null
          following?: number | null
          id?: string
          media_count?: number | null
          platform: string
          profile_views?: number | null
          project_id?: string | null
          raw?: Json | null
          reach?: number | null
          snapshot_date?: string
        }
        Update: {
          captured_at?: string
          followers?: number | null
          following?: number | null
          id?: string
          media_count?: number | null
          platform?: string
          profile_views?: number | null
          project_id?: string | null
          raw?: Json | null
          reach?: number | null
          snapshot_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          content: string
          created_at: string | null
          from_agent: string
          id: string
          message_type: string
          metadata: Json | null
          project_id: string | null
          run_id: string | null
          task_id: string | null
          to_agent: string
        }
        Insert: {
          content: string
          created_at?: string | null
          from_agent: string
          id?: string
          message_type?: string
          metadata?: Json | null
          project_id?: string | null
          run_id?: string | null
          task_id?: string | null
          to_agent: string
        }
        Update: {
          content?: string
          created_at?: string | null
          from_agent?: string
          id?: string
          message_type?: string
          metadata?: Json | null
          project_id?: string | null
          run_id?: string | null
          task_id?: string | null
          to_agent?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "manager_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          id: string
          model: string
          name: string
          project_id: string
          skill_ids: string[]
          system_prompt: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          model?: string
          name: string
          project_id: string
          skill_ids?: string[]
          system_prompt: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          model?: string
          name?: string
          project_id?: string
          skill_ids?: string[]
          system_prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          action: string | null
          content: string
          created_at: string | null
          decided_at: string | null
          draft_id: string | null
          fix_patch: Json | null
          guard_report_id: string | null
          id: string
          kind: string
          operator: string | null
          output_key: string
          project_id: string | null
          reviewed_at: string | null
          reviewer_notes: string | null
          run_id: string | null
          status: string
        }
        Insert: {
          action?: string | null
          content: string
          created_at?: string | null
          decided_at?: string | null
          draft_id?: string | null
          fix_patch?: Json | null
          guard_report_id?: string | null
          id?: string
          kind?: string
          operator?: string | null
          output_key: string
          project_id?: string | null
          reviewed_at?: string | null
          reviewer_notes?: string | null
          run_id?: string | null
          status?: string
        }
        Update: {
          action?: string | null
          content?: string
          created_at?: string | null
          decided_at?: string | null
          draft_id?: string | null
          fix_patch?: Json | null
          guard_report_id?: string | null
          id?: string
          kind?: string
          operator?: string | null
          output_key?: string
          project_id?: string | null
          reviewed_at?: string | null
          reviewer_notes?: string | null
          run_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "draft_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_guard_report_id_fkey"
            columns: ["guard_report_id"]
            isOneToOne: false
            referencedRelation: "guard_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_actions: {
        Row: {
          action_type: string
          actor: string
          conversation_id: string | null
          created_at: string
          detail: Json | null
          id: string
          project_id: string | null
          status: string | null
          summary: string
          target_id: string | null
          target_kind: string | null
          tool_name: string
        }
        Insert: {
          action_type: string
          actor?: string
          conversation_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          project_id?: string | null
          status?: string | null
          summary: string
          target_id?: string | null
          target_kind?: string | null
          tool_name: string
        }
        Update: {
          action_type?: string
          actor?: string
          conversation_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          project_id?: string | null
          status?: string | null
          summary?: string
          target_id?: string | null
          target_kind?: string | null
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "atlas_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atlas_actions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_authorizations: {
        Row: {
          action_kind: string
          authority_basis: string
          authority_description: string | null
          authorization_id: string
          conditions: Json
          created_at: string
          event_id: string
          event_type: string
          evidence: Json
          expires_at: string | null
          occurred_at: string
          principal_id: string
          project_id: string
          reason: string | null
          superseded_by: string | null
          target_id: string
          target_type: string
          target_version_hash: string
        }
        Insert: {
          action_kind: string
          authority_basis?: string
          authority_description?: string | null
          authorization_id: string
          conditions?: Json
          created_at?: string
          event_id?: string
          event_type: string
          evidence?: Json
          expires_at?: string | null
          occurred_at?: string
          principal_id: string
          project_id: string
          reason?: string | null
          superseded_by?: string | null
          target_id: string
          target_type: string
          target_version_hash: string
        }
        Update: {
          action_kind?: string
          authority_basis?: string
          authority_description?: string | null
          authorization_id?: string
          conditions?: Json
          created_at?: string
          event_id?: string
          event_type?: string
          evidence?: Json
          expires_at?: string | null
          occurred_at?: string
          principal_id?: string
          project_id?: string
          reason?: string | null
          superseded_by?: string | null
          target_id?: string
          target_type?: string
          target_version_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "atlas_authorizations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_decision_ledger: {
        Row: {
          alternatives: Json
          authority: Json | null
          confidence: string | null
          created_at: string
          decision_id: string
          effective_at: string | null
          evidence: Json
          expected_impact: string | null
          expires_at: string | null
          lifecycle_generation: number
          materiality: Json
          occurred_at: string
          outcome: Json | null
          principal_id: string
          project_id: string
          rationale: string | null
          reason: string | null
          recommendation: string | null
          record_id: string
          record_type: string
          reversal_conditions: Json
          review: Json | null
          review_note: string | null
          snapshot: Json | null
          statement: string
          superseded_by: string | null
          title: string
          version: number
        }
        Insert: {
          alternatives?: Json
          authority?: Json | null
          confidence?: string | null
          created_at?: string
          decision_id: string
          effective_at?: string | null
          evidence?: Json
          expected_impact?: string | null
          expires_at?: string | null
          lifecycle_generation?: number
          materiality?: Json
          occurred_at?: string
          outcome?: Json | null
          principal_id: string
          project_id: string
          rationale?: string | null
          reason?: string | null
          recommendation?: string | null
          record_id?: string
          record_type: string
          reversal_conditions?: Json
          review?: Json | null
          review_note?: string | null
          snapshot?: Json | null
          statement: string
          superseded_by?: string | null
          title: string
          version?: number
        }
        Update: {
          alternatives?: Json
          authority?: Json | null
          confidence?: string | null
          created_at?: string
          decision_id?: string
          effective_at?: string | null
          evidence?: Json
          expected_impact?: string | null
          expires_at?: string | null
          lifecycle_generation?: number
          materiality?: Json
          occurred_at?: string
          outcome?: Json | null
          principal_id?: string
          project_id?: string
          rationale?: string | null
          reason?: string | null
          recommendation?: string | null
          record_id?: string
          record_type?: string
          reversal_conditions?: Json
          review?: Json | null
          review_note?: string | null
          snapshot?: Json | null
          statement?: string
          superseded_by?: string | null
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "atlas_decision_ledger_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_delegation_ledger: {
        Row: {
          act_type: string
          actor_id: string | null
          actor_kind: string
          envelope: Json | null
          envelope_id: string
          lineage_sequence: number
          mission_bound_hash: string
          mission_id: string
          mission_version: number
          note: string | null
          occurred_at: string
          project_id: string
          record_id: string
          rejections: Json
          replan: Json | null
          revoked_reason: string | null
        }
        Insert: {
          act_type: string
          actor_id?: string | null
          actor_kind: string
          envelope?: Json | null
          envelope_id: string
          lineage_sequence: number
          mission_bound_hash: string
          mission_id: string
          mission_version: number
          note?: string | null
          occurred_at?: string
          project_id: string
          record_id?: string
          rejections?: Json
          replan?: Json | null
          revoked_reason?: string | null
        }
        Update: {
          act_type?: string
          actor_id?: string | null
          actor_kind?: string
          envelope?: Json | null
          envelope_id?: string
          lineage_sequence?: number
          mission_bound_hash?: string
          mission_id?: string
          mission_version?: number
          note?: string | null
          occurred_at?: string
          project_id?: string
          record_id?: string
          rejections?: Json
          replan?: Json | null
          revoked_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_delegation_ledger_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_entities: {
        Row: {
          created_at: string
          id: string
          key: string
          kind: string
          meta: Json
          name: string | null
          project_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          kind: string
          meta?: Json
          name?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          kind?: string
          meta?: Json
          name?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atlas_entities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_intelligence: {
        Row: {
          body: Json
          confidence: number
          evidence: Json
          id: string
          kind: string
          produced_at: string
          produced_by: string
          project_id: string | null
          subject_id: string | null
          subject_kind: string | null
          subject_name: string | null
          superseded_by: string | null
          window_since: string | null
          window_until: string | null
        }
        Insert: {
          body?: Json
          confidence: number
          evidence?: Json
          id?: string
          kind: string
          produced_at?: string
          produced_by: string
          project_id?: string | null
          subject_id?: string | null
          subject_kind?: string | null
          subject_name?: string | null
          superseded_by?: string | null
          window_since?: string | null
          window_until?: string | null
        }
        Update: {
          body?: Json
          confidence?: number
          evidence?: Json
          id?: string
          kind?: string
          produced_at?: string
          produced_by?: string
          project_id?: string | null
          subject_id?: string | null
          subject_kind?: string | null
          subject_name?: string | null
          superseded_by?: string | null
          window_since?: string | null
          window_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_intelligence_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atlas_intelligence_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "atlas_intelligence"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_mission_ledger: {
        Row: {
          allowed_actions: Json
          approval_gates: Json
          assumptions: Json
          authority: Json
          authority_record: Json | null
          authority_source: Json | null
          blocker: Json | null
          budget: Json | null
          clears_blocker_id: string | null
          closure: Json | null
          completion_conditions: Json
          constraints: Json
          created_at: string
          data_scope: Json
          deadline: string | null
          decision_provenance: Json | null
          decision_ref: Json | null
          deliverables: Json
          dependencies: Json
          dependency_observation: Json | null
          escalation_triggers: Json
          evidence: Json | null
          evidence_requirements: Json
          executive_owner: string
          expected_outcome: string | null
          forbidden_actions: Json
          gate_resolution: Json | null
          in_scope: Json
          lifecycle_generation: number
          mission_id: string
          mission_owner: string | null
          mission_type: string
          objective: string
          occurred_at: string
          out_of_scope: Json
          pause_conditions: Json
          principal_id: string
          project_id: string
          project_mode: string | null
          reason: string | null
          record_id: string
          record_type: string
          report: Json | null
          reporting: Json
          review_note: string | null
          risks: Json
          stop_conditions: Json
          strategic_context: string | null
          success_criteria: Json
          superseded_by: string | null
          title: string
          tools: Json
          version: number
        }
        Insert: {
          allowed_actions?: Json
          approval_gates?: Json
          assumptions?: Json
          authority?: Json
          authority_record?: Json | null
          authority_source?: Json | null
          blocker?: Json | null
          budget?: Json | null
          clears_blocker_id?: string | null
          closure?: Json | null
          completion_conditions?: Json
          constraints?: Json
          created_at?: string
          data_scope?: Json
          deadline?: string | null
          decision_provenance?: Json | null
          decision_ref?: Json | null
          deliverables?: Json
          dependencies?: Json
          dependency_observation?: Json | null
          escalation_triggers?: Json
          evidence?: Json | null
          evidence_requirements?: Json
          executive_owner: string
          expected_outcome?: string | null
          forbidden_actions?: Json
          gate_resolution?: Json | null
          in_scope?: Json
          lifecycle_generation?: number
          mission_id: string
          mission_owner?: string | null
          mission_type: string
          objective: string
          occurred_at?: string
          out_of_scope?: Json
          pause_conditions?: Json
          principal_id: string
          project_id: string
          project_mode?: string | null
          reason?: string | null
          record_id?: string
          record_type: string
          report?: Json | null
          reporting?: Json
          review_note?: string | null
          risks?: Json
          stop_conditions?: Json
          strategic_context?: string | null
          success_criteria?: Json
          superseded_by?: string | null
          title: string
          tools?: Json
          version?: number
        }
        Update: {
          allowed_actions?: Json
          approval_gates?: Json
          assumptions?: Json
          authority?: Json
          authority_record?: Json | null
          authority_source?: Json | null
          blocker?: Json | null
          budget?: Json | null
          clears_blocker_id?: string | null
          closure?: Json | null
          completion_conditions?: Json
          constraints?: Json
          created_at?: string
          data_scope?: Json
          deadline?: string | null
          decision_provenance?: Json | null
          decision_ref?: Json | null
          deliverables?: Json
          dependencies?: Json
          dependency_observation?: Json | null
          escalation_triggers?: Json
          evidence?: Json | null
          evidence_requirements?: Json
          executive_owner?: string
          expected_outcome?: string | null
          forbidden_actions?: Json
          gate_resolution?: Json | null
          in_scope?: Json
          lifecycle_generation?: number
          mission_id?: string
          mission_owner?: string | null
          mission_type?: string
          objective?: string
          occurred_at?: string
          out_of_scope?: Json
          pause_conditions?: Json
          principal_id?: string
          project_id?: string
          project_mode?: string | null
          reason?: string | null
          record_id?: string
          record_type?: string
          report?: Json | null
          reporting?: Json
          review_note?: string | null
          risks?: Json
          stop_conditions?: Json
          strategic_context?: string | null
          success_criteria?: Json
          superseded_by?: string | null
          title?: string
          tools?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "atlas_mission_ledger_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_signals: {
        Row: {
          content_id: string | null
          id: string
          kind: string
          payload: Json
          produced_at: string
          project_id: string | null
          source: string | null
          version: string
        }
        Insert: {
          content_id?: string | null
          id?: string
          kind: string
          payload: Json
          produced_at?: string
          project_id?: string | null
          source?: string | null
          version: string
        }
        Update: {
          content_id?: string | null
          id?: string
          kind?: string
          payload?: Json
          produced_at?: string
          project_id?: string | null
          source?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "atlas_signals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          area: string | null
          created_at: string
          dedupe_key: string | null
          detail: string | null
          emailed_at: string | null
          fix_prompt: string | null
          id: string
          project_id: string | null
          repro: string | null
          resolved_at: string | null
          severity: string
          source: string
          status: string
          title: string
        }
        Insert: {
          area?: string | null
          created_at?: string
          dedupe_key?: string | null
          detail?: string | null
          emailed_at?: string | null
          fix_prompt?: string | null
          id?: string
          project_id?: string | null
          repro?: string | null
          resolved_at?: string | null
          severity?: string
          source: string
          status?: string
          title: string
        }
        Update: {
          area?: string | null
          created_at?: string
          dedupe_key?: string | null
          detail?: string | null
          emailed_at?: string | null
          fix_prompt?: string | null
          id?: string
          project_id?: string | null
          repro?: string | null
          resolved_at?: string | null
          severity?: string
          source?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bugscan_findings: {
        Row: {
          check_name: string
          created_at: string
          fix_prompt: string | null
          id: string
          is_new: boolean
          message: string | null
          project_id: string | null
          project_name: string | null
          run_id: string
          status: string
        }
        Insert: {
          check_name: string
          created_at?: string
          fix_prompt?: string | null
          id?: string
          is_new?: boolean
          message?: string | null
          project_id?: string | null
          project_name?: string | null
          run_id: string
          status: string
        }
        Update: {
          check_name?: string
          created_at?: string
          fix_prompt?: string | null
          id?: string
          is_new?: boolean
          message?: string | null
          project_id?: string | null
          project_name?: string | null
          run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bugscan_findings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bugscan_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "bugscan_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      bugscan_runs: {
        Row: {
          created_at: string
          errors: number
          finished_at: string | null
          id: string
          ok: number
          started_at: string
          summary: Json
          warnings: number
        }
        Insert: {
          created_at?: string
          errors?: number
          finished_at?: string | null
          id?: string
          ok?: number
          started_at?: string
          summary?: Json
          warnings?: number
        }
        Update: {
          created_at?: string
          errors?: number
          finished_at?: string | null
          id?: string
          ok?: number
          started_at?: string
          summary?: Json
          warnings?: number
        }
        Relationships: []
      }
      campaign_briefs: {
        Row: {
          beat: string
          brief_key: string
          brief_payload: Json | null
          canon_level: Json | null
          channel: string
          created_at: string
          format: string
          id: string
          objective: string | null
          plan_id: string
          post_key: string | null
          project_id: string
          scheduled_date: string | null
          scheduled_week: string | null
          status: string
          updated_at: string
        }
        Insert: {
          beat: string
          brief_key: string
          brief_payload?: Json | null
          canon_level?: Json | null
          channel: string
          created_at?: string
          format: string
          id?: string
          objective?: string | null
          plan_id: string
          post_key?: string | null
          project_id: string
          scheduled_date?: string | null
          scheduled_week?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          beat?: string
          brief_key?: string
          brief_payload?: Json | null
          canon_level?: Json | null
          channel?: string
          created_at?: string
          format?: string
          id?: string
          objective?: string | null
          plan_id?: string
          post_key?: string | null
          project_id?: string
          scheduled_date?: string | null
          scheduled_week?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_briefs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "campaign_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_briefs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          campaign_angle: Json | null
          canon_level: Json | null
          created_at: string
          gaps: Json
          generated_at: string | null
          human_input_needed: Json
          id: string
          next_theme_key: string | null
          plan_key: string
          project_id: string
          revenue_strategy: Json | null
          run_id: string | null
          status: string
          target_month: string
          theme_key: string | null
          theme_name: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          campaign_angle?: Json | null
          canon_level?: Json | null
          created_at?: string
          gaps?: Json
          generated_at?: string | null
          human_input_needed?: Json
          id?: string
          next_theme_key?: string | null
          plan_key: string
          project_id: string
          revenue_strategy?: Json | null
          run_id?: string | null
          status?: string
          target_month: string
          theme_key?: string | null
          theme_name?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          campaign_angle?: Json | null
          canon_level?: Json | null
          created_at?: string
          gaps?: Json
          generated_at?: string | null
          human_input_needed?: Json
          id?: string
          next_theme_key?: string | null
          plan_key?: string
          project_id?: string
          revenue_strategy?: Json | null
          run_id?: string | null
          status?: string
          target_month?: string
          theme_key?: string | null
          theme_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_plans_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          channel: string | null
          created_at: string
          ended_at: string | null
          id: string
          name: string
          project_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          name: string
          project_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          name?: string
          project_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      collector_runs: {
        Row: {
          collector_id: string
          duration_ms: number | null
          error_message: string | null
          id: string
          metadata: Json
          project_id: string | null
          ran_at: string
          signal_id: string | null
          signal_kind: string | null
          snapshot_date: string
          status: string
        }
        Insert: {
          collector_id: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json
          project_id?: string | null
          ran_at?: string
          signal_id?: string | null
          signal_kind?: string | null
          snapshot_date: string
          status: string
        }
        Update: {
          collector_id?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json
          project_id?: string | null
          ran_at?: string
          signal_id?: string | null
          signal_kind?: string | null
          snapshot_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "collector_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_replies: {
        Row: {
          comment_id: string
          comment_text: string
          commenter_name: string | null
          error: string | null
          id: string
          platform: string
          post_id: string
          project_id: string | null
          received_at: string
          replied_at: string | null
          reply_at: string
          reply_status: string
          reply_text: string | null
        }
        Insert: {
          comment_id: string
          comment_text: string
          commenter_name?: string | null
          error?: string | null
          id?: string
          platform: string
          post_id: string
          project_id?: string | null
          received_at?: string
          replied_at?: string | null
          reply_at?: string
          reply_status?: string
          reply_text?: string | null
        }
        Update: {
          comment_id?: string
          comment_text?: string
          commenter_name?: string | null
          error?: string | null
          id?: string
          platform?: string
          post_id?: string
          project_id?: string | null
          received_at?: string
          replied_at?: string | null
          reply_at?: string
          reply_status?: string
          reply_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comment_replies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      content_feedback: {
        Row: {
          approval_id: string | null
          content_excerpt: string | null
          created_at: string
          decision: string
          eval_score_at_decision: number | null
          evaluation_id: string | null
          id: string
          output_type: string
          project_id: string
          quality_patterns: string[]
          rejection_reason: string | null
          revision_notes: string | null
        }
        Insert: {
          approval_id?: string | null
          content_excerpt?: string | null
          created_at?: string
          decision: string
          eval_score_at_decision?: number | null
          evaluation_id?: string | null
          id?: string
          output_type: string
          project_id: string
          quality_patterns?: string[]
          rejection_reason?: string | null
          revision_notes?: string | null
        }
        Update: {
          approval_id?: string | null
          content_excerpt?: string | null
          created_at?: string
          decision?: string
          eval_score_at_decision?: number | null
          evaluation_id?: string | null
          id?: string
          output_type?: string
          project_id?: string
          quality_patterns?: string[]
          rejection_reason?: string | null
          revision_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_feedback_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_feedback_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string | null
          id: string
          role: string
          tool_data: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
          tool_data?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
          tool_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          project_id: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id?: string | null
          title?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_events: {
        Row: {
          agent: string | null
          cost_sek: number
          cost_usd: number
          created_at: string
          id: string
          metadata: Json
          model: string | null
          operation: string | null
          project_id: string | null
          provider: string
          run_id: string | null
          script_id: string | null
          tokens_in: number
          tokens_out: number
          unit_type: string
          units: number
        }
        Insert: {
          agent?: string | null
          cost_sek?: number
          cost_usd?: number
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          operation?: string | null
          project_id?: string | null
          provider: string
          run_id?: string | null
          script_id?: string | null
          tokens_in?: number
          tokens_out?: number
          unit_type?: string
          units?: number
        }
        Update: {
          agent?: string | null
          cost_sek?: number
          cost_usd?: number
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          operation?: string | null
          project_id?: string | null
          provider?: string
          run_id?: string | null
          script_id?: string | null
          tokens_in?: number
          tokens_out?: number
          unit_type?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "cost_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_rates: {
        Row: {
          key: string
          note: string | null
          updated_at: string
          value: number
        }
        Insert: {
          key: string
          note?: string | null
          updated_at?: string
          value: number
        }
        Update: {
          key?: string
          note?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      cron_heartbeat: {
        Row: {
          cadence: string | null
          checked_at: string | null
          detail: string | null
          jobname: string
          label: string | null
          last_evidence_at: string | null
          last_fired_at: string | null
          last_warned_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cadence?: string | null
          checked_at?: string | null
          detail?: string | null
          jobname: string
          label?: string | null
          last_evidence_at?: string | null
          last_fired_at?: string | null
          last_warned_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cadence?: string | null
          checked_at?: string | null
          detail?: string | null
          jobname?: string
          label?: string | null
          last_evidence_at?: string | null
          last_fired_at?: string | null
          last_warned_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_notes: {
        Row: {
          content: string
          created_at: string | null
          date: string
          id: string
          project_id: string | null
          type: string
        }
        Insert: {
          content: string
          created_at?: string | null
          date?: string
          id?: string
          project_id?: string | null
          type?: string
        }
        Update: {
          content?: string
          created_at?: string | null
          date?: string
          id?: string
          project_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_posts: {
        Row: {
          beat: string | null
          brief_id: string
          canon_level: Json | null
          channel: string
          created_at: string
          draft_key: string
          draft_payload: Json | null
          format: string
          gaps: Json
          id: string
          needs_input: Json
          project_id: string
          run_id: string | null
          self_check: Json | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          beat?: string | null
          brief_id: string
          canon_level?: Json | null
          channel: string
          created_at?: string
          draft_key: string
          draft_payload?: Json | null
          format: string
          gaps?: Json
          id?: string
          needs_input?: Json
          project_id: string
          run_id?: string | null
          self_check?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          beat?: string | null
          brief_id?: string
          canon_level?: Json | null
          channel?: string
          created_at?: string
          draft_key?: string
          draft_payload?: Json | null
          format?: string
          gaps?: Json
          id?: string
          needs_input?: Json
          project_id?: string
          run_id?: string | null
          self_check?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_posts_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "campaign_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_posts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dream_issues: {
        Row: {
          created_at: string
          first_seen_at: string
          id: string
          issue_id: string
          last_seen_at: string
          latest_action: string | null
          latest_insight: string | null
          latest_memory_key: string | null
          manager_task_id: string | null
          occurrences: number
          project_id: string
          severity: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_seen_at?: string
          id?: string
          issue_id: string
          last_seen_at?: string
          latest_action?: string | null
          latest_insight?: string | null
          latest_memory_key?: string | null
          manager_task_id?: string | null
          occurrences?: number
          project_id: string
          severity?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_seen_at?: string
          id?: string
          issue_id?: string
          last_seen_at?: string
          latest_action?: string | null
          latest_insight?: string | null
          latest_memory_key?: string | null
          manager_task_id?: string | null
          occurrences?: number
          project_id?: string
          severity?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dream_issues_manager_task_id_fkey"
            columns: ["manager_task_id"]
            isOneToOne: false
            referencedRelation: "manager_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dream_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          brand_alignment: number | null
          content_preview: string | null
          content_type: string
          created_at: string
          hard_fails: string[]
          hook_strength: number | null
          id: string
          issues: Json
          output_id: string | null
          overall_score: number | null
          pacing_quality: number | null
          pass_signals: string[]
          passed: boolean
          project_id: string
          script_id: string | null
          slop_phrases: string[]
          slop_score: number | null
          soft_fails: string[]
          specificity: number | null
          suggestion: string | null
        }
        Insert: {
          brand_alignment?: number | null
          content_preview?: string | null
          content_type: string
          created_at?: string
          hard_fails?: string[]
          hook_strength?: number | null
          id?: string
          issues?: Json
          output_id?: string | null
          overall_score?: number | null
          pacing_quality?: number | null
          pass_signals?: string[]
          passed?: boolean
          project_id: string
          script_id?: string | null
          slop_phrases?: string[]
          slop_score?: number | null
          soft_fails?: string[]
          specificity?: number | null
          suggestion?: string | null
        }
        Update: {
          brand_alignment?: number | null
          content_preview?: string | null
          content_type?: string
          created_at?: string
          hard_fails?: string[]
          hook_strength?: number | null
          id?: string
          issues?: Json
          output_id?: string | null
          overall_score?: number | null
          pacing_quality?: number | null
          pass_signals?: string[]
          passed?: boolean
          project_id?: string
          script_id?: string | null
          slop_phrases?: string[]
          slop_score?: number | null
          soft_fails?: string[]
          specificity?: number | null
          suggestion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_output_id_fkey"
            columns: ["output_id"]
            isOneToOne: false
            referencedRelation: "outputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      guard_reports: {
        Row: {
          checks: Json | null
          created_at: string
          draft_id: string
          evaluated_at: string | null
          gap_flags: Json
          id: string
          project_id: string
          recommendation: string | null
          report_key: string
          run_id: string | null
          score: number | null
          score_breakdown: Json | null
          updated_at: string
          verdict: string | null
          violations: Json
          warnings: Json
        }
        Insert: {
          checks?: Json | null
          created_at?: string
          draft_id: string
          evaluated_at?: string | null
          gap_flags?: Json
          id?: string
          project_id: string
          recommendation?: string | null
          report_key: string
          run_id?: string | null
          score?: number | null
          score_breakdown?: Json | null
          updated_at?: string
          verdict?: string | null
          violations?: Json
          warnings?: Json
        }
        Update: {
          checks?: Json | null
          created_at?: string
          draft_id?: string
          evaluated_at?: string | null
          gap_flags?: Json
          id?: string
          project_id?: string
          recommendation?: string | null
          report_key?: string
          run_id?: string | null
          score?: number | null
          score_breakdown?: Json | null
          updated_at?: string
          verdict?: string | null
          violations?: Json
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "guard_reports_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: true
            referencedRelation: "draft_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guard_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guard_reports_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      infra_costs: {
        Row: {
          amount_sek: number
          created_at: string
          id: string
          note: string | null
          period_month: string
          project_id: string | null
          provider: string
        }
        Insert: {
          amount_sek?: number
          created_at?: string
          id?: string
          note?: string | null
          period_month: string
          project_id?: string | null
          provider: string
        }
        Update: {
          amount_sek?: number
          created_at?: string
          id?: string
          note?: string | null
          period_month?: string
          project_id?: string | null
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "infra_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          phone: string | null
          project_id: string
          source: string | null
          status: string
          value_sek: number | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          project_id: string
          source?: string | null
          status?: string
          value_sek?: number | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          project_id?: string
          source?: string | null
          status?: string
          value_sek?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_tasks: {
        Row: {
          assigned_at: string | null
          created_at: string | null
          delegation_bound_hash: string | null
          delegation_envelope_id: string | null
          description: string | null
          id: string
          mission_bound_hash: string | null
          mission_id: string | null
          mission_version: number | null
          owner: string | null
          priority: string
          project_id: string | null
          result: string | null
          run_id: string | null
          source: string | null
          source_key: string | null
          status: string
          title: string
          updated_at: string | null
          work_package: Json | null
          work_package_hash: string | null
          work_package_id: string | null
          workflow_id: string | null
          workforce_role_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          created_at?: string | null
          delegation_bound_hash?: string | null
          delegation_envelope_id?: string | null
          description?: string | null
          id?: string
          mission_bound_hash?: string | null
          mission_id?: string | null
          mission_version?: number | null
          owner?: string | null
          priority?: string
          project_id?: string | null
          result?: string | null
          run_id?: string | null
          source?: string | null
          source_key?: string | null
          status?: string
          title: string
          updated_at?: string | null
          work_package?: Json | null
          work_package_hash?: string | null
          work_package_id?: string | null
          workflow_id?: string | null
          workforce_role_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          created_at?: string | null
          delegation_bound_hash?: string | null
          delegation_envelope_id?: string | null
          description?: string | null
          id?: string
          mission_bound_hash?: string | null
          mission_id?: string | null
          mission_version?: number | null
          owner?: string | null
          priority?: string
          project_id?: string | null
          result?: string | null
          run_id?: string | null
          source?: string | null
          source_key?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          work_package?: Json | null
          work_package_hash?: string | null
          work_package_id?: string | null
          workflow_id?: string | null
          workforce_role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_tasks_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_tasks_workforce_role_fkey"
            columns: ["workforce_role_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      media_insights: {
        Row: {
          avg_view_pct: number | null
          comments: number | null
          facebook_post_id: string | null
          fetched_at: string
          followers_gained: number | null
          id: string
          impressions: number | null
          instagram_media_id: string | null
          likes: number | null
          link_clicks: number | null
          platform: string
          profile_visits: number | null
          project_id: string | null
          published_at: string | null
          reach: number | null
          saved: number | null
          script_id: string | null
          shares: number | null
          total_interactions: number | null
          views: number | null
          youtube_video_id: string | null
        }
        Insert: {
          avg_view_pct?: number | null
          comments?: number | null
          facebook_post_id?: string | null
          fetched_at?: string
          followers_gained?: number | null
          id?: string
          impressions?: number | null
          instagram_media_id?: string | null
          likes?: number | null
          link_clicks?: number | null
          platform?: string
          profile_visits?: number | null
          project_id?: string | null
          published_at?: string | null
          reach?: number | null
          saved?: number | null
          script_id?: string | null
          shares?: number | null
          total_interactions?: number | null
          views?: number | null
          youtube_video_id?: string | null
        }
        Update: {
          avg_view_pct?: number | null
          comments?: number | null
          facebook_post_id?: string | null
          fetched_at?: string
          followers_gained?: number | null
          id?: string
          impressions?: number | null
          instagram_media_id?: string | null
          likes?: number | null
          link_clicks?: number | null
          platform?: string
          profile_visits?: number | null
          project_id?: string | null
          published_at?: string | null
          reach?: number | null
          saved?: number | null
          script_id?: string | null
          shares?: number | null
          total_interactions?: number | null
          views?: number | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_insights_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_insights_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "media_scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      media_news_items: {
        Row: {
          content_angle: string | null
          created_at: string | null
          fetched_at: string | null
          id: string
          key_insight: string | null
          project_id: string
          raw_output: Json | null
          run_id: string | null
          source_name: string | null
          status: string | null
          summary: string | null
          target_audience: string | null
          title: string
          url: string | null
          virality_score: number | null
        }
        Insert: {
          content_angle?: string | null
          created_at?: string | null
          fetched_at?: string | null
          id?: string
          key_insight?: string | null
          project_id: string
          raw_output?: Json | null
          run_id?: string | null
          source_name?: string | null
          status?: string | null
          summary?: string | null
          target_audience?: string | null
          title: string
          url?: string | null
          virality_score?: number | null
        }
        Update: {
          content_angle?: string | null
          created_at?: string | null
          fetched_at?: string | null
          id?: string
          key_insight?: string | null
          project_id?: string
          raw_output?: Json | null
          run_id?: string | null
          source_name?: string | null
          status?: string | null
          summary?: string | null
          target_audience?: string | null
          title?: string
          url?: string | null
          virality_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_news_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_news_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      media_scripts: {
        Row: {
          audio_url: string | null
          background_music_url: string | null
          breaking: boolean
          captions: Json | null
          composition: string | null
          cta: string | null
          duration_ms: number | null
          estimated_duration: string | null
          facebook_post_id: string | null
          facebook_url: string | null
          feedback: string | null
          format: string | null
          generated_at: string | null
          hashtags: Json | null
          hook: string | null
          id: string
          images: Json | null
          instagram_creation_id: string | null
          instagram_creation_id_at: string | null
          instagram_media_id: string | null
          instagram_url: string | null
          news_item_id: string | null
          pipeline_failed_reason: string | null
          pipeline_next_retry_at: string | null
          project_id: string
          publish_channel_state: Json
          publish_failed_reason: string | null
          published_at: string | null
          quality_score: Json | null
          raw_output: Json | null
          render_attempts: number
          render_bucket: string | null
          render_id: string | null
          render_input_props: Json | null
          retry_count: number
          reviewed_at: string | null
          run_id: string | null
          script: string | null
          status: string | null
          timing_url: string | null
          tone: string | null
          topic: string | null
          updated_at: string
          version: number | null
          video_status: string | null
          video_url: string | null
          voice_attempts: number
          voice_status: string | null
          youtube_url: string | null
          youtube_video_id: string | null
        }
        Insert: {
          audio_url?: string | null
          background_music_url?: string | null
          breaking?: boolean
          captions?: Json | null
          composition?: string | null
          cta?: string | null
          duration_ms?: number | null
          estimated_duration?: string | null
          facebook_post_id?: string | null
          facebook_url?: string | null
          feedback?: string | null
          format?: string | null
          generated_at?: string | null
          hashtags?: Json | null
          hook?: string | null
          id?: string
          images?: Json | null
          instagram_creation_id?: string | null
          instagram_creation_id_at?: string | null
          instagram_media_id?: string | null
          instagram_url?: string | null
          news_item_id?: string | null
          pipeline_failed_reason?: string | null
          pipeline_next_retry_at?: string | null
          project_id: string
          publish_channel_state?: Json
          publish_failed_reason?: string | null
          published_at?: string | null
          quality_score?: Json | null
          raw_output?: Json | null
          render_attempts?: number
          render_bucket?: string | null
          render_id?: string | null
          render_input_props?: Json | null
          retry_count?: number
          reviewed_at?: string | null
          run_id?: string | null
          script?: string | null
          status?: string | null
          timing_url?: string | null
          tone?: string | null
          topic?: string | null
          updated_at?: string
          version?: number | null
          video_status?: string | null
          video_url?: string | null
          voice_attempts?: number
          voice_status?: string | null
          youtube_url?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          audio_url?: string | null
          background_music_url?: string | null
          breaking?: boolean
          captions?: Json | null
          composition?: string | null
          cta?: string | null
          duration_ms?: number | null
          estimated_duration?: string | null
          facebook_post_id?: string | null
          facebook_url?: string | null
          feedback?: string | null
          format?: string | null
          generated_at?: string | null
          hashtags?: Json | null
          hook?: string | null
          id?: string
          images?: Json | null
          instagram_creation_id?: string | null
          instagram_creation_id_at?: string | null
          instagram_media_id?: string | null
          instagram_url?: string | null
          news_item_id?: string | null
          pipeline_failed_reason?: string | null
          pipeline_next_retry_at?: string | null
          project_id?: string
          publish_channel_state?: Json
          publish_failed_reason?: string | null
          published_at?: string | null
          quality_score?: Json | null
          raw_output?: Json | null
          render_attempts?: number
          render_bucket?: string | null
          render_id?: string | null
          render_input_props?: Json | null
          retry_count?: number
          reviewed_at?: string | null
          run_id?: string | null
          script?: string | null
          status?: string | null
          timing_url?: string | null
          tone?: string | null
          topic?: string | null
          updated_at?: string
          version?: number | null
          video_status?: string | null
          video_url?: string | null
          voice_attempts?: number
          voice_status?: string | null
          youtube_url?: string | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_scripts_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "media_news_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_scripts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_scripts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          id: string
          key: string
          project_id: string
          source: string | null
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          project_id: string
          source?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          project_id?: string
          source?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "memories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      morning_briefings: {
        Row: {
          cost_24h: number
          data_json: Json
          generated_at: string
          id: string
          net_24h: number
          revenue_24h: number
          summary: string
          top_action: string | null
          top_business: string | null
        }
        Insert: {
          cost_24h?: number
          data_json?: Json
          generated_at?: string
          id?: string
          net_24h?: number
          revenue_24h?: number
          summary: string
          top_action?: string | null
          top_business?: string | null
        }
        Update: {
          cost_24h?: number
          data_json?: Json
          generated_at?: string
          id?: string
          net_24h?: number
          revenue_24h?: number
          summary?: string
          top_action?: string | null
          top_business?: string | null
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          confidence: string | null
          created_at: string
          detected_at: string
          evidence: Json | null
          id: string
          project_id: string | null
          rationale: string | null
          score: number | null
          status: string
          title: string
          type: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          detected_at?: string
          evidence?: Json | null
          id?: string
          project_id?: string | null
          rationale?: string | null
          score?: number | null
          status?: string
          title: string
          type: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          detected_at?: string
          evidence?: Json | null
          id?: string
          project_id?: string | null
          rationale?: string | null
          score?: number | null
          status?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      outputs: {
        Row: {
          content: string | null
          created_at: string
          file_size: number | null
          file_url: string | null
          id: string
          name: string
          project_id: string
          run_id: string
          type: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          file_size?: number | null
          file_url?: string | null
          id?: string
          name: string
          project_id: string
          run_id: string
          type: string
        }
        Update: {
          content?: string | null
          created_at?: string
          file_size?: number | null
          file_url?: string | null
          id?: string
          name?: string
          project_id?: string
          run_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "outputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          priority: string
          project_id: string | null
          sprint_id: string | null
          status: string
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          sprint_id?: string | null
          status?: string
          title: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          sprint_id?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planning_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_items_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          automation_paused: boolean
          global_daily_sek: number | null
          global_monthly_sek: number | null
          global_weekly_sek: number | null
          id: number
          max_daily_renders: number
          max_retry_attempts: number
          paused_at: string | null
          paused_reason: string | null
          updated_at: string
        }
        Insert: {
          automation_paused?: boolean
          global_daily_sek?: number | null
          global_monthly_sek?: number | null
          global_weekly_sek?: number | null
          id?: number
          max_daily_renders?: number
          max_retry_attempts?: number
          paused_at?: string | null
          paused_reason?: string | null
          updated_at?: string
        }
        Update: {
          automation_paused?: boolean
          global_daily_sek?: number | null
          global_monthly_sek?: number | null
          global_weekly_sek?: number | null
          id?: number
          max_daily_renders?: number
          max_retry_attempts?: number
          paused_at?: string | null
          paused_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_memory: {
        Row: {
          audit_events: Json
          category: string
          confidence: number
          correction_state: string | null
          created_at: string
          evidence_count: number
          id: string
          key: string
          last_seen_at: string
          lifecycle_state: string
          project_id: string
          tombstoned_at: string | null
          tombstoned_by: string | null
          value: Json
        }
        Insert: {
          audit_events?: Json
          category: string
          confidence?: number
          correction_state?: string | null
          created_at?: string
          evidence_count?: number
          id?: string
          key: string
          last_seen_at?: string
          lifecycle_state?: string
          project_id: string
          tombstoned_at?: string | null
          tombstoned_by?: string | null
          value: Json
        }
        Update: {
          audit_events?: Json
          category?: string
          confidence?: number
          correction_state?: string | null
          created_at?: string
          evidence_count?: number
          id?: string
          key?: string
          last_seen_at?: string
          lifecycle_state?: string
          project_id?: string
          tombstoned_at?: string | null
          tombstoned_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_memory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_tokens: {
        Row: {
          access_token: string
          account_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          platform: string
          project_id: string | null
          refreshed_at: string
          token_type: string
        }
        Insert: {
          access_token: string
          account_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          platform: string
          project_id?: string | null
          refreshed_at?: string
          token_type?: string
        }
        Update: {
          access_token?: string
          account_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          platform?: string
          project_id?: string | null
          refreshed_at?: string
          token_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_tokens_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_api_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          expires_at: string | null
          id: string
          key_prefix: string
          last_used_at: string | null
          name: string
          project_id: string
          revoked_at: string | null
          scopes: string[]
          secret_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          expires_at?: string | null
          id?: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          project_id: string
          revoked_at?: string | null
          scopes?: string[]
          secret_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          expires_at?: string | null
          id?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          project_id?: string
          revoked_at?: string | null
          scopes?: string[]
          secret_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_api_credentials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_budgets: {
        Row: {
          daily_sek: number | null
          monthly_sek: number
          project_id: string
          updated_at: string
          weekly_sek: number | null
        }
        Insert: {
          daily_sek?: number | null
          monthly_sek?: number
          project_id: string
          updated_at?: string
          weekly_sek?: number | null
        }
        Update: {
          daily_sek?: number | null
          monthly_sek?: number
          project_id?: string
          updated_at?: string
          weekly_sek?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_budgets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_scanners: {
        Row: {
          created_at: string
          enabled: boolean
          expected_check_count: number | null
          id: string
          label: string
          project_id: string
          scanner_url: string
          secret_env_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          expected_check_count?: number | null
          id?: string
          label: string
          project_id: string
          scanner_url: string
          secret_env_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          expected_check_count?: number | null
          id?: string
          label?: string
          project_id?: string
          scanner_url?: string
          secret_env_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_scanners_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          atlas_mode: string
          color: string
          created_at: string
          execution_paused: boolean
          id: string
          name: string
          owner_id: string
          paused_at: string | null
          paused_reason: string | null
          settings: Json
          slug: string
        }
        Insert: {
          atlas_mode?: string
          color?: string
          created_at?: string
          execution_paused?: boolean
          id?: string
          name: string
          owner_id: string
          paused_at?: string | null
          paused_reason?: string | null
          settings?: Json
          slug: string
        }
        Update: {
          atlas_mode?: string
          color?: string
          created_at?: string
          execution_paused?: boolean
          id?: string
          name?: string
          owner_id?: string
          paused_at?: string | null
          paused_reason?: string | null
          settings?: Json
          slug?: string
        }
        Relationships: []
      }
      revenue_events: {
        Row: {
          amount_sek: number
          created_at: string
          currency: string
          description: string | null
          id: string
          occurred_at: string
          project_id: string
          source: string | null
        }
        Insert: {
          amount_sek: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          occurred_at?: string
          project_id: string
          source?: string | null
        }
        Update: {
          amount_sek?: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          occurred_at?: string
          project_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_snapshots: {
        Row: {
          active_subscribers: number | null
          captured_at: string
          churned_this_month: number | null
          currency: string | null
          id: string
          mrr_sek: number | null
          new_subscribers: number | null
          project_id: string | null
          raw: Json | null
          revenue_month_sek: number | null
          snapshot_date: string
          trialing: number | null
        }
        Insert: {
          active_subscribers?: number | null
          captured_at?: string
          churned_this_month?: number | null
          currency?: string | null
          id?: string
          mrr_sek?: number | null
          new_subscribers?: number | null
          project_id?: string | null
          raw?: Json | null
          revenue_month_sek?: number | null
          snapshot_date?: string
          trialing?: number | null
        }
        Update: {
          active_subscribers?: number | null
          captured_at?: string
          churned_this_month?: number | null
          currency?: string | null
          id?: string
          mrr_sek?: number | null
          new_subscribers?: number | null
          project_id?: string | null
          raw?: Json | null
          revenue_month_sek?: number | null
          snapshot_date?: string
          trialing?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      run_logs: {
        Row: {
          content: string
          created_at: string
          duration_ms: number | null
          id: string
          role: string
          run_id: string
          step_name: string | null
          step_order: number | null
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          content: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          role: string
          run_id: string
          step_name?: string | null
          step_order?: number | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          role?: string
          run_id?: string
          step_name?: string | null
          step_order?: number | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "run_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          action_class: string | null
          action_kind: string | null
          action_outcome: string | null
          action_phase: string | null
          attempt_group: string | null
          attempts: number
          authorization_id: string | null
          authorized_at: string | null
          cancel_reason: string | null
          cancel_requested: boolean
          cancelled_by: string | null
          claim_id: string | null
          claimed_at: string | null
          context: Json
          created_at: string
          dispatch_started_at: string | null
          error: string | null
          error_history: Json
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input: Json
          kind: string | null
          last_error: string | null
          lease_until: string | null
          max_attempts: number
          outcome_recorded_at: string | null
          policy_class: string | null
          project_id: string
          reconciliation_reason: string | null
          reconciliation_required: boolean
          remote_confirmed_at: string | null
          remote_operation_id: string | null
          side_effect_summary: Json | null
          started_at: string | null
          status: string
          steps_snapshot: Json | null
          target_version_hash: string | null
          workflow_def_hash: string | null
          workflow_from_state: string | null
          workflow_id: string | null
          workflow_instance_id: string | null
        }
        Insert: {
          action_class?: string | null
          action_kind?: string | null
          action_outcome?: string | null
          action_phase?: string | null
          attempt_group?: string | null
          attempts?: number
          authorization_id?: string | null
          authorized_at?: string | null
          cancel_reason?: string | null
          cancel_requested?: boolean
          cancelled_by?: string | null
          claim_id?: string | null
          claimed_at?: string | null
          context?: Json
          created_at?: string
          dispatch_started_at?: string | null
          error?: string | null
          error_history?: Json
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          input?: Json
          kind?: string | null
          last_error?: string | null
          lease_until?: string | null
          max_attempts?: number
          outcome_recorded_at?: string | null
          policy_class?: string | null
          project_id: string
          reconciliation_reason?: string | null
          reconciliation_required?: boolean
          remote_confirmed_at?: string | null
          remote_operation_id?: string | null
          side_effect_summary?: Json | null
          started_at?: string | null
          status?: string
          steps_snapshot?: Json | null
          target_version_hash?: string | null
          workflow_def_hash?: string | null
          workflow_from_state?: string | null
          workflow_id?: string | null
          workflow_instance_id?: string | null
        }
        Update: {
          action_class?: string | null
          action_kind?: string | null
          action_outcome?: string | null
          action_phase?: string | null
          attempt_group?: string | null
          attempts?: number
          authorization_id?: string | null
          authorized_at?: string | null
          cancel_reason?: string | null
          cancel_requested?: boolean
          cancelled_by?: string | null
          claim_id?: string | null
          claimed_at?: string | null
          context?: Json
          created_at?: string
          dispatch_started_at?: string | null
          error?: string | null
          error_history?: Json
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          input?: Json
          kind?: string | null
          last_error?: string | null
          lease_until?: string | null
          max_attempts?: number
          outcome_recorded_at?: string | null
          policy_class?: string | null
          project_id?: string
          reconciliation_reason?: string | null
          reconciliation_required?: boolean
          remote_confirmed_at?: string | null
          remote_operation_id?: string | null
          side_effect_summary?: Json | null
          started_at?: string | null
          status?: string
          steps_snapshot?: Json | null
          target_version_hash?: string | null
          workflow_def_hash?: string | null
          workflow_from_state?: string | null
          workflow_id?: string | null
          workflow_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_workflow_instance_id_fkey"
            columns: ["workflow_instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      spend_reservations: {
        Row: {
          actual_sek: number | null
          created_at: string
          estimated_sek: number
          id: string
          idempotency_key: string | null
          operation: string | null
          project_id: string
          provider: string | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          actual_sek?: number | null
          created_at?: string
          estimated_sek: number
          id?: string
          idempotency_key?: string | null
          operation?: string | null
          project_id: string
          provider?: string | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          actual_sek?: number | null
          created_at?: string
          estimated_sek?: number
          id?: string
          idempotency_key?: string | null
          operation?: string | null
          project_id?: string
          provider?: string | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "spend_reservations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sprints: {
        Row: {
          created_at: string | null
          end_date: string | null
          goal: string | null
          id: string
          name: string
          project_id: string | null
          start_date: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          goal?: string | null
          id?: string
          name: string
          project_id?: string | null
          start_date?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          goal?: string | null
          id?: string
          name?: string
          project_id?: string | null
          start_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      stop_events: {
        Row: {
          actor: string
          created_at: string
          event: string
          id: string
          new_paused: boolean
          previous_paused: boolean
          reason: string | null
          scope_id: string | null
          scope_type: string
        }
        Insert: {
          actor: string
          created_at?: string
          event: string
          id?: string
          new_paused: boolean
          previous_paused: boolean
          reason?: string | null
          scope_id?: string | null
          scope_type: string
        }
        Update: {
          actor?: string
          created_at?: string
          event?: string
          id?: string
          new_paused?: boolean
          previous_paused?: boolean
          reason?: string | null
          scope_id?: string | null
          scope_type?: string
        }
        Relationships: []
      }
      token_health: {
        Row: {
          days_left: number | null
          expires_at: string | null
          last_error: string | null
          last_refreshed_at: string | null
          last_verified_at: string | null
          last_warned_threshold: number | null
          platform: string
          status: string
          updated_at: string
        }
        Insert: {
          days_left?: number | null
          expires_at?: string | null
          last_error?: string | null
          last_refreshed_at?: string | null
          last_verified_at?: string | null
          last_warned_threshold?: number | null
          platform: string
          status?: string
          updated_at?: string
        }
        Update: {
          days_left?: number | null
          expires_at?: string | null
          last_error?: string | null
          last_refreshed_at?: string | null
          last_verified_at?: string | null
          last_warned_threshold?: number | null
          platform?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      website_content: {
        Row: {
          content_type: string
          cost_usd: number | null
          created_at: string
          destination_key: string
          destination_url: string | null
          external_id: string
          generated_by: string | null
          hero_editor_brief: Json | null
          hero_image_prompt: string | null
          hero_image_qa: Json | null
          hero_image_render_input: Json | null
          hero_image_source: string | null
          hero_image_status: string | null
          hero_image_url: string | null
          id: string
          meta: Json | null
          model: string | null
          news_item_id: string | null
          payload: Json
          project_id: string
          publish_error: string | null
          publish_operation: string | null
          published_at: string | null
          qa: Json | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          scheduled_at: string | null
          slug: string | null
          source_kind: string | null
          status: string
          status_reason: string | null
          summary: string | null
          title: string | null
          updated_at: string
          version: number
        }
        Insert: {
          content_type?: string
          cost_usd?: number | null
          created_at?: string
          destination_key?: string
          destination_url?: string | null
          external_id: string
          generated_by?: string | null
          hero_editor_brief?: Json | null
          hero_image_prompt?: string | null
          hero_image_qa?: Json | null
          hero_image_render_input?: Json | null
          hero_image_source?: string | null
          hero_image_status?: string | null
          hero_image_url?: string | null
          id?: string
          meta?: Json | null
          model?: string | null
          news_item_id?: string | null
          payload: Json
          project_id: string
          publish_error?: string | null
          publish_operation?: string | null
          published_at?: string | null
          qa?: Json | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          scheduled_at?: string | null
          slug?: string | null
          source_kind?: string | null
          status?: string
          status_reason?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          content_type?: string
          cost_usd?: number | null
          created_at?: string
          destination_key?: string
          destination_url?: string | null
          external_id?: string
          generated_by?: string | null
          hero_editor_brief?: Json | null
          hero_image_prompt?: string | null
          hero_image_qa?: Json | null
          hero_image_render_input?: Json | null
          hero_image_source?: string | null
          hero_image_status?: string | null
          hero_image_url?: string | null
          id?: string
          meta?: Json | null
          model?: string | null
          news_item_id?: string | null
          payload?: Json
          project_id?: string
          publish_error?: string | null
          publish_operation?: string | null
          published_at?: string | null
          qa?: Json | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          scheduled_at?: string | null
          slug?: string | null
          source_kind?: string | null
          status?: string
          status_reason?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "website_content_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_action_reconciliations: {
        Row: {
          action_kind: string
          authoritative_system: string
          created_at: string
          detail: Json
          id: string
          idempotency_key: string
          observed_at: string
          remote_operation_id: string | null
          result: string
          run_id: string
          target_version_hash: string
          workflow_instance_id: string
        }
        Insert: {
          action_kind: string
          authoritative_system: string
          created_at?: string
          detail?: Json
          id?: string
          idempotency_key: string
          observed_at: string
          remote_operation_id?: string | null
          result: string
          run_id: string
          target_version_hash: string
          workflow_instance_id: string
        }
        Update: {
          action_kind?: string
          authoritative_system?: string
          created_at?: string
          detail?: Json
          id?: string
          idempotency_key?: string
          observed_at?: string
          remote_operation_id?: string | null
          result?: string
          run_id?: string
          target_version_hash?: string
          workflow_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_action_reconciliations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_action_reconciliations_workflow_instance_id_fkey"
            columns: ["workflow_instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_defs: {
        Row: {
          created_at: string
          def_hash: string
          def_key: string
          id: string
          spec: Json
          version: number
        }
        Insert: {
          created_at?: string
          def_hash: string
          def_key: string
          id?: string
          spec: Json
          version: number
        }
        Update: {
          created_at?: string
          def_hash?: string
          def_key?: string
          id?: string
          spec?: Json
          version?: number
        }
        Relationships: []
      }
      workflow_evidence: {
        Row: {
          attestation: Json
          check_key: string
          detail: Json
          id: string
          instance_id: string
          observed_at: string | null
          payload_hash: string | null
          producer: string | null
          producer_type: string | null
          recorded_at: string
          result: string
          source: string
          state: string
          target_hash: string | null
        }
        Insert: {
          attestation?: Json
          check_key: string
          detail?: Json
          id?: string
          instance_id: string
          observed_at?: string | null
          payload_hash?: string | null
          producer?: string | null
          producer_type?: string | null
          recorded_at?: string
          result: string
          source: string
          state: string
          target_hash?: string | null
        }
        Update: {
          attestation?: Json
          check_key?: string
          detail?: Json
          id?: string
          instance_id?: string
          observed_at?: string | null
          payload_hash?: string | null
          producer?: string | null
          producer_type?: string | null
          recorded_at?: string
          result?: string
          source?: string
          state?: string
          target_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_evidence_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_instances: {
        Row: {
          closed_at: string | null
          created_at: string
          current_state: string
          def_hash: string
          def_id: string
          def_key: string
          def_version: number
          id: string
          instance_key: string
          last_tick_at: string | null
          last_tick_outcome: string | null
          project_id: string
          status: string
          wake_at: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          current_state: string
          def_hash: string
          def_id: string
          def_key: string
          def_version: number
          id?: string
          instance_key: string
          last_tick_at?: string | null
          last_tick_outcome?: string | null
          project_id: string
          status?: string
          wake_at?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          current_state?: string
          def_hash?: string
          def_id?: string
          def_key?: string
          def_version?: number
          id?: string
          instance_key?: string
          last_tick_at?: string | null
          last_tick_outcome?: string | null
          project_id?: string
          status?: string
          wake_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_instances_def_fk"
            columns: ["def_id", "def_key", "def_version", "def_hash"]
            isOneToOne: false
            referencedRelation: "workflow_defs"
            referencedColumns: ["id", "def_key", "version", "def_hash"]
          },
          {
            foreignKeyName: "workflow_instances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_transitions: {
        Row: {
          actor: string
          authorization_id: string | null
          evidence_ref: string | null
          from_state: string | null
          id: string
          instance_id: string
          occurred_at: string
          reason: string
          seq: number
          to_state: string
        }
        Insert: {
          actor: string
          authorization_id?: string | null
          evidence_ref?: string | null
          from_state?: string | null
          id?: string
          instance_id: string
          occurred_at?: string
          reason: string
          seq?: never
          to_state: string
        }
        Update: {
          actor?: string
          authorization_id?: string | null
          evidence_ref?: string | null
          from_state?: string | null
          id?: string
          instance_id?: string
          occurred_at?: string
          reason?: string
          seq?: never
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_transitions_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          active: boolean
          created_at: string
          cron_expr: string | null
          description: string | null
          id: string
          name: string
          project_id: string
          side_effect_class: string
          steps: Json
          trigger: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          cron_expr?: string | null
          description?: string | null
          id?: string
          name: string
          project_id: string
          side_effect_class?: string
          steps?: Json
          trigger?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          cron_expr?: string | null
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          side_effect_class?: string
          steps?: Json
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      action_phase_rank: { Args: { p: string }; Returns: number }
      atlas_memory_health: {
        Args: never
        Returns: {
          events_episodic_90d: number
          events_total: number
          events_unconsolidated: number
          last_event_at: string
          last_memory_update_at: string
          memories_active: number
          memories_archived: number
          memories_superseded: number
        }[]
      }
      atlas_recall: {
        Args: {
          p_episodic_days?: number
          p_focus_ids?: string[]
          p_focus_kinds?: string[]
          p_limit?: number
          p_project_ids?: string[]
        }
        Returns: {
          confidence: number
          entity_id: string
          entity_kind: string
          evidence_count: number
          focus_match: boolean
          id: string
          kind: string
          last_seen_at: string
          memory_class: string
          pinned: boolean
          project_id: string
          salience: number
          scope: string
          summary: string
        }[]
      }
      atlas_record_event: {
        Args: {
          p_confidence?: number
          p_content: string
          p_dedupe_key?: string
          p_entity_id?: string
          p_entity_kind?: string
          p_event_type: string
          p_occurred_at?: string
          p_project_id?: string
          p_scope: string
          p_source: string
          p_source_id?: string
          p_structured?: Json
          p_subject?: string
        }
        Returns: string
      }
      budget_headroom: {
        Args: { p_stale_minutes?: number }
        Returns: {
          held_sek: number
          limit_sek: number
          project_id: string
          remaining_sek: number
          scope: string
          slug: string
          spent_sek: number
        }[]
      }
      budget_release: { Args: { p_reservation_id: string }; Returns: number }
      budget_reserve: {
        Args: {
          p_estimated_sek: number
          p_idempotency_key?: string
          p_operation?: string
          p_project_id: string
          p_provider?: string
          p_stale_minutes?: number
        }
        Returns: {
          allowed: boolean
          binding_scope: string
          budget_sek: number
          committed_sek: number
          headroom_sek: number
          reason: string
          reservation_id: string
          reserved_sek: number
        }[]
      }
      budget_scope_state: {
        Args: { p_project_id: string; p_stale_minutes?: number }
        Returns: {
          held_sek: number
          limit_sek: number
          remaining_sek: number
          scope: string
          spent_sek: number
        }[]
      }
      budget_settle: {
        Args: { p_actual_sek?: number; p_reservation_id: string }
        Returns: number
      }
      claim_runs: {
        Args: { p_lease_seconds?: number; p_limit: number }
        Returns: {
          action_class: string | null
          action_kind: string | null
          action_outcome: string | null
          action_phase: string | null
          attempt_group: string | null
          attempts: number
          authorization_id: string | null
          authorized_at: string | null
          cancel_reason: string | null
          cancel_requested: boolean
          cancelled_by: string | null
          claim_id: string | null
          claimed_at: string | null
          context: Json
          created_at: string
          dispatch_started_at: string | null
          error: string | null
          error_history: Json
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input: Json
          kind: string | null
          last_error: string | null
          lease_until: string | null
          max_attempts: number
          outcome_recorded_at: string | null
          policy_class: string | null
          project_id: string
          reconciliation_reason: string | null
          reconciliation_required: boolean
          remote_confirmed_at: string | null
          remote_operation_id: string | null
          side_effect_summary: Json | null
          started_at: string | null
          status: string
          steps_snapshot: Json | null
          target_version_hash: string | null
          workflow_def_hash: string | null
          workflow_from_state: string | null
          workflow_id: string | null
          workflow_instance_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cron_job_status: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          last_run: string
          last_status: string
          schedule: string
        }[]
      }
      omnira_applied_migrations: { Args: never; Returns: string[] }
      request_run_cancel: {
        Args: {
          p_actor?: string
          p_project_id: string
          p_reason?: string
          p_run_id: string
        }
        Returns: number
      }
      stop_set_platform_automation: {
        Args: { p_actor: string; p_paused: boolean; p_reason?: string }
        Returns: {
          changed: boolean
          event_id: string
          new_paused: boolean
          previous_paused: boolean
        }[]
      }
      stop_set_project_execution: {
        Args: {
          p_actor: string
          p_paused: boolean
          p_project_id: string
          p_reason?: string
        }
        Returns: {
          changed: boolean
          event_id: string
          new_paused: boolean
          previous_paused: boolean
        }[]
      }
      stop_state: {
        Args: { p_project_id?: string }
        Returns: {
          global_paused: boolean
          global_paused_at: string
          global_paused_reason: string
          project_found: boolean
          project_paused: boolean
          project_paused_at: string
          project_paused_reason: string
          project_requested: boolean
        }[]
      }
      workflow_append_transition: {
        Args: {
          p_actor: string
          p_authorization_id?: string
          p_evidence_ref?: string
          p_from_state: string
          p_instance_id: string
          p_reason: string
          p_to_state: string
        }
        Returns: {
          actor: string
          authorization_id: string | null
          evidence_ref: string | null
          from_state: string | null
          id: string
          instance_id: string
          occurred_at: string
          reason: string
          seq: number
          to_state: string
        }
        SetofOptions: {
          from: "*"
          to: "workflow_transitions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      workflow_claim_due: {
        Args: { p_limit?: number; p_visibility_seconds?: number }
        Returns: {
          closed_at: string | null
          created_at: string
          current_state: string
          def_hash: string
          def_id: string
          def_key: string
          def_version: number
          id: string
          instance_key: string
          last_tick_at: string | null
          last_tick_outcome: string | null
          project_id: string
          status: string
          wake_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "workflow_instances"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      workflow_clear_wake: {
        Args: { p_actor: string; p_instance_id: string; p_reason: string }
        Returns: {
          closed_at: string | null
          created_at: string
          current_state: string
          def_hash: string
          def_id: string
          def_key: string
          def_version: number
          id: string
          instance_key: string
          last_tick_at: string | null
          last_tick_outcome: string | null
          project_id: string
          status: string
          wake_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "workflow_instances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      workflow_instantiate: {
        Args: {
          p_actor: string
          p_def_id: string
          p_initial_state: string
          p_instance_key: string
          p_project_id: string
          p_reason: string
        }
        Returns: {
          closed_at: string | null
          created_at: string
          current_state: string
          def_hash: string
          def_id: string
          def_key: string
          def_version: number
          id: string
          instance_key: string
          last_tick_at: string | null
          last_tick_outcome: string | null
          project_id: string
          status: string
          wake_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "workflow_instances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      workflow_projection_drift: {
        Args: never
        Returns: {
          derived: string
          instance_id: string
          projected: string
        }[]
      }
      workflow_rearm: {
        Args: { p_authorization_id: string; p_instance_id: string }
        Returns: number
      }
      workflow_record_tick: {
        Args: {
          p_detail?: Json
          p_instance_id: string
          p_next_wake_at?: string
          p_outcome: string
        }
        Returns: undefined
      }
      workflow_schedule_wake: {
        Args: {
          p_actor: string
          p_instance_id: string
          p_reason: string
          p_wake_at: string
        }
        Returns: {
          closed_at: string | null
          created_at: string
          current_state: string
          def_hash: string
          def_id: string
          def_key: string
          def_version: number
          id: string
          instance_key: string
          last_tick_at: string | null
          last_tick_outcome: string | null
          project_id: string
          status: string
          wake_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "workflow_instances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
