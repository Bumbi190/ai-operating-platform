/**
 * /releases — read-only status surface for long-lived workflow instances.
 *
 * PR1 scope: this page READS. There are no execution controls and no approval
 * buttons, because neither the scheduler nor the authorization layer exists yet
 * and a button that cannot honestly do its job is worse than no button.
 *
 * Everything shown about position in the workflow is DERIVED from the transition
 * history through the pure machine, not read from `current_state`. The stored
 * column is a cache; rendering from it would hide exactly the drift the
 * projection guard exists to prevent. The two are compared and any disagreement
 * is surfaced rather than smoothed over.
 */

import { redirect } from 'next/navigation'
import { AlertTriangle, GitBranch, Lock, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OSPage, OSLayer, Panel, SectionHeader, PulseDot, EmptyState } from '@/components/platform/os'
import { deriveWorkflowStatus } from '@/lib/workflows/machine'
import { listInstances, listTransitions, readDefinitionById } from '@/lib/workflows/store'
import { FAMILJE_STUNDEN_MONTHLY_RELEASE, loadVendoredDefinitions } from '@/lib/workflows/definitions'
import type { WorkflowSpec } from '@/lib/workflows/types'

export const dynamic = 'force-dynamic'

/**
 * A definition may carry a label map for its instance keys in its `canonical`
 * block. The engine never interprets that block — this is presentation only,
 * and stays defensive so a definition without such a map simply shows none.
 */
function instanceLabel(spec: WorkflowSpec, instanceKey: string): string | null {
  const canonical = spec.canonical as Record<string, unknown>
  for (const value of Object.values(canonical)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const hit = (value as Record<string, unknown>)[instanceKey]
      if (typeof hit === 'string') return hit
    }
  }
  return null
}

export default async function ReleasesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const vendored = loadVendoredDefinitions()

  const cards: {
    instanceKey: string
    label: string | null
    defKey: string
    defVersion: number
    defHash: string
    derived: ReturnType<typeof deriveWorkflowStatus>
    projected: string
    projectionAgrees: boolean
    latest: { from: string | null; to: string; reason: string; actor: string; at: string } | null
    releaseRule: string | null
  }[] = []

  let loadError: string | null = null
  try {
    const instances = await listInstances(db, FAMILJE_STUNDEN_MONTHLY_RELEASE)
    for (const instance of instances) {
      const def = await readDefinitionById(db, instance.def_id)
      const transitions = await listTransitions(db, instance.id)
      const derived = deriveWorkflowStatus(def.spec, transitions, instance.status)
      const last = transitions[transitions.length - 1] ?? null
      cards.push({
        instanceKey: instance.instance_key,
        label: instanceLabel(def.spec, instance.instance_key),
        defKey: instance.def_key,
        defVersion: instance.def_version,
        defHash: instance.def_hash,
        derived,
        projected: instance.current_state,
        projectionAgrees: derived.current_state === instance.current_state,
        latest: last
          ? { from: last.from_state, to: last.to_state, reason: last.reason, actor: last.actor, at: last.occurred_at }
          : null,
        releaseRule:
          typeof (def.spec.canonical as Record<string, unknown>).release_instant_rule === 'string'
            ? ((def.spec.canonical as Record<string, unknown>).release_instant_rule as string)
            : null,
      })
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Unknown error'
  }

  return (
    <OSPage>
      <OSLayer layer="command">
        <SectionHeader
          eyebrow="Workflows"
          title="Releases"
          caption="Long-lived workflow instances. Read-only — execution and approvals land in later phases."
        />
      </OSLayer>

      <OSLayer layer="operational">
        <Panel>
          <div className="p-4 text-sm text-white/70">
            <div className="flex items-center gap-2 font-medium text-white/90">
              <GitBranch className="h-4 w-4" />
              Registered definitions
            </div>
            <ul className="mt-3 space-y-1">
              {vendored.map(d => (
                <li key={`${d.def_key}-${d.version}`} className="font-mono text-xs">
                  {d.def_key} v{d.version}
                  <span className="ml-2 text-white/40">
                    {d.spec.states.length} states · def_hash {d.def_hash.slice(0, 12)}…
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </OSLayer>

      <OSLayer layer="intelligence">
        {loadError ? (
          <Panel>
            <div className="flex items-start gap-3 p-4 text-sm text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Could not read workflow instances</div>
                <div className="mt-1 font-mono text-xs text-amber-300/70">{loadError}</div>
              </div>
            </div>
          </Panel>
        ) : cards.length === 0 ? (
          <EmptyState
            eyebrow="Awaiting first instance"
            title="No workflow instances yet"
            body="A monthly release appears here once an instance is created for it."
          />
        ) : (
          <div className="space-y-3">
            {cards.map(card => (
              <Panel key={card.instanceKey}>
                <div className="space-y-3 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-lg text-white/90">{card.instanceKey}</span>
                      {card.label && <span className="text-sm text-white/60">{card.label}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/50">
                      <PulseDot tone={card.derived.status === 'active' ? 'emerald' : 'indigo'} />
                      {card.derived.status}
                    </div>
                  </div>

                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <Row label="Current state" value={card.derived.current_state ?? '—'} mono />
                    <Row label="Next state" value={card.derived.next_state ?? '— (terminal)'} mono />
                    <Row
                      label="Waiting on"
                      value={card.derived.waiting_on ?? '—'}
                      icon={card.derived.awaiting_human_gate ? <Lock className="h-3 w-3" /> : undefined}
                    />
                    <Row
                      label="Gate"
                      value={
                        card.derived.gate?.required
                          ? card.derived.gate.decision ?? 'decision unspecified'
                          : 'none on this state'
                      }
                    />
                    <Row label="Definition" value={`${card.defKey} v${card.defVersion}`} mono />
                    <Row label="Pinned def_hash" value={`${card.defHash.slice(0, 16)}…`} mono />
                  </dl>

                  {card.releaseRule && (
                    <div className="rounded border border-white/10 bg-white/[0.02] p-3 text-xs text-white/50">
                      <span className="text-white/70">Release instant:</span> {card.releaseRule}
                      <div className="mt-1 text-white/40">
                        Not computed here — deriving it belongs to the Familje-Stunden adapter, which
                        lands with the read-only verification phase.
                      </div>
                    </div>
                  )}

                  {card.latest && (
                    <div className="text-xs text-white/50">
                      <span className="text-white/70">Latest transition:</span>{' '}
                      <span className="font-mono">
                        {card.latest.from ?? '∅'} → {card.latest.to}
                      </span>{' '}
                      · {card.latest.actor} · {card.latest.reason}
                    </div>
                  )}

                  {!card.derived.history_intact && (
                    <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>
                        Transition history contains a move this definition does not declare. The
                        instance cannot be advanced until it is investigated.
                      </span>
                    </div>
                  )}

                  {!card.projectionAgrees && (
                    <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>
                        Projection drift: stored current_state is{' '}
                        <span className="font-mono">{card.projected}</span> but the history derives{' '}
                        <span className="font-mono">{card.derived.current_state ?? '∅'}</span>.
                      </span>
                    </div>
                  )}

                  {card.projectionAgrees && card.derived.history_intact && (
                    <div className="flex items-center gap-2 text-xs text-white/35">
                      <ShieldCheck className="h-3 w-3" />
                      History intact; projection agrees with derived state.
                    </div>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </OSLayer>
    </OSPage>
  )
}

function Row({
  label, value, mono, icon,
}: {
  label: string
  value: string
  mono?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-32 shrink-0 text-white/40">{label}</dt>
      <dd className={`flex items-center gap-1.5 text-white/80 ${mono ? 'font-mono text-xs' : ''}`}>
        {icon}
        {value}
      </dd>
    </div>
  )
}
