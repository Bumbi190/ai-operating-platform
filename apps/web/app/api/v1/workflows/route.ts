/**
 * GET /api/v1/workflows
 *
 * List all workflows across all projects.
 * Auth: Authorization: Bearer <AIOPS_API_KEY>
 *
 * Response:
 * [
 *   {
 *     "id": "uuid",
 *     "name": "Månadspaket Generator",
 *     "description": "...",
 *     "project_slug": "familje-stunden",
 *     "project_name": "Familje-Stunden",
 *     "step_count": 2,
 *     "input_variables": ["tema", "ålder"]  // extracted from first step
 *   }
 * ]
 */

import { NextResponse } from 'next/server'
import { requireApiKey } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { WorkflowStep } from '@/lib/supabase/types'

export async function GET(request: Request) {
  const auth = requireApiKey(request)
  if (!auth.ok) return auth.response

  const db = createAdminClient()

  const { data: workflows, error } = await db
    .from('workflows')
    .select('id, name, description, steps, projects(name, slug)')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result = (workflows ?? []).map((w) => {
    const steps = (w.steps as WorkflowStep[]) ?? []
    const project = Array.isArray(w.projects) ? w.projects[0] : w.projects

    // Extract {{variable}} names from step input templates
    const inputVars = new Set<string>()
    const firstStep = steps.find((s) => s.order === 1)
    if (firstStep) {
      const matches = firstStep.input_template.matchAll(/\{\{([^}]+)\}\}/g)
      for (const match of matches) inputVars.add(match[1].trim())
    }

    return {
      id: w.id,
      name: w.name,
      description: w.description ?? null,
      project_slug: project?.slug ?? null,
      project_name: project?.name ?? null,
      step_count: steps.length,
      input_variables: [...inputVars],
    }
  })

  return NextResponse.json(result)
}
