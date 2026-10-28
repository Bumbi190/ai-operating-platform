import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck, ShieldAlert, FileText, ArrowLeft, ExternalLink, Clock } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProjectBySlug } from '@/lib/project/get-project'
import { recognizeSource } from '@/lib/media/factcheck/source-collector'

/**
 * Private project-scoped FactCheck REPORT HISTORY. It does not publish,
 * approve, trigger a provider, or write anything.
 *
 * getProjectBySlug is RLS-respecting: a user must already be permitted to see
 * this project before we use the service-role client for a narrow SELECT.
 * A missing migration is shown as unavailable, not as a fabricated empty run.
 */
export const dynamic = 'force-dynamic'

type SourceReceipt = {
  sourceId: string
  url: string
  publisherGroup: string
  textSha256: string
}
type ClaimFinding = {
  unitId: string
  exactText: string
  verdict: string
  explanation: string
  evidence: { sourceId: string; exactQuote: string }[]
}
type OwnerDecisionRow = {
  id: string
  report_id: string
  project_id: string
  script_id: string
  script_version: number
  revision_id: string
  content_sha256: string
  source_set_sha256: string
  decision: 'approve' | 'reject'
  notes: string
  decided_by: string
  decided_at: string
}
type ReviewHistoryRow = {
  id: string
  script_id: string
  script_version: number
  revision_id: string
  content_sha256: string
  source_set_sha256: string | null
  writer_model: string
  reviewer_model: string
  risk_tier: string
  outcome: string
  framing: string
  framing_reason: string
  reasons: string[]
  manuscript_snapshot: unknown
  source_receipts: unknown
  findings: unknown
  reviewed_at: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function formatTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Okänd tidpunkt'
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Stockholm',
  }).format(d)
}

function sourceReceipts(value: unknown): SourceReceipt[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 4).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const obj = entry as Record<string, unknown>
    const recognized = recognizeSource(obj.url)
    if (!recognized || recognized.group !== obj.publisherGroup ||
        typeof obj.sourceId !== 'string' || typeof obj.textSha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(obj.textSha256)) return []
    return [{
      sourceId: obj.sourceId, url: recognized.url,
      publisherGroup: recognized.group, textSha256: obj.textSha256,
    }]
  })
}

function claimFindings(value: unknown): ClaimFinding[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 60).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const obj = entry as Record<string, unknown>
    if (typeof obj.unitId !== 'string' ||
        typeof obj.exactText !== 'string' ||
        typeof obj.verdict !== 'string' ||
        typeof obj.explanation !== 'string') return []
    const evidence = Array.isArray(obj.evidence)
      ? obj.evidence.slice(0, 6).flatMap((item: unknown) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const e = item as Record<string, unknown>
        return typeof e.sourceId === 'string' && typeof e.exactQuote === 'string'
          ? [{sourceId:e.sourceId, exactQuote:e.exactQuote.slice(0,500)}]
          : []
      }) : []
    return [{
      unitId:obj.unitId,
      exactText:obj.exactText.slice(0,1500),
      verdict:obj.verdict,
      explanation:obj.explanation.slice(0,1200),
      evidence,
    }]
  })
}

function decisionView(outcome: string): {label: string; className: string} {
  switch (outcome) {
    case 'ready_for_editor':
      return {label:'Redo för redaktionell granskning',
        className:'border-amber-400/30 bg-amber-400/10 text-amber-300'}
    case 'rejected':
      return {label:'Stoppad – motsägelser eller vinkling',
        className:'border-red-400/30 bg-red-400/10 text-red-300'}
    default:
      return {label:'Kräver granskning',
        className:'border-orange-400/30 bg-orange-400/10 text-orange-300'}
  }
}

export default async function FactCheckHistoryPage({ params }: {
  params: { slug: string }
}) {
  // The same layout also applies this RLS-backed tenant check. Repeat it here
  // before opening a service-role client: the route must be safe standalone.
  const project = await getProjectBySlug(params.slug)
  if (!project || project.slug !== 'ai-media-automation') notFound()

  // The table is a deliberately private ledger: anon/authenticated have zero
  // SELECT grants. An authorized server-side read is always project-scoped.
  // Its Database type is generated from current production (without the draft
  // table); the cast changes TS discovery only, never grants DB permission.
  const db = createAdminClient() as unknown as SupabaseClient
  const { data, error } = await db.from('media_factcheck_reports')
    .select(
      'id,script_id,script_version,revision_id,content_sha256,source_set_sha256,writer_model,reviewer_model,risk_tier,outcome,framing,framing_reason,reasons,manuscript_snapshot,source_receipts,findings,reviewed_at'
    )
    .eq('project_id', project.id)
    .order('reviewed_at', { ascending: false })
    .limit(25)

  if (error) console.warn('[factcheck/history] report ledger unavailable:', error.code)
  const reports = error ? [] : (data ?? []) as unknown as ReviewHistoryRow[]

  // A FactCheck report is only an AI/evidence finding. The owner's decision
  // is stored separately and must never be inferred from ready_for_editor.
  // The proposal is not deployed, so this read may legitimately be unavailable.
  let decisionsUnavailable = false
  let verifiedOwnerId: string | null = null
  let decisions: OwnerDecisionRow[] = []
  if (!error && reports.length > 0) {
    // getProjectBySlug intentionally does not expose the owner_id field.
    // Fetch it via a narrowly scoped admin read AFTER the RLS project check.
    const ownerResult = await db.from('projects').select('owner_id')
      .eq('id', project.id).maybeSingle()
    if (ownerResult.error || typeof ownerResult.data?.owner_id !== 'string') {
      decisionsUnavailable = true
    } else {
      verifiedOwnerId = ownerResult.data.owner_id
      const result = await db.from('media_factcheck_editorial_decisions')
        .select(
          'id,report_id,project_id,script_id,script_version,revision_id,content_sha256,source_set_sha256,decision,notes,decided_by,decided_at'
        )
        .eq('project_id', project.id)
        .in('report_id', reports.map(report => report.id))
        .order('decided_at', { ascending: false })
        .limit(25)
      if (result.error) {
        decisionsUnavailable = true
        console.warn('[factcheck/history] decision ledger unavailable:', result.error.code)
      } else {
        decisions = (result.data ?? []) as unknown as OwnerDecisionRow[]
      }
    }
  }
  const decisionByReport = new Map<string, OwnerDecisionRow>()
  for (const decision of decisions) {
    const report = reports.find(r => r.id === decision.report_id)
    if (!report || decision.project_id !== project.id ||
        decision.script_id !== report.script_id ||
        decision.script_version !== report.script_version ||
        decision.revision_id !== report.revision_id ||
        decision.content_sha256 !== report.content_sha256 ||
        decision.source_set_sha256 !== report.source_set_sha256 ||
        !['approve','reject'].includes(decision.decision) ||
        typeof decision.notes !== 'string' ||
        typeof decision.decided_by !== 'string' ||
        !verifiedOwnerId || decision.decided_by !== verifiedOwnerId) continue
    if (!decisionByReport.has(report.id)) {
      decisionByReport.set(report.id, decision)
    }
  }

  return (
    <main className="min-h-screen px-5 py-7 md:px-10 md:py-10 space-y-6">
      <header className="space-y-3">
        <Link href={'/projects/' + project.slug + '/media'}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          The Prompt – medieöversikt
        </Link>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-indigo-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">FactCheck – granskningshistorik</h1>
            <p className="text-sm text-muted-foreground">
              Källa för källa, påstående för påstående, knutet till en specifik manusversion.
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3">
        <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
        <div className="text-sm space-y-1">
          <p className="font-semibold text-amber-200">Granskning är inte samma sak som publicering</p>
          <p className="text-muted-foreground">
            En automatisk kontroll kan bara föreslå att en nyhet går vidare till redaktören.
            Den här sidan är skrivskyddad och aktiverar varken AI-kostnader, video eller social publicering.
            En faktarapport visas aldrig som mänskligt godkänd utan en separat, verifierad beslutsrad.
          </p>
        </div>
      </section>

      {error ? (
        <section className="rounded-xl border border-border p-6 space-y-2">
          <h2 className="font-semibold">Rapportlagring är ännu inte tillgänglig</h2>
          <p className="text-sm text-muted-foreground">
            Faktagranskningens databasmigrering är inte installerad eller läsningen misslyckades.
            Vi visar därför inte några påhittade eller ofullständiga granskningsresultat.
          </p>
        </section>
      ) : reports.length === 0 ? (
        <section className="rounded-xl border border-border p-6 space-y-2">
          <h2 className="font-semibold">Inga sparade faktagranskningar ännu</h2>
          <p className="text-sm text-muted-foreground">
            Historiken blir synlig här när en verifierad, projektspecifik granskningsrapport sparats.
            Befintliga kvalitetsbetyg på manus räknas inte som faktagranskningar.
          </p>
        </section>
      ) : (
        <section className="space-y-4" aria-label="Granskningsrapporter">
          <p className="text-xs text-muted-foreground">De {reports.length} senaste rapporterna för The Prompt</p>
          {reports.map(report => {
            const status = decisionView(report.outcome)
            const ownerDecision = decisionByReport.get(report.id)
            const sources = sourceReceipts(report.source_receipts)
            const findings = claimFindings(report.findings)
            const manuscript = report.manuscript_snapshot &&
              typeof report.manuscript_snapshot === 'object' &&
              !Array.isArray(report.manuscript_snapshot)
                ? report.manuscript_snapshot as Record<string,unknown>
                : {}
            const reasonList = Array.isArray(report.reasons)
              ? report.reasons.filter((item): item is string => typeof item === 'string')
              : []

            return (
              <article key={report.id}
                className="rounded-2xl border border-border bg-card/70 overflow-hidden">
                <div className="p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={'inline-flex border rounded-full px-3 py-1 text-xs font-semibold ' +
                      status.className}>
                      {status.label}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      {formatTime(report.reviewed_at)}
                    </span>
                  </div>
                  <h2 className="font-semibold text-lg">{text(manuscript.hook) || 'Manus utan rubrik'}</h2>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    <span>Version {report.script_version}</span>
                    <span>Granskare: {report.reviewer_model}</span>
                    <span>{sources.length} sparade källhänvisningar</span>
                    <span>{findings.length} granskade textdelar</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{report.framing_reason}</p>
                  <div className="rounded-lg border border-border p-3 space-y-1 text-xs">
                    {decisionsUnavailable ? (
                      <p className="text-amber-300">Redaktionellt beslut kan inte verifieras – granskning krävs</p>
                    ) : !ownerDecision ? (
                      <p className="text-amber-300">Inväntar separat redaktionellt beslut – inte godkänt</p>
                    ) : ownerDecision.decision === 'approve' ? (
                      <>
                        <p className="text-amber-300">Godkänd för vidare förberedelse av projektägaren – inte godkänd för publicering</p>
                        <p className="text-muted-foreground">Beslutat {formatTime(ownerDecision.decided_at)}: {ownerDecision.notes}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-red-300">Redaktionellt avvisad – stoppad</p>
                        <p className="text-muted-foreground">Beslutat {formatTime(ownerDecision.decided_at)}: {ownerDecision.notes}</p>
                      </>
                    )}
                  </div>
                  {reasonList.length > 0 && (
                    <p className="text-sm text-orange-300">
                      Orsak: {reasonList.join(', ')}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {sources.map(source => (
                      <a key={source.sourceId} href={source.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-accent">
                        <ExternalLink className="w-3 h-3" />
                        {source.publisherGroup}
                      </a>
                    ))}
                  </div>
                </div>

                <details className="border-t border-border px-5 py-3 group">
                  <summary className="cursor-pointer text-sm font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Visa påståenden och bevis
                  </summary>
                  <div className="pt-4 space-y-4">
                    {findings.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Inget granskningsextrakt sparat.</p>
                    ) : findings.map((finding, idx) => (
                      <div key={finding.unitId + idx} className="border-l-2 border-border pl-3 space-y-2">
                        <p className="text-sm font-medium">{finding.exactText}</p>
                        <p className="text-xs text-muted-foreground">
                          {finding.verdict} – {finding.explanation}
                        </p>
                        {finding.evidence.map((e, i) => (
                          <blockquote key={e.sourceId + i}
                            className="text-xs text-muted-foreground italic bg-muted/30 rounded px-3 py-2">
                            {e.sourceId}: ”{e.exactQuote}”
                          </blockquote>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              </article>
            )
          })}
        </section>
      )}
    </main>
  )
}
