/**
 * lib/qa/monthly-release-v2.test.ts — Phase 2B-0: the canonical story contract.
 *
 * v2 adds STORY authority to the definition: language, audience, page structure,
 * content-page text density, and pointers to the story and character contracts.
 *
 * The properties under test are not "does v2 parse" but the two that make a
 * second version safe: v1 must be untouched, and v2 must not have become a place
 * where product canon can be quietly invented or a second Nova can appear.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'

import {
  FAMILJE_STUNDEN_MONTHLY_RELEASE, findVendoredDefinition, loadVendoredDefinitions,
} from '@/lib/workflows/definitions'
import { assertRegistryMatchesDefinition } from '@/lib/workflows/action-registry'

const DEF_DIR = fileURLToPath(new URL('../workflows/definitions/', import.meta.url))

const v1 = () => findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 1)!
const v2 = () => findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 2)!
const canon2 = () => v2().spec.canonical as Record<string, any>
const canon1 = () => v1().spec.canonical as Record<string, any>

// ── v1 immutability ─────────────────────────────────────────────────────────

describe('v1 is registered in production and must not move', () => {
  it('MUTATION — the v1 YAML still hashes to the pinned upstream value', () => {
    const sha = createHash('sha256')
      .update(readFileSync(DEF_DIR + 'familje-stunden.monthly-release.v1.yaml'))
      .digest('hex')
    expect(sha).toBe('88d9cc31fe57181e974d1e37c8968eee40bc8cc11e1745fe0a85205e98fa1bed')
    expect(v1().source_sha256).toBe(sha)
  })

  it('MUTATION — the v1 def_hash is unchanged, so the registered row still matches', () => {
    // The value in production `workflow_defs` for familje-stunden.monthly-release v1.
    expect(v1().def_hash)
      .toBe('eef18502d2de6aa9017b63a7b174f00638fd3dbc9ae74575d13f3040b0dd5f2c')
  })

  it('v1 carries no story authority — that is exactly why v2 exists', () => {
    for (const key of ['language', 'audience', 'page_structure', 'content_page_text',
                       'story_contract', 'character_contracts']) {
      expect(canon1()[key], key).toBeUndefined()
    }
  })

  it('v2 is a separate version, not an edit', () => {
    expect(v2().version).toBe(2)
    expect(v2().def_hash).not.toBe(v1().def_hash)
    expect(v2().source_path).toBe('docs/MONTHLY_RELEASE_WORKFLOW_V2.yaml')
    expect(v1().source_path).toBe('docs/MONTHLY_RELEASE_WORKFLOW_V1.yaml')
  })
})

// ── Vendoring chain ─────────────────────────────────────────────────────────

describe('v2 is vendored, never authored here', () => {
  it('the vendored YAML matches the pinned upstream hash', () => {
    const sha = createHash('sha256')
      .update(readFileSync(DEF_DIR + 'familje-stunden.monthly-release.v2.yaml'))
      .digest('hex')
    // Upstream: familje-stunden-v2 docs/MONTHLY_RELEASE_WORKFLOW_V2.yaml @ 3aaffc1
    expect(sha).toBe('0cfd18242b8bdc3a285ccca164b6a89d1a508dd54c57a63f9202d566b7ea1e76')
    expect(v2().source_sha256).toBe(sha)
  })

  it('provenance is vendored_upstream from the product repo', () => {
    expect(v2().provenance).toBe('vendored_upstream')
    expect(v2().source_repo).toBe('familje-stunden-v2')
  })

  it('the committed JSON is the generated form of the vendored YAML', () => {
    const json = readFileSync(DEF_DIR + 'familje-stunden.monthly-release.v2.json', 'utf8')
    expect(json.endsWith('\n')).toBe(true)
    expect(json).toBe(JSON.stringify(JSON.parse(json), null, 2) + '\n')
  })
})

// ── The Editor decisions, as canonical values ───────────────────────────────

describe('the Editor decisions of 2026-09-04 are canonical in v2', () => {
  it('language is sv, stated rather than implied', () => {
    expect(canon2().language).toBe('sv')
  })

  it('audience is 3–8', () => {
    expect(canon2().audience.min_age).toBe(3)
    expect(canon2().audience.max_age).toBe(8)
  })

  it('MUTATION — 18 total = 1 cover + 16 content + 1 closing', () => {
    const p = canon2().page_structure
    expect(p.total_pages).toBe(18)
    expect(p.cover_pages).toBe(1)
    expect(p.content_pages).toBe(16)
    expect(p.closing_pages).toBe(1)
    // The arithmetic is the point: a consumer must never have to guess which
    // number 18 is. Getting this wrong breaks storyLabels(16) and 500s the ebook.
    expect(p.cover_pages + p.content_pages + p.closing_pages).toBe(p.total_pages)
  })

  it('the page structure agrees with the audio and ebook counts', () => {
    expect(canon2().ebook_pages).toBe(canon2().page_structure.total_pages)
    expect(canon2().page_audio_clips).toBe(canon2().page_structure.total_pages)
  })

  it('MUTATION — content-page density is 1–2 sentences, hard max 3', () => {
    const t = canon2().content_page_text
    expect(t.target_sentences_min).toBe(1)
    expect(t.target_sentences_max).toBe(2)
    expect(t.hard_max_sentences).toBe(3)
    expect(t.hard_max_sentences).toBeGreaterThan(t.target_sentences_max)
  })

  it('no word-count limit was invented', () => {
    const t = JSON.stringify(canon2().content_page_text)
    expect(t).not.toMatch(/word|ord_|max_words/i)
  })

  it('October stays Rymdmånaden and November Löv- & Skuggmånaden', () => {
    // The stale Teman.txt ordering swaps these. It must never be applied.
    expect(canon2().year_order_2026['2026-10']).toBe('Rymdmånaden')
    expect(canon2().year_order_2026['2026-11']).toBe('Löv- & Skuggmånaden')
    expect(canon2().year_order_2026).toEqual(canon1().year_order_2026)
  })
})

// ── One character authority ─────────────────────────────────────────────────

describe('v2 references character identity, never restates it', () => {
  it('points at both character contracts with pinned versions', () => {
    const refs = canon2().character_contracts as Array<Record<string, string>>
    expect(refs.map(r => r.character).sort()).toEqual(['nova', 'pling'])
    for (const r of refs) {
      expect(r.path).toMatch(/^docs\/creative\/.*_CHARACTER_CONTRACT\.md$/)
      expect(r.version, r.character).toBeTruthy()
    }
  })

  it('points at the story contract with a pinned version', () => {
    expect(canon2().story_contract.path).toBe('docs/creative/STORY_CONTRACT.md')
    expect(canon2().story_contract.version).toBe('1.0')
  })

  it('MUTATION — no character APPEARANCE leaks into the definition', () => {
    // A second description of Nova is a second Nova. The definition may name the
    // characters; it may not describe them.
    const blob = JSON.stringify(canon2())
    for (const forbidden of [
      /ponytail|hästsvans/i, /headband|pannband/i, /antenn/i, /visor|visir/i,
      /face screen|ansiktspanel/i, /jacket|jacka/i, /hair|hår\b/i, /cyan/i,
      /humanoid/i, /robot/i,
    ]) {
      expect(blob, String(forbidden)).not.toMatch(forbidden)
    }
  })
})

// ── Product canon stays product canon ───────────────────────────────────────

describe('no provider, model or prompt configuration enters product canon', () => {
  it('MUTATION — the canonical block names no provider, model or prompt', () => {
    const blob = JSON.stringify(canon2())
    for (const forbidden of [
      /anthropic|openai|claude|gpt-|muapi|ideogram|higgsfield/i,
      /temperature|max_tokens|top_p|system_prompt|\bprompt\b/i,
      /api[_-]?key|endpoint/i,
    ]) {
      expect(blob, String(forbidden)).not.toMatch(forbidden)
    }
  })

  it('the ONE model reference is the TTS voice, which is a product decision', () => {
    // `voice.model` predates v2 and describes the approved narration voice, not a
    // generation provider. Named here so the guard above cannot be read as
    // forbidding it by accident.
    expect(canon2().voice.model).toBe('eleven_v3')
    expect(canon2().voice).toEqual(canon1().voice)
  })
})

// ── Text authority and approval ─────────────────────────────────────────────

describe('canonical story text stays the downstream authority', () => {
  const state = (v: ReturnType<typeof v2>, id: string) =>
    v.spec.states.find(s => s.id === id)!

  it('MUTATION — the editor gate on content_generation is still required', () => {
    const cg = state(v2(), 'content_generation')
    expect(cg.human_gate.required).toBe(true)
    expect(cg.human_gate.approver).toBe('editor')
    expect(cg.human_gate.decision).toBe('Sagatexten godkänd')
  })

  it('content_generation still declares karaktärskanon as an input', () => {
    expect(state(v2(), 'content_generation').inputs).toContain('karaktärskanon')
  })

  it('v2 records the 16-content-page rule where a reader will hit it', () => {
    const cg = state(v2(), 'content_generation')
    expect(`${cg.description} ${cg.verification.join(' ')}`).toMatch(/16 innehållssidor/)
  })

  it('every human gate v1 required, v2 still requires', () => {
    for (const s1 of v1().spec.states) {
      const s2 = state(v2(), s1.id)
      expect(s2.human_gate.required, s1.id).toBe(s1.human_gate.required)
    }
  })
})

// ── The state graph did not move ────────────────────────────────────────────

describe('v2 changes the contract, not the process', () => {
  it('MUTATION — v1 and v2 declare identical state ids in identical order', () => {
    expect(v2().spec.states.map(s => s.id)).toEqual(v1().spec.states.map(s => s.id))
  })

  it('every state keeps its automated_actions, so def_key lookup stays unambiguous', () => {
    // `assertRegistryMatchesDefinition` resolves a placement by def_key alone and
    // takes the FIRST match. Divergent state graphs would make its answer depend
    // on array order.
    for (const s1 of v1().spec.states) {
      const s2 = v2().spec.states.find(s => s.id === s1.id)!
      expect(s2.automated_actions, s1.id).toEqual(s1.automated_actions)
      expect(s2.next_state, s1.id).toBe(s1.next_state)
    }
  })

  it('the action registry still matches the definition', () => {
    expect(assertRegistryMatchesDefinition()).toEqual([])
  })

  it('v2 activates nothing — it is still draft', () => {
    expect(v2().spec.status).toBe('draft')
  })
})

// ── Unresolved visual decisions stay unresolved ─────────────────────────────

describe('promoting the story did not promote the visual unknowns', () => {
  it('MUTATION — v2 declares no wardrobe, antenna or reference-asset canon', () => {
    const blob = JSON.stringify(canon2())
    for (const forbidden of [/wardrobe|garderob/i, /antenna_tip|antenn_/i,
                             /reference_asset|referensbild/i, /clothing/i]) {
      expect(blob, String(forbidden)).not.toMatch(forbidden)
    }
  })

  it('the character contracts are still pinned at their DRAFT versions', () => {
    // Honest provenance: the story contract reached v1.0; the character contracts
    // did not, and v2 must not imply otherwise.
    const refs = canon2().character_contracts as Array<Record<string, string>>
    for (const r of refs) expect(r.version, r.character).toMatch(/draft/)
  })
})

// ── The loader ──────────────────────────────────────────────────────────────

describe('both versions load side by side', () => {
  it('exactly two Familje-Stunden versions are vendored', () => {
    const fs = loadVendoredDefinitions().filter(d => d.def_key === FAMILJE_STUNDEN_MONTHLY_RELEASE)
    expect(fs.map(d => d.version).sort()).toEqual([1, 2])
  })

  it('each version resolves to itself', () => {
    expect(findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 1)!.version).toBe(1)
    expect(findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 2)!.version).toBe(2)
    expect(findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 3)).toBeNull()
  })
})
