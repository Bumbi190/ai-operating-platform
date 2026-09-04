/**
 * The vendored Familje-Stunden monthly-release definition.
 *
 * This suite is the DRIFT PIN. The canonical file lives in another repository;
 * these assertions are what stop the vendored copy from quietly diverging, and
 * what force an upstream change to become a new VERSION rather than an edit to
 * v1 under a live instance.
 *
 * The canonical values asserted below are transcribed from the runbook on
 * purpose — they are the facts it says must never be derived from code, file
 * names or memory, so a test that read them back out of the same JSON it is
 * checking would assert nothing.
 */

import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { computeDefHash, parseWorkflowSpec } from '@/lib/workflows/spec'
import {
  FAMILJE_STUNDEN_MONTHLY_RELEASE,
  findVendoredDefinition,
  loadVendoredDefinitions,
} from '@/lib/workflows/definitions'

const DEF_DIR = fileURLToPath(new URL('../workflows/definitions/', import.meta.url))
const YAML_FILE = 'familje-stunden.monthly-release.v1.yaml'
const JSON_FILE = 'familje-stunden.monthly-release.v1.json'

const def = () => {
  const d = findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 1)
  if (!d) throw new Error('definition not vendored')
  return d
}

describe('vendored definition — provenance', () => {
  it('the vendored YAML matches the pinned upstream hash', () => {
    const bytes = readFileSync(DEF_DIR + YAML_FILE)
    const sha = createHash('sha256').update(bytes).digest('hex')
    // Upstream: familje-stunden-v2 docs/MONTHLY_RELEASE_WORKFLOW_V1.yaml
    expect(sha).toBe('88d9cc31fe57181e974d1e37c8968eee40bc8cc11e1745fe0a85205e98fa1bed')
    expect(def().source_sha256).toBe(sha)
  })

  it('the committed JSON is the generated form of the vendored YAML', () => {
    // Guards the same property scripts/build-workflow-def.mjs --check guards, so a
    // hand-edited .json cannot pass CI while the .yaml says otherwise.
    const json = readFileSync(DEF_DIR + JSON_FILE, 'utf8')
    expect(json.endsWith('\n')).toBe(true)
    const reserialized = JSON.stringify(JSON.parse(json), null, 2) + '\n'
    expect(json).toBe(reserialized)
  })

  it('records where the canonical file lives', () => {
    expect(def().source_repo).toBe('familje-stunden-v2')
    expect(def().source_path).toBe('docs/MONTHLY_RELEASE_WORKFLOW_V1.yaml')
  })
})

describe('vendored definition — parses', () => {
  it('loads without throwing; Familje-Stunden is the only VENDORED_UPSTREAM source', () => {
    const all = loadVendoredDefinitions()
    // PR9h added an Omnira-authored validation definition alongside it. The
    // property worth pinning is not the count but the provenance split: exactly
    // one PRODUCT REPO supplies definitions, and it is this one.
    const upstream = all.filter(d => d.provenance === 'vendored_upstream')
    // Phase 2B-0 vendored v2 alongside v1. The split is unchanged — one repo,
    // one def_key — so the assertion pins the SOURCE rather than a version count,
    // which is what the paragraph above always meant.
    expect([...new Set(upstream.map(d => d.source_repo))]).toEqual(['familje-stunden-v2'])
    expect([...new Set(upstream.map(d => d.def_key))]).toEqual(['familje-stunden.monthly-release'])
    expect(upstream.map(d => d.version).sort()).toEqual([1, 2])
    // Phase 1B-2 added a second Omnira-authored definition. The pinned property
    // is unchanged and is asserted above: exactly ONE definition is copied from a
    // product repo. Everything else is Omnira describing its own procedures.
    expect(all.filter(d => d.provenance === 'authored_here').map(d => d.def_key).sort())
      .toEqual(['omnira.probe-validation', 'omnira.release-gate-proof'])
  })

  it('declares all 19 states in canonical order', () => {
    expect(def().spec.states.map(s => s.id)).toEqual([
      'planning', 'content_generation', 'visual_generation', 'pdf_build', 'ebook_build',
      'audio_generation', 'local_qa', 'approval_content', 'backend_release_gate',
      'protected_upload', 'edge_deploy', 'frontend_deploy', 'admin_qa', 'approval_release',
      'scheduled_release', 'post_release_qa', 'newsletter', 'social', 'complete',
    ])
  })

  it('derives planning as the only entry and complete as the only terminal', () => {
    expect(def().spec.initial_state).toBe('planning')
    expect(def().spec.terminal_states).toEqual(['complete'])
  })

  it('is identified as familje-stunden.monthly-release v1', () => {
    expect(def().spec.def_key).toBe(FAMILJE_STUNDEN_MONTHLY_RELEASE)
    expect(def().spec.version).toBe(1)
    expect(def().spec.source_of_truth).toBe('docs/MONTHLY_RELEASE_RUNBOOK.md')
  })
})

describe('vendored definition — human gates', () => {
  /**
   * The handoff document's table has twelve ROWS but names thirteen gated
   * STATES: newsletter and social share a row. Thirteen is the number that
   * matters to the engine, so it is the number asserted here.
   */
  it('gates exactly the states the handoff document names', () => {
    const gated = def().spec.states.filter(s => s.human_gate.required).map(s => s.id)
    expect(gated).toEqual([
      'planning', 'content_generation', 'visual_generation', 'audio_generation',
      'local_qa', 'approval_content', 'backend_release_gate', 'protected_upload',
      'frontend_deploy', 'admin_qa', 'approval_release', 'newsletter', 'social',
    ])
  })

  it('binds the four spend/write/upload/comms gates to their hard gate', () => {
    const byId = new Map(def().spec.states.map(s => [s.id, s]))
    expect(byId.get('audio_generation')!.human_gate.gate_ref).toBe('no_spend_without_approval')
    expect(byId.get('backend_release_gate')!.human_gate.gate_ref)
      .toBe('no_production_db_write_without_approval')
    expect(byId.get('protected_upload')!.human_gate.gate_ref).toBe('no_upload_before_local_qa')
    expect(byId.get('newsletter')!.human_gate.gate_ref).toBe('no_comms_before_release_verified')
    expect(byId.get('social')!.human_gate.gate_ref).toBe('no_comms_before_release_verified')
  })
})

describe('vendored definition — the ordering that protects the fail-open gate', () => {
  it('routes backend_release_gate BEFORE protected_upload', () => {
    const byId = new Map(def().spec.states.map(s => [s.id, s]))
    // The runbook's most dangerous property: a month with no month_releases row
    // counts as released, so material becomes public the second it is uploaded.
    expect(byId.get('approval_content')!.next_state).toBe('backend_release_gate')
    expect(byId.get('backend_release_gate')!.next_state).toBe('protected_upload')
    expect(byId.get('protected_upload')!.prerequisites).toEqual(['backend_release_gate'])
  })

  it('puts both QA passes before any communication', () => {
    const byId = new Map(def().spec.states.map(s => [s.id, s]))
    expect(byId.get('admin_qa')!.next_state).toBe('approval_release')
    expect(byId.get('post_release_qa')!.next_state).toBe('newsletter')
    expect(byId.get('newsletter')!.prerequisites).toEqual(['post_release_qa'])
    expect(byId.get('social')!.prerequisites).toEqual(['newsletter'])
  })

  it('never auto-retries an irreversible step', () => {
    const byId = new Map(def().spec.states.map(s => [s.id, s]))
    for (const id of ['audio_generation', 'backend_release_gate', 'protected_upload', 'newsletter', 'social']) {
      expect(byId.get(id)!.retry_policy).toBe('never_auto')
    }
  })
})

describe('vendored definition — canonical block carried verbatim', () => {
  it('keeps the 2026 theme order the runbook locks', () => {
    const order = def().spec.canonical.year_order_2026 as Record<string, string>
    expect(order).toEqual({
      '2026-09': 'Skördemånaden',
      '2026-10': 'Rymdmånaden',
      '2026-11': 'Löv- & Skuggmånaden',
      '2026-12': 'Julmånaden',
    })
  })

  it('keeps the page and clip counts', () => {
    expect(def().spec.canonical.ebook_pages).toBe(18)
    expect(def().spec.canonical.page_audio_clips).toBe(18)
  })

  it('keeps the golden-reference voice identity', () => {
    const voice = def().spec.canonical.voice as Record<string, unknown>
    expect(voice.id).toBe('ZSHzpa6aUvhjzShiBmYw')
    expect(voice.model).toBe('eleven_v3')
  })
})

describe('vendored definition — hash', () => {
  it('def_hash is deterministic across repeated computation', () => {
    const parsed = parseWorkflowSpec(
      JSON.parse(readFileSync(DEF_DIR + JSON_FILE, 'utf8')),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(computeDefHash(parsed.spec)).toBe(computeDefHash(parsed.spec))
    expect(computeDefHash(parsed.spec)).toBe(def().def_hash)
    expect(def().def_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('def_hash is insensitive to key order in the source document', () => {
    const raw = JSON.parse(readFileSync(DEF_DIR + JSON_FILE, 'utf8')) as Record<string, unknown>
    const reversed = Object.fromEntries(Object.entries(raw).reverse())
    const a = parseWorkflowSpec(raw)
    const b = parseWorkflowSpec(reversed)
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(computeDefHash(b.spec)).toBe(computeDefHash(a.spec))
  })

  it('def_hash moves when a modelled value changes', () => {
    const raw = JSON.parse(readFileSync(DEF_DIR + JSON_FILE, 'utf8')) as Record<string, unknown>
    const base = parseWorkflowSpec(raw)
    expect(base.ok).toBe(true)
    if (!base.ok) return

    const mutated = JSON.parse(readFileSync(DEF_DIR + JSON_FILE, 'utf8')) as Record<string, unknown>
    const states = mutated.states as Record<string, unknown>[]
    const audio = states.find(s => s.id === 'audio_generation')!
    audio.retry_policy = 'transient'          // a real governance change
    const after = parseWorkflowSpec(mutated)
    expect(after.ok).toBe(true)
    if (!after.ok) return

    expect(computeDefHash(after.spec)).not.toBe(computeDefHash(base.spec))
  })
})
