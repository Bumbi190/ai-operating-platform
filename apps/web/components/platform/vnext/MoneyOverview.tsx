/**
 * Pengar — the operator's financial surface.
 *
 * A server component. It renders what `lib/os/money.ts` read and nothing more:
 * no profit, no forecast, no percentage, no progress bar, no "healthy". A figure
 * that was never recorded says so; a figure this surface refuses to derive says
 * so; a source that could not be read says that instead of showing zero.
 *
 * The order is the order an operator asks: what is known, what needs me, what
 * the controls actually do, then the ledger that explains the total. Every limit
 * sits beside the sentence that says whether it is enforced.
 */

import Link from 'next/link'
import { ATLAS_HOME_TIMEZONE } from '@/lib/atlas/utilities/time'
import { destinationBasePath } from '@/lib/nav/registry'
import {
  ADVISORY_NOTE,
  BUDGET_SCOPE_LABELS,
  COST_ESTIMATE_NOTE,
  ENFORCED_NOTE,
  ENFORCEMENT_LABELS,
  GLOBAL_CEILING_MISSING_NOTE,
  GLOBAL_CEILING_UNKNOWN_NOTE,
  GLOBAL_SCOPE_NOTE,
  LEADS_NOTE,
  LEDGER_COMPLETENESS_NOTE,
  LEDGER_WINDOW_LABEL,
  NO_AUTHORITY_NOTE,
  NOT_CALCULATED_LABEL,
  NOT_RECORDED_LABEL,
  PLATFORM_COST_NOTE,
  PRICING_FALLBACK_NOTE,
  PROFIT_NOTE,
  PROFIT_UNRECONCILED_NOTE,
  REVENUE_NOTE,
  REVENUE_RECORDED_NOTE,
  UNBUDGETED_NOTE,
  UNKNOWN_LABEL,
  UNREADABLE_LABEL,
  type ProjectBudgetScope,
} from '@/lib/os/money-shared'
import type {
  AttentionItem,
  CostEntry,
  CostLine,
  MoneyModel,
  MoneyProject,
  MoneySource,
} from '@/lib/os/money'
import styles from './MoneyOverview.module.css'

// ── Presentation only ────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  ideogram: 'Ideogram',
  muapi: 'MuAPI',
}

const providerLabel = (p: string | null) => (p ? PROVIDER_LABELS[p] ?? p : NOT_RECORDED_LABEL)

const SOURCE_LABELS: Record<MoneySource, string> = {
  projects: 'Projekten',
  costs: 'Kostnadsloggen',
  budgets: 'Budgetgrinden',
  revenue: 'Intäktshändelserna',
  leads: 'Leads',
  overrides: 'De rådgivande undantagen',
}

const LIMIT_WORD: Record<ProjectBudgetScope, string> = {
  project_daily: 'Dagsgränsen',
  project_weekly: 'Veckogränsen',
  project_monthly: 'Månadsgränsen',
}

const UNIT_WORD: Record<string, string> = {
  tokens: 'tokens',
  characters: 'tecken',
  images: 'bilder',
  seconds: 'sekunder',
  requests: 'anrop',
}

const SEK = new Intl.NumberFormat('sv-SE', {
  style: 'currency',
  currency: 'SEK',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** The page's own money formatter. Sub-öre amounts are shown as such, not rounded to zero. */
export function formatSek(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return UNKNOWN_LABEL
  if (value > 0 && value < 0.005) return '< 0,01 kr'
  return SEK.format(value)
}

const MONTH = new Intl.DateTimeFormat('sv-SE', { timeZone: ATLAS_HOME_TIMEZONE, month: 'long', year: 'numeric' })
const STAMP = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ATLAS_HOME_TIMEZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function stamp(iso: string | null): string {
  if (!iso) return UNKNOWN_LABEL
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? UNKNOWN_LABEL : STAMP.format(d)
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function ProjectTag({ project }: { project: MoneyProject | null }) {
  if (!project) return <span>{NOT_RECORDED_LABEL}</span>
  const name = project.name ?? project.slug ?? `Projekt ${UNKNOWN_LABEL.toLowerCase()}`
  const body = (
    <>
      <span className={styles.dot} style={project.color ? { background: project.color } : undefined} aria-hidden />
      {name}
    </>
  )
  return project.href ? (
    <Link href={project.href} className={`${styles.project} ${styles.inspect}`}>{body}</Link>
  ) : (
    <span className={styles.project}>{body}</span>
  )
}

function Fact({
  id,
  kind,
  label,
  value,
  note,
}: {
  id: string
  kind: string
  label: string
  value: string
  note: string
}) {
  return (
    <div className={styles.fact} data-kind={kind} data-fact={id}>
      <span className={styles.factLabel}>{label}</span>
      <span className={styles.factValue}>{value}</span>
      <span className={styles.factNote}>{note}</span>
    </div>
  )
}

function Figure({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={styles.figure} data-emphasis={emphasis ? 'true' : 'false'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function Attention({ item, model }: { item: AttentionItem; model: MoneyModel }) {
  const advisory = model.enforcement === 'advisory'
  switch (item.kind) {
    case 'budget_exhausted':
      return (
        <li className={styles.attention} data-tone="exhausted" data-kind={item.kind}>
          <span className={styles.attentionTitle}>
            {item.project.name ?? item.project.slug ?? 'Projekt'}: {LIMIT_WORD[item.scope]} är förbrukad
          </span>
          <span className={styles.attentionDetail}>
            Kvar enligt grinden: {formatSek(item.remainingSek)}.{' '}
            {advisory ? 'Rådgivande läge — nya anrop genomförs ändå.' : 'Nya anrop nekas.'}
          </span>
        </li>
      )
    case 'project_without_budget':
      return (
        <li className={styles.attention} data-tone="attention" data-kind={item.kind}>
          <span className={styles.attentionTitle}>
            {item.project.name ?? item.project.slug ?? 'Projekt'}: ingen månadsbudget konfigurerad
          </span>
          <span className={styles.attentionDetail}>{UNBUDGETED_NOTE}</span>
        </li>
      )
    case 'advisory_overrides':
      return (
        <li className={styles.attention} data-tone="attention" data-kind={item.kind}>
          <span className={styles.attentionTitle}>
            {item.count} anrop genomfördes trots budgetgrindens nej
          </span>
          <span className={styles.attentionDetail}>De bokfördes eftersom gränserna inte verkställdes.</span>
        </li>
      )
    case 'global_ceiling_missing':
      return (
        <li className={styles.attention} data-tone="exhausted" data-kind={item.kind}>
          <span className={styles.attentionTitle}>Plattformsgemensamma gränser saknas</span>
          <span className={styles.attentionDetail}>{GLOBAL_CEILING_MISSING_NOTE}</span>
        </li>
      )
    case 'pricing_fallback':
      return (
        <li className={styles.attention} data-tone="attention" data-kind={item.kind}>
          <span className={styles.attentionTitle}>
            {item.rows} bokförda anrop har en modell utanför prislistan
          </span>
          <span className={styles.attentionDetail}>{PRICING_FALLBACK_NOTE}</span>
        </li>
      )
    case 'source_unreadable':
      return (
        <li className={styles.attention} data-tone="unreadable" data-kind={item.kind}>
          <span className={styles.attentionTitle}>{SOURCE_LABELS[item.source]} kunde inte läsas</span>
          <span className={styles.attentionDetail}>Det som saknas nedan är okänt, inte noll.</span>
        </li>
      )
  }
}

function Lines({
  lines,
  empty,
  label,
}: {
  lines: CostLine[]
  empty: string
  label: (line: CostLine) => React.ReactNode
}) {
  if (lines.length === 0) return <p className={styles.empty}>{empty}</p>
  return (
    <ul className={styles.list}>
      {lines.map((line) => (
        <li key={line.key || '∅'} className={styles.row}>
          <div className={styles.rowMain}>
            <span className={styles.rowLabel}>{label(line)}</span>
            <span className={styles.rowMeta}>{line.rows} bokförda anrop</span>
          </div>
          <span className={styles.rowValue}>{formatSek(line.sek)}</span>
        </li>
      ))}
    </ul>
  )
}

function Entry({ entry }: { entry: CostEntry }) {
  return (
    <li className={styles.row} data-flag={entry.pricingFallback ? 'fallback' : undefined}>
      <div className={styles.rowMain}>
        <span className={styles.rowLabel}>
          {entry.operation ?? entry.agent ?? NOT_RECORDED_LABEL}
        </span>
        <span className={styles.rowMeta}>
          <span>{stamp(entry.at)}</span>
          <span>{providerLabel(entry.provider)}</span>
          {entry.model && <span>{entry.model}</span>}
          {entry.units !== null && entry.unitType && (
            <span>
              {entry.units} {UNIT_WORD[entry.unitType] ?? entry.unitType}
            </span>
          )}
          <ProjectTag project={entry.project} />
          {entry.pricingFallback && (
            <span className={styles.tag} data-flag="fallback">Reservprissatt</span>
          )}
        </span>
      </div>
      <span className={styles.rowValue}>{formatSek(entry.sek)}</span>
    </li>
  )
}

// ── The surface ──────────────────────────────────────────────────────────────

export function MoneyOverview({ model }: { model: MoneyModel }) {
  const { cost, revenue, leads, budgets, unbudgeted, globalCeilings, overrides, sources, enforcement } = model
  const month = MONTH.format(new Date(model.window.startUtc))
  const scopeText = model.projectSlug ? `i ${model.projectSlug}` : 'i de projekt den här sessionen äger'
  const health = destinationBasePath('health')

  const revenueFact =
    revenue.events === null
      ? { kind: 'unavailable', value: UNREADABLE_LABEL, note: 'Intäktshändelserna kunde inte läsas.' }
      : revenue.events === 0
        ? { kind: 'not_recorded', value: NOT_RECORDED_LABEL, note: REVENUE_NOTE }
        : { kind: 'recorded', value: `${revenue.events} registrerade`, note: REVENUE_RECORDED_NOTE }

  return (
    <div className={styles.field}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Pengar</p>
        <h1 className={styles.title}>Vad Omnira har kostat</h1>
        <p className={styles.lede}>
          Beräknad kostnad för {month} {scopeText}. Intäkter visas bara om de är registrerade; resultat
          beräknas inte.
        </p>
      </header>

      {model.state === 'error' && (
        <section className={styles.panel} data-unreadable="true">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>{UNREADABLE_LABEL}</h2>
          </div>
          <p className={styles.note}>
            Varken kostnadsloggen eller budgetgrinden kunde läsas. Sidan visar därför inga belopp — det är
            inte samma sak som att ingenting har kostat.
          </p>
        </section>
      )}

      <section className={styles.facts} aria-label="Vad som är känt">
        <Fact
          id="cost"
          kind={cost.totalSek === null ? 'unavailable' : 'estimated'}
          label={`Beräknad kostnad · ${month}`}
          value={cost.totalSek === null ? UNREADABLE_LABEL : formatSek(cost.totalSek)}
          note={
            cost.totalSek === null
              ? 'Kostnadsloggen kunde inte läsas.'
              : `${cost.rows} bokförda anrop${cost.truncated ? ' — läsningen nådde taket, summan är ofullständig' : ''}.`
          }
        />
        <Fact id="revenue" kind={revenueFact.kind} label="Intäkter" value={revenueFact.value} note={revenueFact.note} />
        <Fact
          id="profit"
          kind="not_calculated"
          label="Resultat"
          value={NOT_CALCULATED_LABEL}
          note={revenue.events !== null && revenue.events > 0 ? PROFIT_UNRECONCILED_NOTE : PROFIT_NOTE}
        />
        <Fact
          id="enforcement"
          kind={enforcement}
          label="Budgetgrind"
          value={ENFORCEMENT_LABELS[enforcement]}
          note={enforcement === 'advisory' ? ADVISORY_NOTE : ENFORCED_NOTE}
        />
      </section>

      <section className={styles.panel} data-section="attention">
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Kräver uppmärksamhet</h2>
          <span className={styles.count}>{model.attention.length}</span>
        </div>
        {model.attention.length > 0 ? (
          <ul className={styles.list}>
            {model.attention.map((item, i) => (
              <Attention key={`${item.kind}:${i}`} item={item} model={model} />
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>
            Ingen gräns är förbrukad, inget projekt saknar månadsbudget, inga rådgivande undantag är bokförda
            och alla källor kunde läsas.
          </p>
        )}
      </section>

      <section className={styles.panel} data-controls="true">
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Budgetar och kontroller</h2>
          <span className={styles.enforcement} data-state={enforcement}>
            {ENFORCEMENT_LABELS[enforcement]}
          </span>
        </div>
        <p className={styles.note}>{enforcement === 'advisory' ? ADVISORY_NOTE : ENFORCED_NOTE}</p>

        {sources.budgets === 'error' ? (
          <p className={styles.empty}>Budgetgrinden kunde inte läsas. Gränser och förbrukning är okända.</p>
        ) : budgets.length === 0 ? (
          <p className={styles.empty}>Grinden rapporterar inga projektbudgetar {scopeText}.</p>
        ) : (
          <>
            <p className={styles.note}>
              Förbrukat och reserverat är grindens egna tal för samma kalendermånad, vecka och dag i
              Europe/Stockholm. Kvar är det grinden skulle pröva ett nytt anrop mot.
            </p>
            <ul className={styles.budgetList}>
              {budgets.map((b) => (
                <li key={b.project.id} className={styles.budget} data-exhausted={b.exhausted ? 'true' : 'false'}>
                  <div className={styles.budgetHead}>
                    <ProjectTag project={b.project} />
                  </div>
                  <div className={styles.scopes}>
                    {b.scopes.map((s) => (
                      <div key={s.scope} className={styles.scope} data-exhausted={s.exhausted ? 'true' : 'false'}>
                        <span className={styles.scopeName}>{BUDGET_SCOPE_LABELS[s.scope]}</span>
                        <dl className={styles.figures}>
                          <Figure label="Gräns" value={formatSek(s.limitSek)} />
                          <Figure label="Förbrukat" value={formatSek(s.spentSek)} />
                          <Figure label="Reserverat" value={formatSek(s.heldSek)} />
                          <Figure label="Kvar enligt grinden" value={formatSek(s.remainingSek)} emphasis />
                        </dl>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {unbudgeted.length > 0 && (
          <p className={styles.note}>
            Utan månadsbudget: {unbudgeted.map((p) => p.name ?? p.slug ?? p.id).join(', ')}. {UNBUDGETED_NOTE}
          </p>
        )}

        <p className={styles.note}>
          {overrides.count === null
            ? 'Rådgivande undantag: kunde inte läsas.'
            : overrides.count === 0
              ? 'Inga rådgivande undantag är bokförda.'
              : `${overrides.count} rådgivande undantag är bokförda.`}
        </p>
        <p className={styles.note} data-ceilings={globalCeilings}>
          {globalCeilings === 'configured'
            ? GLOBAL_SCOPE_NOTE
            : globalCeilings === 'missing'
              ? GLOBAL_CEILING_MISSING_NOTE
              : GLOBAL_CEILING_UNKNOWN_NOTE}
        </p>
        <p className={styles.note}>{NO_AUTHORITY_NOTE}</p>
        {health && (
          <Link href={health} className={styles.inspect}>
            Säkerhetsflaggor och stopp finns i Systemhälsa
          </Link>
        )}
      </section>

      <div className={styles.columns}>
        <section className={styles.panel} data-section="providers">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Per leverantör</h2>
            <span className={styles.count}>{cost.byProvider.length}</span>
          </div>
          {sources.costs === 'error' ? (
            <p className={styles.empty}>{UNREADABLE_LABEL}</p>
          ) : (
            <Lines
              lines={cost.byProvider}
              empty={`Inga bokförda anrop i ${month} ${scopeText}.`}
              label={(line) => providerLabel(line.label)}
            />
          )}
        </section>

        <section className={styles.panel} data-section="projects">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Per projekt</h2>
            <span className={styles.count}>{cost.byProject.length}</span>
          </div>
          {sources.costs === 'error' ? (
            <p className={styles.empty}>{UNREADABLE_LABEL}</p>
          ) : (
            <Lines
              lines={cost.byProject}
              empty={`Inga bokförda anrop i ${month} ${scopeText}.`}
              label={(line) => <ProjectTag project={line.project} />}
            />
          )}
        </section>
      </div>

      <div className={styles.columns}>
        <section className={styles.panel} data-section="agents">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Per registrerad agentetikett</h2>
            <span className={styles.count}>{cost.byAgent.length}</span>
          </div>
          <p className={styles.note}>
            Etiketten är den text anropet bokfördes med, inte en koppling till en agent i Omnira.
          </p>
          {sources.costs === 'error' ? (
            <p className={styles.empty}>{UNREADABLE_LABEL}</p>
          ) : (
            <Lines
              lines={cost.byAgent}
              empty={`Inga bokförda anrop i ${month} ${scopeText}.`}
              label={(line) => line.label ?? NOT_RECORDED_LABEL}
            />
          )}
        </section>

        <section className={styles.panel} data-section="recent">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Senaste bokförda anrop</h2>
            <span className={styles.count}>{cost.recent.length}</span>
          </div>
          {sources.costs === 'error' ? (
            <p className={styles.empty}>{UNREADABLE_LABEL}</p>
          ) : cost.recent.length === 0 ? (
            <p className={styles.empty}>{`Inga bokförda anrop i ${month} ${scopeText}.`}</p>
          ) : (
            <ul className={styles.list}>
              {cost.recent.map((e, i) => (
                <Entry key={`${e.at ?? 'x'}:${i}`} entry={e} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={styles.panel} data-provenance="true">
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Hur siffrorna är framtagna</h2>
        </div>
        <p className={styles.note}>{COST_ESTIMATE_NOTE}</p>
        <p className={styles.note}>{PRICING_FALLBACK_NOTE}</p>
        <p className={styles.note}>{LEDGER_COMPLETENESS_NOTE}</p>
        <p className={styles.note}>{PLATFORM_COST_NOTE}</p>
        <p className={styles.note}>
          {leads.total === null
            ? 'Leads kunde inte läsas.'
            : `${leads.total} leads, varav ${leads.withValue ?? UNKNOWN_LABEL.toLowerCase()} med registrerat värde. ${LEADS_NOTE}`}
        </p>
      </section>

      <details className={styles.diagnostics}>
        <summary className={styles.summary}>Diagnostik</summary>
        <dl className={styles.diagList}>
          <div className={styles.diagRow}>
            <dt>Fönster</dt>
            <dd>
              {LEDGER_WINDOW_LABEL}: {model.window.startUtc} – {model.window.endUtc} (UTC, övre gräns exklusiv)
            </dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Bokförda rader lästa</dt>
            <dd>
              {cost.rows} (tak {model.limits.costRows}){cost.truncated ? ' — taket nått' : ''}
            </dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Reservprissatta rader</dt>
            <dd>{cost.fallbackRows}</dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Intäktshändelser</dt>
            <dd>{revenue.events ?? UNKNOWN_LABEL}</dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Källor</dt>
            <dd>
              {(Object.keys(sources) as MoneySource[]).map((s) => `${s} ${sources[s]}`).join(' · ')}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  )
}

export function MoneyOverviewLoading() {
  return (
    <div className={styles.field}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Pengar</p>
        <h1 className={styles.title}>Vad Omnira har kostat</h1>
        <p className={styles.lede}>Läser…</p>
      </header>
    </div>
  )
}
