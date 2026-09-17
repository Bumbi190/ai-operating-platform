'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  CheckCircle2,
  ChevronRight,
  Database,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react'
import {
  MEMORY_CATEGORY_LABELS,
  type MemoryFeedbackItem,
  type MemoryRule,
  type MemoryViewModel,
} from '@/lib/os/memory-shared'
import type { MemoryCategory } from '@/lib/ai/memory/memory-store'
import styles from './MemoryView.module.css'

type CategoryFilter = 'all' | MemoryCategory

const DECISIONS = {
  approved: { label: 'Godkänd', icon: CheckCircle2 },
  rejected: { label: 'Avvisad', icon: XCircle },
  revised: { label: 'Reviderad', icon: RefreshCw },
} as const

const DATE_FORMAT = new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

function formatDate(value: string | null): string {
  if (!value) return 'Saknas'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Ogiltig tidsuppgift' : `${DATE_FORMAT.format(date)} UTC`
}

function searchable(rule: MemoryRule): string {
  return [
    rule.categoryLabel,
    rule.key,
    rule.note,
    ...rule.details.flatMap((detail) => [detail.label, detail.value]),
  ].filter(Boolean).join(' ').toLocaleLowerCase('sv-SE')
}

export function filterMemoryRules(
  rules: MemoryRule[],
  query: string,
  category: CategoryFilter,
): MemoryRule[] {
  const needle = query.trim().toLocaleLowerCase('sv-SE')
  return rules.filter((rule) => (
    (category === 'all' || rule.category === category)
    && (needle === '' || searchable(rule).includes(needle))
  ))
}

/**
 * Read-only Minne vNext. Every value is plain React text; no stored field is
 * interpreted as markup, a relation, an instruction or evidence of M4 recall.
 */
export function MemoryView({ model }: { model: MemoryViewModel }) {
  const router = useRouter()
  const rules = model.rules.items
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(rules[0]?.id ?? null)
  const [detailOpen, setDetailOpen] = useState(false)
  const listRef = useRef<HTMLUListElement | null>(null)

  const filtered = useMemo(
    () => filterMemoryRules(rules, query, category),
    [rules, query, category],
  )
  const selected = filtered.find((rule) => rule.id === selectedId) ?? filtered[0] ?? null

  const chooseProject = useCallback((slug: string) => {
    router.push(slug ? `/memory?project=${encodeURIComponent(slug)}` : '/memory')
  }, [router])

  const selectRule = useCallback((id: string, open = false) => {
    setSelectedId(id)
    if (open) setDetailOpen(true)
  }, [])

  const onListKeyDown = useCallback((event: React.KeyboardEvent<HTMLUListElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return
    const index = filtered.findIndex((rule) => rule.id === selected?.id)
    if (event.key === 'Enter') {
      if (index >= 0) {
        event.preventDefault()
        setDetailOpen(true)
      }
      return
    }
    if (filtered.length === 0) return
    event.preventDefault()
    const next = event.key === 'ArrowDown'
      ? Math.min(filtered.length - 1, index < 0 ? 0 : index + 1)
      : Math.max(0, index < 0 ? 0 : index - 1)
    const target = filtered[next]
    if (!target) return
    setSelectedId(target.id)
    listRef.current?.querySelector<HTMLElement>(`[data-memory-id="${target.id}"]`)?.focus()
  }, [filtered, selected?.id])

  return (
    <main className={styles.field} data-detail={detailOpen ? 'open' : 'closed'}>
      <div className={styles.ambient} aria-hidden />

      <header className={styles.header}>
        <div className={styles.headline}>
          <p className={styles.eyebrow}>Projektets äldre minneslager</p>
          <h1 className={styles.title}>Minne</h1>
          <p className={styles.lede}>
            Äldre regler och projektmönster, med registrerad feedback i en separat historik.
            Vyn omfattar inte hela Atlas M4-minnet.
          </p>
        </div>
        <ProjectPicker model={model} onChange={chooseProject} />
      </header>

      {model.state === 'project_error' ? (
        <StateNote tone="error" title="Projekt kunde inte läsas">
          Åtkomsten misslyckades. Det betyder inte att projektlistan är tom.
        </StateNote>
      ) : model.state === 'project_not_found' ? (
        <StateNote tone="error" title="Projektet kan inte öppnas">
          Välj ett tillgängligt projekt. Ingen minnes- eller feedbackläsning utfördes.
        </StateNote>
      ) : model.state === 'choose_project' ? (
        <StateNote title={model.projects.length === 0 ? 'Inga tillgängliga projekt' : 'Välj ett projekt'}>
          {model.projects.length === 0
            ? 'Det finns inget projekt som den inloggade användaren får läsa.'
            : 'Inga projektbundna poster hämtas innan du har gjort ett uttryckligt val.'}
        </StateNote>
      ) : (
        <>
          <section className={styles.summary} aria-label="Källöversikt">
            <Fact
              label="Regler och mönster"
              value={model.rules.state === 'ok' ? String(model.rules.items.length) : 'Ej läsbart'}
            />
            <Fact
              label={`Feedback · senaste ${model.feedbackLimit}`}
              value={model.feedback.state === 'ok' ? String(model.feedback.items.length) : 'Ej läsbart'}
            />
            <Fact label="Projekt" value={model.selectedProject?.name ?? 'Saknas'} />
          </section>

          <section className={styles.rulesSection} aria-labelledby="memory-rules-heading">
            <div className={styles.sectionIntro}>
              <div>
                <p className={styles.sectionEyebrow}>public.platform_memory</p>
                <h2 id="memory-rules-heading" className={styles.sectionTitle}>Regler och mönster</h2>
              </div>
              <p className={styles.truthNote}>
                Konfidens är det lagrade värdet, inte en verifierad sannolikhet.
              </p>
            </div>

            {model.rules.state === 'error' ? (
              <StateNote tone="error" title="Regler och mönster kunde inte läsas">
                Läsningen misslyckades. Källan visas inte som tom.
              </StateNote>
            ) : (
              <>
                <div className={styles.filters}>
                  <label className={styles.searchLabel}>
                    <Search size={15} aria-hidden />
                    <span className={styles.srOnly}>Sök i hämtade regler och mönster</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value)
                        setDetailOpen(false)
                      }}
                      placeholder="Sök nyckel, not eller lagrat värde"
                      className={styles.search}
                    />
                  </label>
                  <label className={styles.filterLabel}>
                    <span>Kategori</span>
                    <select
                      value={category}
                      onChange={(event) => {
                        setCategory(event.target.value as CategoryFilter)
                        setDetailOpen(false)
                      }}
                      className={styles.select}
                    >
                      <option value="all">Alla kategorier</option>
                      {Object.entries(MEMORY_CATEGORY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className={styles.scopeNote}>
                  Sökningen omfattar de {rules.length} aktiva poster som hämtats för projektet —
                  inte andra minneslager eller feedbackhistoriken.
                </p>

                <div className={styles.workspace}>
                  <div className={styles.listPanel}>
                    <div className={styles.listHead}>
                      <span>{filtered.length} av {rules.length}</span>
                      {query || category !== 'all' ? <span>Lokalt filter aktivt</span> : null}
                    </div>
                    {rules.length === 0 ? (
                      <StateNote title="Inga aktiva poster">
                        Läsningen lyckades, men projektet har inga aktiva legacy-mönster.
                      </StateNote>
                    ) : filtered.length === 0 ? (
                      <StateNote title="Inga träffar">
                        Ingen av de hämtade posterna matchar sökningen och kategorin.
                      </StateNote>
                    ) : (
                      <ul
                        ref={listRef}
                        className={styles.rows}
                        onKeyDown={onListKeyDown}
                        aria-label="Regler och mönster"
                      >
                        {filtered.map((rule) => (
                          <RuleRow
                            key={rule.id}
                            rule={rule}
                            selected={rule.id === selected?.id}
                            onSelect={selectRule}
                          />
                        ))}
                      </ul>
                    )}
                  </div>

                  <aside className={styles.inspector} aria-label="Minnesdetaljer">
                    {selected ? (
                      <RuleDetail rule={selected} onBack={() => setDetailOpen(false)} />
                    ) : (
                      <StateNote title="Välj en post">Detaljer visas här.</StateNote>
                    )}
                  </aside>
                </div>
              </>
            )}
          </section>

          <FeedbackHistory model={model} />
        </>
      )}
    </main>
  )
}

export function MemoryViewLoading() {
  return (
    <main className={styles.field} aria-busy="true">
      <div className={styles.ambient} aria-hidden />
      <header className={styles.header}>
        <div className={styles.headline}>
          <p className={styles.eyebrow}>Projektets äldre minneslager</p>
          <h1 className={styles.title}>Minne</h1>
          <p className={styles.lede}>Läser projektets minnesvy …</p>
        </div>
      </header>
    </main>
  )
}

function ProjectPicker({
  model,
  onChange,
}: {
  model: MemoryViewModel
  onChange: (slug: string) => void
}) {
  return (
    <label className={styles.projectPicker}>
      <span>Projekt</span>
      <select
        className={styles.projectSelect}
        value={model.selectedProject?.slug ?? ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={model.state === 'project_error'}
      >
        <option value="">Välj projekt …</option>
        {model.projects.map((project) => (
          <option key={project.id} value={project.slug}>{project.name}</option>
        ))}
      </select>
    </label>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StateNote({
  title,
  tone = 'neutral',
  children,
}: {
  title: string
  tone?: 'neutral' | 'error'
  children: React.ReactNode
}) {
  return (
    <div className={styles.stateNote} data-tone={tone} role={tone === 'error' ? 'alert' : 'note'}>
      {tone === 'error' ? <AlertTriangle size={17} aria-hidden /> : <Database size={17} aria-hidden />}
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  )
}

function RuleRow({
  rule,
  selected,
  onSelect,
}: {
  rule: MemoryRule
  selected: boolean
  onSelect: (id: string, open?: boolean) => void
}) {
  return (
    <li className={styles.row} data-selected={selected ? 'true' : 'false'}>
      <button
        type="button"
        className={styles.rowButton}
        data-memory-id={rule.id}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(rule.id, true)}
      >
        <span className={styles.rowMain}>
          <span className={styles.category}>{rule.categoryLabel}</span>
          <span className={styles.rowKey}>{rule.key}</span>
          {rule.note ? <span className={styles.rowNote}>{rule.note}</span> : null}
        </span>
        <span className={styles.rowAside}>
          <span>{rule.confidence === null ? '—' : `${Math.round(rule.confidence * 100)}%`}</span>
          <ChevronRight size={14} aria-hidden />
        </span>
      </button>
    </li>
  )
}

function RuleDetail({ rule, onBack }: { rule: MemoryRule; onBack: () => void }) {
  const visualConfidence = rule.confidence === null
    ? 0
    : Math.max(0, Math.min(100, rule.confidence * 100))

  return (
    <div className={styles.detail}>
      <button type="button" className={styles.back} onClick={onBack}>
        <ArrowLeft size={14} aria-hidden /> Till listan
      </button>
      <div className={styles.detailHead}>
        <span className={styles.category}>{rule.categoryLabel}</span>
        <h3>{rule.key}</h3>
      </div>
      {rule.note ? <p className={styles.detailNote}>{rule.note}</p> : (
        <p className={styles.absent}>Ingen lagrad not.</p>
      )}
      <dl className={styles.meta}>
        <div>
          <dt>Konfidens</dt>
          <dd>{rule.confidence === null ? 'Saknas' : `${Math.round(rule.confidence * 100)}% · lagrat värde`}</dd>
        </div>
        <div>
          <dt>Belägg</dt>
          <dd>{rule.evidenceCount === null ? 'Saknas' : `${rule.evidenceCount} registrerade händelser`}</dd>
        </div>
        <div>
          <dt>Senast observerad</dt>
          <dd>{formatDate(rule.lastSeenAt)}</dd>
        </div>
        <div>
          <dt>Källa i denna vy</dt>
          <dd>public.platform_memory</dd>
        </div>
      </dl>
      {rule.confidence !== null ? (
        <div className={styles.confidenceTrack} aria-hidden>
          <span style={{ width: `${visualConfidence}%` }} />
        </div>
      ) : null}
      {rule.details.length > 0 ? (
        <dl className={styles.storedValues}>
          {rule.details.map((detail) => (
            <div key={detail.label}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className={styles.readonly}>Skrivskyddad legacy-post. Inga åtgärder erbjuds i denna leverans.</p>
    </div>
  )
}

function FeedbackHistory({ model }: { model: MemoryViewModel }) {
  const items = model.feedback.state === 'ok' ? model.feedback.items : []
  const counts = items.reduce((acc, item) => {
    acc[item.decision] += 1
    return acc
  }, { approved: 0, rejected: 0, revised: 0 })

  return (
    <section className={styles.feedback} aria-labelledby="memory-feedback-heading">
      <div className={styles.sectionIntro}>
        <div>
          <p className={styles.sectionEyebrow}>public.content_feedback</p>
          <h2 id="memory-feedback-heading" className={styles.sectionTitle}>Feedbackhistorik</h2>
        </div>
        <p className={styles.truthNote}>
          Registrerade beslut — inte bevis på att Atlas har lärt sig.
        </p>
      </div>

      {model.feedback.state === 'error' ? (
        <StateNote tone="error" title="Feedbackhistoriken kunde inte läsas">
          Läsningen misslyckades. Historiken visas inte som tom.
        </StateNote>
      ) : (
        <>
          <div className={styles.feedbackMeta}>
            <p>
              Visar högst de {model.feedbackLimit} senaste posterna. Alla räknare avser bara
              de {items.length} poster som hämtats i detta urval.
            </p>
            <div className={styles.feedbackCounts} aria-label="Beslut i det hämtade urvalet">
              <span data-decision="approved">{counts.approved} godkända</span>
              <span data-decision="rejected">{counts.rejected} avvisade</span>
              <span data-decision="revised">{counts.revised} reviderade</span>
            </div>
          </div>

          {items.length === 0 ? (
            <StateNote title="Ingen registrerad feedback i urvalet">
              Läsningen lyckades, men returnerade inga feedbackposter för projektet.
            </StateNote>
          ) : (
            <ol className={styles.feedbackList}>
              {items.map((item) => <FeedbackRow key={item.id} item={item} />)}
            </ol>
          )}
        </>
      )}
    </section>
  )
}

function FeedbackRow({ item }: { item: MemoryFeedbackItem }) {
  const decision = DECISIONS[item.decision]
  const Icon = decision.icon
  return (
    <li className={styles.feedbackRow}>
      <div className={styles.feedbackHead}>
        <span className={styles.decision} data-decision={item.decision}>
          <Icon size={13} aria-hidden /> {decision.label}
        </span>
        <strong>{item.outputType}</strong>
        <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
      </div>
      {item.rejectionReason ? <p>{item.rejectionReason}</p> : null}
      {item.revisionNotes ? <p>{item.revisionNotes}</p> : null}
      {item.qualityPatterns.length > 0 ? (
        <div className={styles.tags} aria-label="Lagrade kvalitetstaggar">
          {item.qualityPatterns.map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)}
        </div>
      ) : null}
      {item.contentExcerpt ? <blockquote>{item.contentExcerpt}</blockquote> : null}
      {item.evalScore !== null ? <small>Lagrad eval-poäng: {item.evalScore}/10</small> : null}
    </li>
  )
}
