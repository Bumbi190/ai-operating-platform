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
import { AlertTriangle, Clock, GitBranch, Lock, Moon, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OSPage, OSLayer, Panel, SectionHeader, PulseDot, EmptyState } from '@/components/platform/os'
import { deriveWorkflowStatus } from '@/lib/workflows/machine'
import { listInstances, listTransitions, readDefinitionById } from '@/lib/workflows/store'
import { deriveWorkflowGateStatus } from '@/lib/workflows/authorization'
import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import type { WorkflowGateState } from '@/lib/workflows/gate'
import { wakeState } from '@/lib/workflows/schedule'
import { findAdapter } from '@/lib/workflows/adapters/registry'
import type { VerificationEvidence } from '@/lib/workflows/adapters/types'
import { GateActions } from './GateActions'
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

  // Which projects this viewer actually owns. Used ONLY to avoid rendering
  // controls the server would refuse anyway — it is not the authority check.
  // That lives in the authorization write boundary, which derives the principal
  // from the session and can never be satisfied by a service role.
  const access = await resolveProjectAccess()
  const allowedProjectIds = access.ok ? access.allowedProjectIds : []

  const cards: {
    instanceId: string
    instanceKey: string
    label: string | null
    defKey: string
    defVersion: number
    defHash: string
    derived: ReturnType<typeof deriveWorkflowStatus>
    gate: WorkflowGateState | null
    wake: { at: string | null; state: 'not_scheduled' | 'sleeping' | 'due' }
    lastTickAt: string | null
    lastTickOutcome: string | null
    verification: VerificationEvidence[]
    authoritativeSystem: string | null
    mayDecide: boolean
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
      // Resolved per instance: the gate depends on the pinned definition, the
      // current state and the evidence recorded so far, so it cannot be cached
      // across instances.
      let gate: WorkflowGateState | null = null
      try {
        gate = await deriveWorkflowGateStatus(db, instance.id)
      } catch {
        gate = null   // a gate we cannot resolve is shown as unresolved, never as open
      }
      // Read-only verification for the CURRENT state. Never writes, and never
      // reaches anything but the project's own authoritative systems.
      let verification: VerificationEvidence[] = []
      const adapter = findAdapter(instance.def_key)
      if (adapter) {
        try {
          verification = await adapter.verifyState({
            state: instance.current_state, instanceKey: instance.instance_key,
            now: new Date().toISOString(),
          })
        } catch {
          verification = []   // a failing adapter shows nothing, never a false pass
        }
      }

      cards.push({
        instanceId: instance.id,
        instanceKey: instance.instance_key,
        label: instanceLabel(def.spec, instance.instance_key),
        defKey: instance.def_key,
        defVersion: instance.def_version,
        defHash: instance.def_hash,
        derived,
        gate,
        wake: { at: instance.wake_at, state: wakeState(instance.wake_at, new Date().toISOString()) },
        lastTickAt: instance.last_tick_at,
        lastTickOutcome: instance.last_tick_outcome,
        verification,
        authoritativeSystem: adapter?.authoritativeSystem ?? null,
        mayDecide: assertProjectAllowed(instance.project_id, allowedProjectIds),
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

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-white/50">
                    <span className="flex items-center gap-1.5 text-white/70">
                      {card.wake.state === 'sleeping' ? <Moon className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      Scheduler
                    </span>
                    <span>
                      <span className="text-white/40">wake:</span>{' '}
                      <span className="font-mono">{WAKE_LABEL[card.wake.state]}</span>
                    </span>
                    {card.wake.at && (
                      <span><span className="text-white/40">at:</span>{' '}
                        <span className="font-mono">{card.wake.at}</span></span>
                    )}
                    <span>
                      <span className="text-white/40">last evaluation:</span>{' '}
                      <span className="font-mono">{card.lastTickOutcome ?? 'never'}</span>
                      {card.lastTickAt && <span className="text-white/30"> · {card.lastTickAt}</span>}
                    </span>
                  </div>

                  {card.gate?.required && (
                    <div className="space-y-2 rounded border border-amber-400/20 bg-amber-400/[0.04] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-amber-200">
                          <Lock className="h-3 w-3" />
                          Human gate — {card.gate.decision ?? 'decision unspecified'}
                        </div>
                        <span className="font-mono text-[11px] text-amber-200/70">{card.gate.status}</span>
                      </div>

                      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                        <Row label="Action" value={`advance ${card.derived.current_state} → ${card.derived.next_state ?? '—'}`} mono />
                        <Row label="Must approve" value={card.gate.approver ?? 'unspecified'} />
                        <Row label="Target hash" value={`${card.gate.target?.versionHash.slice(0, 16) ?? '—'}…`} mono />
                        <Row label="Expires" value={card.gate.expiresAt ?? '—'} mono />
                        <Row label="Authorization" value={card.gate.authorizationId ?? 'none requested'} mono />
                        <Row label="Hard gate" value={card.gate.gateRef ?? 'none'} mono />
                      </dl>

                      {STALE_GATE.has(card.gate.status) && (
                        <div className="flex items-start gap-2 rounded border border-amber-400/30 bg-amber-400/10 p-2 text-[11px] text-amber-100">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{GATE_EXPLANATION[card.gate.status]}</span>
                        </div>
                      )}

                      {card.mayDecide ? (
                        <GateActions
                          instanceId={card.instanceId}
                          authorizationId={card.gate.authorizationId}
                          status={card.gate.status}
                        />
                      ) : (
                        <div className="text-[11px] text-white/35">
                          You do not hold authority in this project; decisions are made by its owner.
                        </div>
                      )}
                    </div>
                  )}

                  {card.verification.length > 0 && (
                    <div className="space-y-2 rounded border border-white/10 bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 text-white/70">
                          <ShieldCheck className="h-3 w-3" />
                          Verification
                        </span>
                        <span className="text-white/35">
                          authoritative source: {card.authoritativeSystem ?? '—'}
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {card.verification.map(v => (
                          <li key={v.check_key} className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                            <span className={`w-14 shrink-0 font-mono uppercase ${VERIFY_TONE[v.result]}`}>
                              {v.result}
                            </span>
                            <span className="font-mono text-white/70">{v.check_key}</span>
                            <span className="text-white/40">— {v.observed}</span>
                            {v.failure_kind && (
                              <span className="font-mono text-white/30">({v.failure_kind})</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <div className="text-[10px] text-white/30">
                        Read-only. Omnira observes Familje-Stunden’s answers; it never
                        decides access, and a check it could not run is never a pass.
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

/** Verification result → colour. `blocked` is amber, not red: we could not look. */
const VERIFY_TONE: Record<string, string> = {
  pass: 'text-emerald-300/80',
  fail: 'text-rose-300',
  error: 'text-rose-300/80',
  blocked: 'text-amber-300/80',
}

/**
 * What the wake column means. `not_scheduled` is the resting state and is not a
 * problem: the scheduler only looks at instances something has explicitly armed,
 * and it deliberately does not re-arm anything that needs a human.
 */
const WAKE_LABEL: Record<'not_scheduled' | 'sleeping' | 'due', string> = {
  not_scheduled: 'not scheduled',
  sleeping: 'sleeping',
  due: 'due — next tick',
}

/** Gate statuses where a NEW request is needed, with the reason spelled out. */
const GATE_EXPLANATION: Record<string, string> = {
  stale:
    'A human approved this gate, but for a different version of the action — the definition, ' +
    'state or evidence has changed since. The old grant is immutable and still valid for what ' +
    'it described; this action needs a new request.',
  expired:  'The approval window closed. Expiry is derived from time, so no job had to run for this to take effect.',
  denied:   'A human denied this gate. A denial is final for that request; advancing needs a new one.',
  revoked:  'The approval was revoked after being granted.',
  superseded: 'The approval was superseded by a later authorization.',
  conditions_unverified:
    'Approved with conditions. Conditions cannot be verified in this stage, so the grant is ' +
    'recorded as genuine authority but is never execution-effective.',
  malformed: 'The authorization chain could not be read. Failing closed.',
}

const STALE_GATE = new Set(Object.keys(GATE_EXPLANATION))

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
