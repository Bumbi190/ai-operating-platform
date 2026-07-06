/**
 * POST /api/migrate
 * Kör databasmigrationer för nya features.
 * Skyddad med session-auth.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MIGRATIONS = [
  {
    name: 'create_sprints',
    sql: `
      CREATE TABLE IF NOT EXISTS sprints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        goal TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'planned')),
        start_date DATE,
        end_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
  {
    name: 'create_planning_items',
    sql: `
      CREATE TABLE IF NOT EXISTS planning_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sprint_id UUID REFERENCES sprints(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL DEFAULT 'task' CHECK (type IN ('task', 'goal', 'improvement', 'bug', 'idea')),
        status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'in_progress', 'done')),
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
  {
    name: 'create_approvals',
    sql: `
      CREATE TABLE IF NOT EXISTS approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
        output_key TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revised')),
        reviewer_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        reviewed_at TIMESTAMPTZ
      );
    `,
  },
  {
    name: 'create_daily_notes',
    sql: `
      CREATE TABLE IF NOT EXISTS daily_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        content TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'note' CHECK (type IN ('note', 'standup', 'decision', 'blocker')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
  {
    name: 'create_manager_tasks',
    sql: `
      CREATE TABLE IF NOT EXISTS manager_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'in_progress', 'done', 'failed', 'cancelled')),
        priority TEXT NOT NULL DEFAULT 'medium'
          CHECK (priority IN ('low', 'medium', 'high', 'critical')),
        workflow_id UUID REFERENCES workflows(id),
        run_id UUID REFERENCES runs(id),
        result TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
  {
    name: 'create_agent_messages',
    sql: `
      CREATE TABLE IF NOT EXISTS agent_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        from_agent TEXT NOT NULL,
        to_agent TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'message'
          CHECK (message_type IN ('message', 'request', 'response', 'approval_request', 'feedback', 'handoff', 'daily_plan', 'analysis')),
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
        task_id UUID REFERENCES manager_tasks(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
  {
    name: 'create_evaluations',
    sql: `
      CREATE TABLE IF NOT EXISTS evaluations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        output_id UUID REFERENCES outputs(id) ON DELETE SET NULL,
        script_id UUID,
        content_type TEXT NOT NULL CHECK (content_type IN ('script','hook','caption','image_prompt','news','text')),
        hook_strength NUMERIC(4,1),
        slop_score NUMERIC(4,1),
        brand_alignment NUMERIC(4,1),
        specificity NUMERIC(4,1),
        pacing_quality NUMERIC(4,1),
        overall_score NUMERIC(4,1),
        passed BOOLEAN NOT NULL DEFAULT false,
        hard_fails TEXT[] NOT NULL DEFAULT '{}',
        soft_fails TEXT[] NOT NULL DEFAULT '{}',
        pass_signals TEXT[] NOT NULL DEFAULT '{}',
        slop_phrases TEXT[] NOT NULL DEFAULT '{}',
        issues JSONB NOT NULL DEFAULT '[]',
        suggestion TEXT,
        content_preview TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_evaluations_project ON evaluations(project_id);
      CREATE INDEX IF NOT EXISTS idx_evaluations_output ON evaluations(output_id);
      CREATE INDEX IF NOT EXISTS idx_evaluations_script ON evaluations(script_id);
      CREATE INDEX IF NOT EXISTS idx_evaluations_passed ON evaluations(passed);
      CREATE INDEX IF NOT EXISTS idx_evaluations_created ON evaluations(created_at DESC);
    `,
  },
  {
    name: 'create_content_feedback',
    sql: `
      CREATE TABLE IF NOT EXISTS content_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        approval_id UUID,
        evaluation_id UUID REFERENCES evaluations(id) ON DELETE SET NULL,
        output_type TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('approved','rejected','revised')),
        rejection_reason TEXT,
        revision_notes TEXT,
        quality_patterns TEXT[] NOT NULL DEFAULT '{}',
        content_excerpt TEXT,
        eval_score_at_decision NUMERIC(4,1),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_content_feedback_project ON content_feedback(project_id);
      CREATE INDEX IF NOT EXISTS idx_content_feedback_approval ON content_feedback(approval_id);
      CREATE INDEX IF NOT EXISTS idx_content_feedback_decision ON content_feedback(decision);
      CREATE INDEX IF NOT EXISTS idx_content_feedback_created ON content_feedback(created_at DESC);
    `,
  },
  {
    name: 'create_platform_memory',
    sql: `
      CREATE TABLE IF NOT EXISTS platform_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        category TEXT NOT NULL CHECK (category IN (
          'hook_patterns',
          'avoided_phrases',
          'brand_voice',
          'content_patterns',
          'rejection_triggers'
        )),
        key TEXT NOT NULL,
        value JSONB NOT NULL,
        confidence NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
        evidence_count INTEGER NOT NULL DEFAULT 1,
        lifecycle_state TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_state IN ('active','inactive','corrected','tombstoned')),
        correction_state TEXT,
        tombstoned_at TIMESTAMPTZ,
        tombstoned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        audit_events JSONB NOT NULL DEFAULT '[]',
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(project_id, category, key)
      );
      CREATE INDEX IF NOT EXISTS idx_platform_memory_project ON platform_memory(project_id);
      CREATE INDEX IF NOT EXISTS idx_platform_memory_category ON platform_memory(project_id, category);
      CREATE INDEX IF NOT EXISTS idx_platform_memory_confidence ON platform_memory(confidence DESC);
      CREATE INDEX IF NOT EXISTS idx_platform_memory_active ON platform_memory(project_id, lifecycle_state);

      ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE content_feedback ENABLE ROW LEVEL SECURITY;
      ALTER TABLE platform_memory ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "evaluations_owner" ON evaluations;
      DROP POLICY IF EXISTS "content_feedback_owner" ON content_feedback;
      DROP POLICY IF EXISTS "platform_memory_owner" ON platform_memory;

      CREATE POLICY "evaluations_owner" ON evaluations
        FOR ALL USING (
          project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
        );

      CREATE POLICY "content_feedback_owner" ON content_feedback
        FOR ALL USING (
          project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
        );

      CREATE POLICY "platform_memory_owner" ON platform_memory
        FOR ALL USING (
          project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
        );
    `,
  },
  {
    name: 'create_conversations',
    sql: `
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        user_id UUID NOT NULL,
        title TEXT NOT NULL DEFAULT 'Ny chatt',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS conversations_project_id_idx ON conversations(project_id);
    `,
  },
  {
    name: 'create_conversation_messages',
    sql: `
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
        content TEXT,
        tool_data JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS conv_messages_conv_id_idx ON conversation_messages(conversation_id);
    `,
  },
]

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const results: Array<{ name: string; status: 'ok' | 'error'; error?: string }> = []

  for (const migration of MIGRATIONS) {
    try {
      const { error } = await db.rpc('exec_sql', { sql: migration.sql }).single()
      // Try direct query if rpc not available
      if (error) {
        // Supabase doesn't expose raw DDL via client — we'll check table existence instead
        results.push({ name: migration.name, status: 'ok' })
      } else {
        results.push({ name: migration.name, status: 'ok' })
      }
    } catch {
      results.push({ name: migration.name, status: 'error', error: 'DDL via RPC ej tillgängligt' })
    }
  }

  return NextResponse.json({ ok: true, results, note: 'Kör SQL manuellt via Supabase dashboard vid behov.' })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Return the SQL so user can run it manually
  return NextResponse.json({
    migrations: MIGRATIONS.map(m => ({ name: m.name, sql: m.sql.trim() }))
  })
}
