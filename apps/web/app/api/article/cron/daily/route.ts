/**
 * GET /api/article/cron/daily – The Prompt daily editorial planning only.
 *
 * Vercel Cron at 07:55 UTC. No models, no publisher, no database writes.
 * A separate release with project-scoped autonomy, evidence QA, real
 * Bedrock production OIDC role, budget/STOP and consent is required to
 * turn candidate plans into daily live articles.
 */
import { planTodaysPromptArticles } from '@/lib/article/daily/inventory'
import { buildEditorialHandoff } from '@/lib/article/daily/agent-blueprint'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return json(401, { ok: false, reason: 'unauthorized' })
  }
  // Explicit opt-in for the non-billable inventory only. This is OFF in
  // Production, Preview and local unless the environment is configured.
  if (process.env.DAILY_ARTICLE_PLANNER_ENABLED !== 'true') {
    return json(200, {
      ok: true, status: 'disabled', mode: 'prepare_only',
      modelInvoked: false, spent: false, published: false,
    })
  }
  const result = await planTodaysPromptArticles(new Date().toISOString())
  if (!result.ok) {
    return json(503, { ok: false, reason: result.reason, published: false, modelInvoked: false })
  }
  const agentHandoff = buildEditorialHandoff(result.plan)
  return json(200, {
    ok: true, status: 'planned', mode: 'prepare_only',
    projectId: result.plan.projectId,
    generatedAt: result.plan.generatedAt,
    counts: result.plan.counts,
    candidates: result.plan.candidates,
    agentRoles: agentHandoff.roles.map(r => ({ role: r.role, state: r.status, canInvokeModel: false, canPublish: false })),
    publicationDecision: agentHandoff.publicationDecision,
    modelInvoked: false, spent: false, published: false,
    // Never claim this process updates the website. It is an input to the
    // approval-gated editorial generation and publishing spine.
  })
}
