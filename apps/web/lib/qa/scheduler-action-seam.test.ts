/**
 * PR9f — the scheduler → READ_ONLY action seam.
 *
 * Two properties matter most: the tick never executes a handler, and the
 * scheduler cannot schedule anything that can change the world.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkAnsweredBy, discoverReadOnlyActions } from '../workflows/action-discovery'
import { ACTION_REGISTRY } from '../workflows/action-registry'

const FS = 'familje-stunden.monthly-release'
const disc = readFileSync(join(process.cwd(), 'lib/workflows/action-discovery.ts'), 'utf8')
/** Comment-stripped: these modules' own prose explains what they refuse to do. */
const stripComments = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const sched = readFileSync(join(process.cwd(), 'lib/workflows/action-scheduling.ts'), 'utf8')
const tick = readFileSync(join(process.cwd(), 'lib/workflows/tick.ts'), 'utf8')
const admin = readFileSync(join(process.cwd(), 'app/api/workflows/admin/route.ts'), 'utf8')
const sql = readFileSync(join(process.cwd(),
  'supabase/migrations/20260830_readonly_action_authorization.sql'), 'utf8').replace(/--.*$/gm, '')

// ── Discovery ───────────────────────────────────────────────────────────────

describe('discovery reads canonical data only', () => {
  it('finds exactly compute_release_instant for planning', () => {
    expect(discoverReadOnlyActions(FS, 'planning'))
      .toEqual([{ actionKind: 'compute_release_instant', checkKey: 'release_instant_computed',
                  actionClass: 'READ_ONLY' }])
  })

  it('finds nothing for a state with no executable action', () => {
    for (const state of ['protected_upload', 'newsletter', 'audio_generation',
                         'backend_release_gate', 'complete']) {
      expect(discoverReadOnlyActions(FS, state), state).toEqual([])
    }
  })

  it('finds nothing for another definition', () => {
    expect(discoverReadOnlyActions('some.other.definition', 'planning')).toEqual([])
  })

  it('MUTATION — a MATERIAL kind is never discovered, even in its own state', () => {
    // upload_protected_artifacts IS registered for protected_upload.
    expect(ACTION_REGISTRY.upload_protected_artifacts.placements)
      .toEqual([{ def_key: 'familje-stunden.monthly-release', state: 'protected_upload' }])
    expect(discoverReadOnlyActions(FS, 'protected_upload')).toEqual([])
  })

  it('MUTATION — both filters are present and neither is redundant', () => {
    expect(disc).toMatch(/meta\.executor_family !== 'read_only_observation'/)
    expect(disc).toMatch(/meta\.action_class !== 'READ_ONLY'/)
  })

  it('MUTATION — prose is never parsed into an action identity', () => {
    // The doc comments deliberately NAME automated_actions to explain why it is
    // not read; the guard judges code, and is stricter for it.
    for (const src of [disc, sched]) {
      const code = stripComments(src)
      expect(code).not.toMatch(/automated_actions/)
      expect(code).not.toMatch(/\.split\(|\.match\(|includes\(['"]/)
    }
    // …and the prose really is there, so the explanation cannot be quietly lost.
    expect(disc).toMatch(/automated_actions/)
  })

  it('an action with no declared check answers nothing', () => {
    expect(checkAnsweredBy('compute_release_instant')).toBe('release_instant_computed')
    expect(checkAnsweredBy('upload_protected_artifacts')).toBeNull()
  })
})

// ── The tick never executes ─────────────────────────────────────────────────

describe('the tick creates work; it does not do it', () => {
  it('MUTATION — the scheduler never calls a handler or the executor', () => {
    for (const forbidden of [/executeWorkflowAction/, /computeReleaseInstantHandler/,
                             /HANDLERS/, /handlers\//, /fetch\(/]) {
      expect(sched, 'scheduling').not.toMatch(forbidden)
      expect(tick, 'tick').not.toMatch(forbidden)
    }
  })

  it('MUTATION — scheduling performs no transition and creates no authorization', () => {
    for (const forbidden of [/appendTransition/, /workflow_append_transition/,
                             /current_state:/, /atlas_authorizations/, /grantAuthorization/]) {
      expect(sched).not.toMatch(forbidden)
    }
  })

  it('inserts no run directly — it goes through createWorkflowActionRun', () => {
    expect(sched).toMatch(/createWorkflowActionRun\(db, \{ instanceId: instance\.id, actionKind \}\)/)
    expect(sched).not.toMatch(/\.from\('runs'\)\.insert/)
  })

  it('supplies no idempotency key and no attempt_group', () => {
    // Both are derived server-side, so a repeated tick computes the same
    // identity and the unique index refuses the duplicate.
    expect(sched).not.toMatch(/idempotencyKey/)
    expect(sched).not.toMatch(/attemptGroup/)
  })
})

// ── Create only when needed ─────────────────────────────────────────────────

describe('the scheduler does not loop', () => {
  it('skips when the check is SATISFIED — not merely when a pass row exists', () => {
    // PR9h-3 raised this pin. `.eq('result','pass')` counted unbound and stale
    // rows as satisfied, so the seam would refuse to schedule the observation
    // that would have produced a usable one.
    expect(sched).toMatch(/summarizeStateEvidence\(/)
    expect(sched).toMatch(/verdict\?\.satisfies/)
    expect(sched).toMatch(/already_satisfied/)
    expect(sched).not.toMatch(/\.eq\('result', 'pass'\)/)
  })

  it('skips while a run is pending or running', () => {
    // PR9h-4 moved the lifecycle decision into action-identity.ts, where it is
    // pure and testable. The seam must not re-derive it from a status string.
    expect(sched).toMatch(/classifyPriorObservation\(prior, lastExplicitScheduleAt\)/)
    expect(sched).toMatch(/already_scheduled/)
    const ident = readFileSync(
      join(process.cwd(), 'lib/workflows/action-identity.ts'), 'utf8')
    expect(ident).toMatch(/ACTIVE_STATUSES = \['pending', 'running'\]/)
    expect(ident).toMatch(/reason: 'active_run_exists'/)
  })

  it('MUTATION — an exhausted attempt budget does NOT mint a new attempt_group', () => {
    // Without this the scheduler becomes an infinite run factory.
    const ident = readFileSync(
      join(process.cwd(), 'lib/workflows/action-identity.ts'), 'utf8')
    expect(ident).toMatch(/prior\.attempts >= prior\.max_attempts/)
    expect(sched).toMatch(/attempts_exhausted/)
  })

  it('treats a lost duplicate race as already-scheduled, not failure', () => {
    expect(sched).toMatch(/duplicate_action_identity/)
    expect(sched).toMatch(/another tick created it first/)
  })

  it('only cancelled/rejected releases the identity for a new run', () => {
    expect(sched).toMatch(/\.not\('status', 'in', '\("cancelled","rejected"\)'\)/)
  })
})

// ── Fail closed ─────────────────────────────────────────────────────────────

describe('scheduling fails closed', () => {
  it('refuses an inactive instance and a paused project', () => {
    expect(sched).toMatch(/instance\.status !== 'active'/)
    expect(sched).toMatch(/project\?\.execution_paused === true/)
  })

  it('MUTATION — an unreadable pause state refuses rather than proceeds', () => {
    expect(sched).toMatch(/project pause state unreadable/)
  })
})

// ── Authorization ───────────────────────────────────────────────────────────

describe('READ_ONLY needs no authorization, everything else still does', () => {
  it('MUTATION — the DB refuses a non-READ_ONLY bound action with no authorization', () => {
    expect(sql).toMatch(/action_class = 'READ_ONLY' or authorization_id is not null/)
    expect(sql).toMatch(/runs_unauthorized_action_is_read_only/)
  })

  it('the create path refuses a write class with no authorization', async () => {
    const run = readFileSync(join(process.cwd(), 'lib/workflows/action-run.ts'), 'utf8')
    expect(run).toMatch(/if \(!input\.authorizationId\) \{[\s\S]{0,200}authorization_not_effective/)
    expect(run).toMatch(/policy\.requiresAuthorization \? input\.authorizationId : null/)
  })

  it('MUTATION — no authorization is ever fabricated for READ_ONLY', () => {
    for (const forbidden of [/grantAuthorization/, /appendAuthorizationEvent/,
                             /atlas_authorizations/, /authorizationId: ['"]/]) {
      expect(sched).not.toMatch(forbidden)
    }
  })

  it('the nine identity columns keep all-or-nothing', () => {
    expect(sql).toMatch(/workflow_instance_id is not null and workflow_def_hash is not null/)
    expect(sql).toMatch(/idempotency_key is not null and attempt_group is not null/)
  })
})

// ── Human gate ──────────────────────────────────────────────────────────────

describe('observation never satisfies a human gate', () => {
  it('MUTATION — the seam cannot touch the gate or advance state', () => {
    for (const forbidden of [/human_gate/, /canAdvance/, /gateStatus\s*=/, /autoAdvance/]) {
      expect(sched).not.toMatch(forbidden)
    }
  })

  it('all 19 Familje-Stunden states declare a human gate — evidence changes none of that', () => {
    const def = JSON.parse(readFileSync(join(process.cwd(),
      'lib/workflows/definitions/familje-stunden.monthly-release.v1.json'), 'utf8'))
    expect(def.states).toHaveLength(19)
    expect(def.states.every((s: { human_gate?: unknown }) => !!s.human_gate)).toBe(true)
    // and the scheduler yields zero auto-advanceable states for it
    type St = { human_gate: { required: boolean }; automated_actions: string[] }
    expect((def.states as St[]).filter(s =>
      s.human_gate.required === false && s.automated_actions.length === 0)).toHaveLength(0)
  })
})

// ── Wake semantics ──────────────────────────────────────────────────────────

describe('wake semantics', () => {
  it('a freshly created action clears the wake instead of polling every minute', () => {
    // The executor re-arms when the run finishes — sooner and more accurate.
    // PR9g extended the same expression with the advance case; the property
    // under test is unchanged — a freshly created action still clears the wake.
    expect(tick).toMatch(/createdAction \? null :/)
    expect(tick).toMatch(/advance\?\.outcome === 'advanced' \? now : nextWakeAt/)
  })

  it('records what was scheduled in the tick outcome', () => {
    // PR9h-2 raised this pin: `scheduled.map` alone was satisfied by the
    // {kind, outcome} projection that made a production refusal unreadable.
    expect(tick).toMatch(/scheduled_actions: scheduled\.map\(summarizeSchedulingDecision\)/)
  })
})

// ── Operator endpoint ───────────────────────────────────────────────────────

describe('the scheduling endpoint cannot name the work', () => {
  it('MUTATION — rejects any attempt to describe the action', () => {
    expect(admin).toMatch(/for \(const forbidden of \['actionKind', 'actionClass', 'targetVersionHash', 'handler', 'authorizationId'\]\)/)
    expect(admin).toMatch(/reserved:\$\{forbidden\}/)
  })

  it('sets a wake and nothing else', () => {
    const block = admin.slice(admin.indexOf("if (action === 'schedule_readonly_evaluation')"),
                              admin.indexOf('// ── create_instance ──'))
    expect(block).toMatch(/scheduleWorkflowWake/)
    for (const forbidden of [/createWorkflowActionRun/, /executeWorkflowAction/,
                             /appendTransition/, /from\('runs'\)/]) {
      expect(block).not.toMatch(forbidden)
    }
  })

  it('is project-scoped and refuses inactive or paused', () => {
    const block = admin.slice(admin.indexOf("if (action === 'schedule_readonly_evaluation')"),
                              admin.indexOf('// ── create_instance ──'))
    expect(block).toMatch(/assertProjectAllowed/)
    expect(block).toMatch(/instance_not_active/)
    expect(block).toMatch(/project_paused/)
  })
})

// ── Legacy ──────────────────────────────────────────────────────────────────

describe('legacy isolation', () => {
  it('the seam only ever touches bound action runs', () => {
    expect(sched).toMatch(/\.eq\('workflow_instance_id', instance\.id\)/)
  })

  it('no flag is read or changed', () => {
    for (const src of [sched, disc]) {
      expect(src).not.toMatch(/H1_POLICY_GATE|H1_SPEND_GATE|process\.env/)
    }
  })
})
