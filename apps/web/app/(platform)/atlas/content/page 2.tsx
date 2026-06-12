/**
 * Atlas → Content Center  (System A — Website Content Engine)
 *
 * Read-only editorial queue. Reads ONLY from `website_content`. Atlas is the
 * authoritative editorial system of record; The Prompt website is destination-only.
 *
 * Strict System A: no media_scripts, no social tables, no approvals queue.
 * No approve/reject/publish actions here — those are Step 5.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { OSPage, ViewVisibleSync } from '@/components/platform/os'
import { Newspaper, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

type AnyDb = any

interface ContentRow {
  id: string
  title: string | null
  content_type: string
  status: string
  model: string | null
  cost_usd: number | null
  created_at: string
  destination_url: string | null
  summary: string | null
  qa: { pass?: boolean; confidence?: string; issues?: unknown[] } | null
}

const GROUPS = [
  { key: 'pending_review', label: 'Pending Review', highlight: true },
  { key: 'approved',       label: 'Approved',       highlight: false },
  { key: 'published',      label: 'Published',       highlight: false },
  { key: 'rejected',       label: 'Rejected',        highlight: false },
] as const

function fmtCost(n: number | null): string {
  return n == null ? '—' : `$${Number(n).toFixed(3)}`
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE')
}
function qaPass(qa: ContentRow['qa']): { label: string; ok: boolean | null } {
  if (qa?.pass === true) return { label: 'PASS', ok: true }
  if (qa?.pass === false) return { label: 'FAIL', ok: false }
  return { label: '—', ok: null }
}
function qaIssuesCount(qa: ContentRow['qa']): number {
  return Array.isArray(qa?.issues) ? qa!.issues!.length : 0
}

export default async function ContentCenter() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db: AnyDb = createAdminClient()
  const safe = async <T,>(p: Promise<{ data: T | null }>, fb: T): Promise<T> => {
    try { const { data } = await p; return data ?? fb } catch { return fb }
  }

  // System A ONLY.
  const rows = await safe<ContentRow[]>(
    db.from('website_content')
      .select('id, title, content_type, status, model, cost_usd, created_at, destination_url, summary, qa')
      .order('created_at', { ascending: false })
      .limit(200),
    [],
  )

  const byStatus = (s: string) => rows.filter(r => r.status === s)
  const pendingCount = byStatus('pending_review').length

  // Atlas view awareness — publish the content rows on screen (queue order).
  const visibleRefs = rows.slice(0, 12).map(r => ({
    domain: 'website_content', id: r.id, label: r.title ?? `(${r.content_type})`,
  }))

  return (
    <OSPage>
      <ViewVisibleSync refs={visibleRefs} />
      <header className="flex items-center gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400">
          <Newspaper className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Content Center</h1>
          <p className="text-xs text-secondary">
            System A — Website Content · Atlas is the editorial system of record · website is destination-only
            {pendingCount > 0 && <span className="text-amber-400"> · {pendingCount} pending review</span>}
          </p>
        </div>
      </header>

      {GROUPS.map(group => {
        const items = byStatus(group.key)
        return (
          <section key={group.key} className="space-y-2">
            <h2 className="text-xs font-mono uppercase tracking-wide text-secondary">
              {group.label} <span className="text-meta">({items.length})</span>
            </h2>

            {items.length === 0 ? (
              <p className="text-xs text-meta italic px-1">Inga objekt.</p>
            ) : (
              <ul className="space-y-2">
                {items.map(r => {
                  const pass = qaPass(r.qa)
                  const issues = qaIssuesCount(r.qa)
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/atlas/content/${r.id}`}
                        className={[
                          'block rounded-lg border p-3 transition-colors',
                          group.highlight
                            ? 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10'
                            : 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-zinc-100 line-clamp-1">
                            {r.title ?? '(untitled)'}
                          </p>
                          <span className="shrink-0 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                            {r.content_type}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-secondary">
                          <span className="inline-flex items-center gap-1">
                            {pass.ok === true && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                            {pass.ok === false && <XCircle className="w-3 h-3 text-rose-400" />}
                            QA: <span className={pass.ok === true ? 'text-emerald-400' : pass.ok === false ? 'text-rose-400' : ''}>{pass.label}</span>
                          </span>
                          <span>Confidence: <span className="text-zinc-300">{r.qa?.confidence ?? '—'}</span></span>
                          {issues > 0 && (
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              <AlertTriangle className="w-3 h-3" /> {issues} issue{issues === 1 ? '' : 's'}
                            </span>
                          )}
                          <span>Model: <span className="text-zinc-300">{r.model ?? '—'}</span></span>
                          <span>Cost: <span className="text-zinc-300">{fmtCost(r.cost_usd)}</span></span>
                          <span>{fmtDate(r.created_at)}</span>
                          {r.destination_url && (
                            <span className="text-emerald-500/80 truncate max-w-[18rem]">{r.destination_url}</span>
                          )}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </OSPage>
  )
}
