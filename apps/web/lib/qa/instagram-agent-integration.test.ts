import { describe, expect, it } from 'vitest'
import {
  INSTAGRAM_AGENT_SOURCE,
  INSTAGRAM_AGENT_PROMPT_GUIDANCE,
  INSTAGRAM_AGENT_FAMILY_GUIDANCE,
  INSTAGRAM_AGENT_REVIEW_GUIDANCE,
} from '../content-growth/instagram-agent'
import {
  THE_PROMPT_GROWTH_GUIDANCE,
  FAMILJE_STUNDEN_GROWTH_GUIDANCE,
  CONTENT_GROWTH_QA_GUIDANCE,
} from '../content-growth/guidance'
import { buildScriptSystem } from '../media/script-prompt'
import { buildDrafterUserMessage } from '../marketing/drafter'

const theme = {
  name: 'Vinter', monthSv: 'december', symbols: ['snöflinga'],
  focus: 'vinterlek', themeKey: 'vinter', mustNot: [],
} as unknown as Parameters<typeof buildDrafterUserMessage>[1]

describe('Instagram Agent editorial integration', () => {
  it('pins provenance and a strictly editorial-only boundary', () => {
    expect(INSTAGRAM_AGENT_SOURCE.license).toBe('MIT')
    expect(INSTAGRAM_AGENT_SOURCE.mode).toBe('editorial-only')
    expect(INSTAGRAM_AGENT_SOURCE.repository).toContain('instagram-agent-skill')
    expect(INSTAGRAM_AGENT_PROMPT_GUIDANCE).toContain('NEVER label a hook as proven or viral')
    expect(INSTAGRAM_AGENT_REVIEW_GUIDANCE).toContain('script-level only')
  })

  it('uses distinct English hook candidates in The Prompt media script, preserving JSON and voice', () => {
    const prompt = buildScriptSystem()
    expect(prompt).toContain(INSTAGRAM_AGENT_PROMPT_GUIDANCE)
    expect(prompt).toContain('three DIFFERENT truthful structures')
    expect(prompt).toContain('named-actor/verified-fact')
    expect(prompt).toContain('Victoria')
    expect(prompt).toContain('Return ONLY valid JSON')
    expect(prompt).toContain('never both')
    expect(prompt).toContain('clear verified takeaway')
    for (const field of ['"hook"', '"script"', '"captions"', '"hashtags"', '"cta"']) {
      expect(prompt).toContain(field)
    }
    expect(THE_PROMPT_GROWTH_GUIDANCE).toContain('INSTAGRAM HOOK LAB')
    expect(prompt).not.toContain('INSTAGRAM REEL IDÉTEST')
  })

  it('keeps child-safe Swedish Reel advice scoped to family Reel drafts only', () => {
    const params = {
      format: 'reel', channel: 'instagram', beat: 'launch',
      objective: 'save', cta: { label: 'Se aktiviteten' },
    }
    const familyReel = buildDrafterUserMessage(params, theme)
    const familyPost = buildDrafterUserMessage({ ...params, format: 'single_post' }, theme)
    expect(familyReel).toContain(INSTAGRAM_AGENT_FAMILY_GUIDANCE)
    expect(familyReel).toContain('endast Familje-Stunden')
    expect(familyReel).toContain('Engelskspråkiga Python-verktyg')
    expect(familyReel).toContain('"reel_spec"')
    expect(familyReel).toContain('SVARA MED ENBART DENNA JSON')
    expect(FAMILJE_STUNDEN_GROWTH_GUIDANCE).not.toContain('The Prompt')
    expect(familyReel).not.toContain('INSTAGRAM HOOK LAB')
    expect(familyPost).not.toContain('INSTAGRAM REEL IDÉTEST')
  })

  it('adds read-only quality review, never modifies the existing threshold contract', () => {
    expect(CONTENT_GROWTH_QA_GUIDANCE).toContain(INSTAGRAM_AGENT_REVIEW_GUIDANCE)
    expect(CONTENT_GROWTH_QA_GUIDANCE).toContain('six numeric scoring dimensions')
    expect(CONTENT_GROWTH_QA_GUIDANCE).toContain('script-level only')
    expect(CONTENT_GROWTH_QA_GUIDANCE).not.toContain('publish now')
  })
})
