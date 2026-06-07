/**
 * GET /api/publishing/smoke
 *
 * M0 proof-of-pipeline. Runs in the Vercel runtime (where THE_PROMPT_* creds live)
 * and exercises the full publishing spine end-to-end against the live destination.
 *
 * Proves, in order:
 *   1. cross-project publish (create)
 *   2. idempotent update (PATCH; slug immutable)
 *   3. scheduled publish (future published_at → status 'scheduled', hidden)
 *   4. publish now (status 'published', visible via anon/RLS if anon key present)
 *   5. unpublish lifecycle (→ draft, hidden)
 *   6. destination-registry abstraction (same code path → mock adapter)
 *
 * Self-cleaning: removes any omnira_smoke_* rows before and after (service role,
 * direct delete; article_tags cascade). Nothing public is left behind.
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 * Optional env: THE_PROMPT_ANON_KEY — enables real anon/RLS visibility checks.
 */

import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { publishArticle, unpublishArticle } from '@/lib/publishing/publish'
import { mockDestination, getDestination } from '@/lib/publishing/registry'
import { createDestinationClient } from '@/lib/publishing/client'
import type { PublishPayload } from '@/lib/publishing/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PREFIX = 'omnira_smoke_'

interface StepResult {
  step: string
  ok: boolean
  detail: string
  data?: unknown
}

function check(step: string, ok: boolean, detail: string, data?: unknown): StepResult {
  return { step, ok, detail, data }
}

export async function GET(request: Request) {
  // ── Auth ──
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: StepResult[] = []
  const ts = Date.now()
  const A = `${PREFIX}${ts}_a`
  const B = `${PREFIX}${ts}_b`

  // Service client for verification reads + cleanup (bypasses RLS).
  let svc: SupabaseClient
  try {
    svc = createDestinationClient({ urlEnv: 'THE_PROMPT_SUPABASE_URL', keyEnv: 'THE_PROMPT_SERVICE_ROLE_KEY' })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e), hint: 'THE_PROMPT_* env missing' },
      { status: 500 },
    )
  }

  // Optional anon client for real RLS visibility checks.
  const anonUrl = process.env.THE_PROMPT_SUPABASE_URL
  const anonKey = process.env.THE_PROMPT_ANON_KEY
  const anon = anonUrl && anonKey ? createClient(anonUrl, anonKey, { auth: { persistSession: false } }) : null

  const anonVisible = async (externalId: string): Promise<boolean> => {
    if (!anon) return false
    const { data } = await anon.from('articles').select('id').eq('external_id', externalId).maybeSingle()
    return Boolean(data)
  }

  // ── Step 0: clean leftovers ──
  await svc.from('articles').delete().like('external_id', `${PREFIX}%`)

  try {
    // ── Step 1: cross-project publish (create, draft) ──
    const draftPayload: PublishPayload = {
      version: 1,
      external_id: A,
      title: 'M0 Smoke Test Article',
      summary: 'Temporary smoke-test article created by the publishing spine.',
      body: '# M0 Smoke Test\n\nThis row is created by `/api/publishing/smoke` and cleaned up automatically.',
      category: { slug: 'news' },
      tags: [{ slug: 'smoke-test' }, { slug: 'omnira' }],
      source: { url: 'https://example.com/m0-smoke', name: 'Example' },
      published_at: null,
    }
    const r1 = await publishArticle('the-prompt', draftPayload)
    results.push(
      check(
        '1. cross-project publish (create)',
        r1.operation === 'created' && r1.status === 'draft' && !!r1.slug && r1.published_url.includes('/articles/'),
        `operation=${r1.operation} status=${r1.status} slug=${r1.slug} url=${r1.published_url}`,
        r1,
      ),
    )
    const firstSlug = r1.slug

    // ── Step 2: idempotent update (PATCH, slug immutable) ──
    const r2 = await publishArticle('the-prompt', {
      version: 1,
      external_id: A,
      title: 'M0 Smoke Test Article (edited)',
    })
    results.push(
      check(
        '2. idempotent update (PATCH)',
        r2.operation === 'updated' && r2.slug === firstSlug && r2.id === r1.id,
        `operation=${r2.operation} slug=${r2.slug} (expected unchanged ${firstSlug}) id-match=${r2.id === r1.id}`,
        r2,
      ),
    )

    // ── Step 3: scheduled publish (future) ──
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const r3 = await publishArticle('the-prompt', {
      version: 1,
      external_id: B,
      title: 'M0 Scheduled Article',
      summary: 'Scheduled smoke-test row.',
      category: { slug: 'news' },
      published_at: future,
    })
    const hiddenWhenScheduled = anon ? !(await anonVisible(B)) : true
    results.push(
      check(
        '3. scheduled publish (future, hidden)',
        r3.status === 'scheduled' && hiddenWhenScheduled,
        `status=${r3.status} anonHidden=${anon ? hiddenWhenScheduled : 'n/a (no anon key)'}`,
        r3,
      ),
    )

    // ── Step 4: publish now (visible) ──
    const past = new Date(Date.now() - 60 * 1000).toISOString()
    const r4 = await publishArticle('the-prompt', {
      version: 1,
      external_id: B,
      published_at: past,
    })
    const visibleWhenPublished = anon ? await anonVisible(B) : true
    results.push(
      check(
        '4. publish now (visible)',
        r4.status === 'published' && visibleWhenPublished,
        `status=${r4.status} anonVisible=${anon ? visibleWhenPublished : 'n/a (no anon key)'}`,
        r4,
      ),
    )

    // ── Step 5: unpublish lifecycle ──
    const r5 = await unpublishArticle('the-prompt', B)
    const hiddenAfterUnpublish = anon ? !(await anonVisible(B)) : true
    results.push(
      check(
        '5. unpublish (→ draft, hidden)',
        r5.found === true && r5.status === 'draft' && hiddenAfterUnpublish,
        `found=${r5.found} status=${r5.status} anonHidden=${anon ? hiddenAfterUnpublish : 'n/a (no anon key)'}`,
        r5,
      ),
    )

    // ── Step 6: registry abstraction (mock via identical code path) ──
    mockDestination.reset()
    const r6 = await publishArticle('mock', { version: 1, external_id: 'mock_demo', title: 'Mock' })
    const routedToMock = mockDestination.calls.some((c) => c.method === 'publish')
    const distinctAdapters = getDestination('the-prompt') !== getDestination('mock')
    results.push(
      check(
        '6. registry abstraction (mock)',
        r6.operation === 'created' && routedToMock && distinctAdapters,
        `mockRecorded=${routedToMock} distinctAdapters=${distinctAdapters}`,
        { calls: mockDestination.calls.length },
      ),
    )
  } catch (e) {
    results.push(check('FATAL', false, e instanceof Error ? `${e.name}: ${e.message}` : String(e)))
  } finally {
    // ── Cleanup ──
    await svc.from('articles').delete().like('external_id', `${PREFIX}%`)
  }

  const passed = results.every((r) => r.ok)
  return NextResponse.json(
    {
      ok: passed,
      summary: `${results.filter((r) => r.ok).length}/${results.length} checks passed`,
      anon_checks: anon ? 'enabled' : 'skipped (set THE_PROMPT_ANON_KEY to enable RLS visibility checks)',
      results,
    },
    { status: passed ? 200 : 500 },
  )
}
