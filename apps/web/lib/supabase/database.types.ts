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
          created_at: string | null
          description: string | null
          id: string
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
          workflow_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
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
          workflow_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
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
          workflow_id?: string | null
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
          project_id: string | null
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
          project_id?: string | null
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
          project_id?: string | null
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
          instagram_media_id: string | null
          instagram_url: string | null
          news_item_id: string | null
          pipeline_failed_reason: string | null
          pipeline_next_retry_at: string | null
          project_id: string | null
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
          instagram_media_id?: string | null
          instagram_url?: string | null
          news_item_id?: string | null
          pipeline_failed_reason?: string | null
          pipeline_next_retry_at?: string | null
          project_id?: string | null
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
          instagram_media_id?: string | null
          instagram_url?: string | null
          news_item_id?: string | null
          pipeline_failed_reason?: string | null
          pipeline_next_retry_at?: string | null
          project_id?: string | null
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
          id: number
          max_daily_renders: number
          max_retry_attempts: number
          paused_at: string | null
          paused_reason: string | null
          updated_at: string
        }
        Insert: {
          automation_paused?: boolean
          id?: number
          max_daily_renders?: number
          max_retry_attempts?: number
          paused_at?: string | null
          paused_reason?: string | null
          updated_at?: string
        }
        Update: {
          automation_paused?: boolean
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
          category: string
          confidence: number
          created_at: string
          evidence_count: number
          id: string
          key: string
          last_seen_at: string
          project_id: string
          value: Json
        }
        Insert: {
          category: string
          confidence?: number
          created_at?: string
          evidence_count?: number
          id?: string
          key: string
          last_seen_at?: string
          project_id: string
          value: Json
        }
        Update: {
          category?: string
          confidence?: number
          created_at?: string
          evidence_count?: number
          id?: string
          key?: string
          last_seen_at?: string
          project_id?: string
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
      project_budgets: {
        Row: {
          monthly_sek: number
          project_id: string
          updated_at: string
        }
        Insert: {
          monthly_sek?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          monthly_sek?: number
          project_id?: string
          updated_at?: string
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
          color: string
          created_at: string
          id: string
          name: string
          owner_id: string
          settings: Json
          slug: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
          settings?: Json
          slug: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
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
          attempts: number
          claimed_at: string | null
          context: Json
          created_at: string
          error: string | null
          error_history: Json
          finished_at: string | null
          id: string
          input: Json
          kind: string | null
          last_error: string | null
          lease_until: string | null
          max_attempts: number
          project_id: string
          started_at: string | null
          status: string
          steps_snapshot: Json | null
          workflow_id: string | null
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          context?: Json
          created_at?: string
          error?: string | null
          error_history?: Json
          finished_at?: string | null
          id?: string
          input?: Json
          kind?: string | null
          last_error?: string | null
          lease_until?: string | null
          max_attempts?: number
          project_id: string
          started_at?: string | null
          status?: string
          steps_snapshot?: Json | null
          workflow_id?: string | null
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          context?: Json
          created_at?: string
          error?: string | null
          error_history?: Json
          finished_at?: string | null
          id?: string
          input?: Json
          kind?: string | null
          last_error?: string | null
          lease_until?: string | null
          max_attempts?: number
          project_id?: string
          started_at?: string | null
          status?: string
          steps_snapshot?: Json | null
          workflow_id?: string | null
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
      workflows: {
        Row: {
          active: boolean
          created_at: string
          cron_expr: string | null
          description: string | null
          id: string
          name: string
          project_id: string
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
      claim_runs: {
        Args: { p_lease_seconds?: number; p_limit: number }
        Returns: {
          attempts: number
          claimed_at: string | null
          context: Json
          created_at: string
          error: string | null
          error_history: Json
          finished_at: string | null
          id: string
          input: Json
          kind: string | null
          last_error: string | null
          lease_until: string | null
          max_attempts: number
          project_id: string
          started_at: string | null
          status: string
          workflow_id: string | null
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
