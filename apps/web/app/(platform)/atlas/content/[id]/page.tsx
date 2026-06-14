/**
 * Atlas → Content Center → detail  (System A — read-only)
 *
 * Shows the full generated content + QA report + metadata for one website_content
 * row. Read-only: no approve/reject/publish (Step 5). System A only.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { OSPage, ViewSelectionSync } from '@/components/platform/os'
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react'
import { ReviewActions } from './ReviewActions'
import { HeroImageActions } from './HeroImageActions'

export const dynamic = 'force-dynamic'

type AnyDb = any

function fmtCost(n: number | null): string {
  return n == null ? '—' : `$${Number(n).toFixed(4)}`
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('sv-SE') : '—'
}

export default async function ContentDetail({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db: AnyDb = createAdminClient()
  const { data: row } = await db
    .from('website_content')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (!row) notFound()

  const payload = (row.payload ?? {}) as Record<string, any>
  const qa = (row.qa ?? {}) as Record<string, any>
  const meta = (row.meta ?? {}) as Record<string, any>
  const body: string = typeof payload.body === 'string' ? payload.body : ''
  const issues: string[] = Array.isArray(qa.issues) ? qa.issues : []

  const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between gap-4 py-1.5 border-b border-zinc-800/60 text-xs">
      <span className="text-secondary">{label}</span>
      <span className="text-zinc-200 text-right break-words">{value}</span>
    </div>
  )

  return (
    <OSPage density="spacious">
      {/* Atlas selection awareness — the open record IS the operator's selection. */}
      <ViewSelectionSync refs={[{ domain: 'website_content', id: row.id, label: row.title ?? '(untitled)' }]} />
      <Link href="/atlas/content" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="w-3.5 h-3.5" /> Content Center
      </Link>

      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{row.content_type}</span>
          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">{row.status}</span>
        </div>
        <h1 className="text-xl font-semibold text-zinc-100">{row.title ?? '(untitled)'}</h1>
        {row.summary && <p className="text-sm text-zinc-400 max-w-3xl">{row.summary}</p>}
      </header>

      {row.status === 'pending_review' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <HeroImageActions
            id={row.id}
            heroImageUrl={row.hero_image_url ?? null}
            heroImagePrompt={row.hero_image_prompt ?? null}
            heroImageStatus={row.hero_image_status ?? null}
            heroImageQa={(row.hero_image_qa ?? null) as Record<string, unknown> | null}
          />
          <ReviewActions id={row.id} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* QA report */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-xs font-mono uppercase tracking-wide text-secondary mb-3">QA Report</h2>
          <div className="flex items-center gap-2 mb-3">
            {qa.pass === true ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
            <span className={qa.pass === true ? 'text-emerald-400 text-sm font-medium' : 'text-rose-400 text-sm font-medium'}>
              {qa.pass === true ? 'PASS' : qa.pass === false ? 'FAIL' : '—'}
            </span>
            <span className="text-xs text-secondary">· confidence {qa.confidence ?? '—'}</span>
          </div>
          <Stat label="Slop score" value={qa.slop?.score ?? '—'} />
          <Stat label="Copy overlap" value={qa.copyOverlap?.ratio ?? '—'} />
          <Stat label="Structural" value={qa.structuralOk === true ? 'ok' : qa.structuralOk === false ? 'fail' : '—'} />
          <div className="mt-3">
            <p className="text-[11px] text-secondary mb-1">Issues ({issues.length})</p>
            {issues.length === 0 ? (
              <p className="text-xs text-meta italic">None</p>
            ) : (
              <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-300/90">
                {issues.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            )}
          </div>
        </section>

        {/* Metadata */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-xs font-mono uppercase tracking-wide text-secondary mb-3">Generation Metadata</h2>
          <Stat label="Model" value={row.model ?? meta.model ?? '—'} />
          <Stat label="Cost" value={fmtCost(row.cost_usd ?? meta.estCostUsd ?? null)} />
          <Stat label="Tokens in" value={meta.tokensIn ?? '—'} />
          <Stat label="Tokens out" value={meta.tokensOut ?? '—'} />
          <Stat label="Grounding" value={meta.grounding ?? '—'} />
          <Stat label="Tier" value={meta.tier ?? '—'} />
          <Stat label="Words" value={meta.bodyWordCount ?? '—'} />
          <Stat label="Generated by" value={row.generated_by ?? '—'} />
          <Stat label="Created" value={fmtDate(row.created_at)} />
        </section>

        {/* Workflow / destination */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-xs font-mono uppercase tracking-wide text-secondary mb-3">Workflow</h2>
          <Stat label="Status" value={row.status} />
          <Stat label="Status reason" value={row.status_reason ?? '—'} />
          <Stat label="External ID" value={<span className="font-mono text-[10px]">{row.external_id}</span>} />
          <Stat label="Reviewed at" value={fmtDate(row.reviewed_at)} />
          <Stat label="Published at" value={fmtDate(row.published_at)} />
          <Stat label="Destination" value={row.destination_url ?? '— (not published)'} />
        </section>
      </div>

      {/* Article body */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-xs font-mono uppercase tracking-wide text-secondary mb-3">Article Body</h2>
        {body ? (
          <pre className="text-sm text-zinc-300 whitespace-pre-wrap break-words leading-relaxed font-sans max-w-3xl">{body}</pre>
        ) : (
          <p className="text-xs text-meta italic">No body content.</p>
        )}
      </section>
    </OSPage>
  )
}
