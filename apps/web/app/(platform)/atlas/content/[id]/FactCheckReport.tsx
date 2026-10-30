/**
 * Read-only FactCheck report for a website_content row produced by the
 * fact-checked article workflow. Deliberately separate from the QA Report:
 * a passing QA is not a fact-check.
 */

import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { publicationGate } from '@/lib/article/factcheck/gate'
import type { CheckedClaim, FactCheckReport as Report } from '@/lib/article/factcheck/types'

const VERDICT_STYLE: Record<string, string> = {
  supported: 'text-emerald-400',
  uncertain: 'text-amber-300',
  unsupported: 'text-rose-400',
  contradicted: 'text-rose-400',
}

export function FactCheckReport({ row }: { row: { payload: unknown; qa: unknown; meta: unknown } }) {
  const meta = (row.meta ?? {}) as { factcheck_required?: boolean; factcheck?: Report; source_log?: string[]; job_cost_usd?: number }
  if (meta.factcheck_required !== true) return null
  const report = meta.factcheck
  const gate = publicationGate(row)
  const sourcesById = new Map((report?.sources ?? []).map((s) => [s.id, s]))

  return (
    <section className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
      <h2 className="text-xs font-mono uppercase tracking-wide text-secondary">FactCheck Report</h2>
      <div className="flex flex-wrap items-center gap-2">
        {gate.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
        <span className={gate.ok ? 'text-emerald-400 text-sm font-medium' : 'text-rose-400 text-sm font-medium'}>
          {gate.ok ? 'Publishable after your approval' : `Blocked: ${gate.reason}`}
        </span>
        {report && (
          <span className="text-xs text-secondary">
            · verdict {report.verdict} · round {report.round} · {report.counts.supported} supported,{' '}
            {report.counts.uncertain} uncertain, {report.counts.unsupported} unsupported,{' '}
            {report.counts.contradicted} contradicted
          </span>
        )}
      </div>
      {report && report.reasons.length > 0 && (
        <ul className="list-disc list-inside text-xs text-amber-300/90 space-y-0.5">
          {report.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      {report && (
        <div>
          <p className="text-[11px] text-secondary mb-1">Sources ({report.sources.length})</p>
          <ul className="text-xs space-y-0.5">
            {report.sources.map((s) => (
              <li key={s.id} className="break-all">
                <span className="font-mono text-[10px] text-secondary">{s.id}</span>{' '}
                <span className="text-muted-foreground">[{s.kind} · {s.publisherGroup}]</span>{' '}
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="underline">{s.title || s.url}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report && report.claims.length > 0 && (
        <div>
          <p className="text-[11px] text-secondary mb-1">Claims ({report.claims.length})</p>
          <ol className="space-y-2">
            {report.claims.map((c: CheckedClaim) => (
              <li key={c.id} className="text-xs border-l-2 border-border pl-2">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className={`font-mono uppercase text-[10px] ${VERDICT_STYLE[c.verdict] ?? ''}`}>{c.verdict}</span>
                  <span className="font-mono text-[10px] text-secondary">{c.field ?? 'body'} · {c.importance}</span>
                  {c.publisherGroups.length > 0 && (
                    <span className="text-[10px] text-secondary">sources: {c.publisherGroups.join(', ')}{c.hasPrimarySource ? ' · primary' : ''}</span>
                  )}
                  {c.downgrades.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
                      <AlertTriangle className="w-3 h-3" />{c.downgrades.join(', ')}
                    </span>
                  )}
                </div>
                <p className="text-foreground mt-0.5">{c.sentence}</p>
                {c.note && <p className="text-muted-foreground italic">{c.note}</p>}
                {c.evidence.map((e, i) => (
                  <blockquote key={i} className="mt-0.5 text-muted-foreground">
                    “{e.exactQuote}” — {sourcesById.get(e.sourceId)?.host ?? e.sourceId}
                  </blockquote>
                ))}
              </li>
            ))}
          </ol>
        </div>
      )}

      {Array.isArray(meta.source_log) && meta.source_log.length > 0 && (
        <details className="text-[11px] text-secondary">
          <summary>Source collection log</summary>
          <ul className="mt-1 space-y-0.5 font-mono">{meta.source_log.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </details>
      )}
    </section>
  )
}
