import { describe, expect, it } from 'vitest'
import {
  CONTENT_GROWTH_VERSION,
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

describe('project-scoped content growth', () => {
  it('provides explicit project boundaries and non-executable editorial advice', () => {
    expect(CONTENT_GROWTH_VERSION).toContain('content-growth')
    expect(THE_PROMPT_GROWTH_GUIDANCE).toContain('verified source')
    expect(FAMILJE_STUNDEN_GROWTH_GUIDANCE).toContain('approved')
    expect(FAMILJE_STUNDEN_GROWTH_GUIDANCE).not.toContain('The Prompt')
    expect(CONTENT_GROWTH_QA_GUIDANCE).toContain('script-level only')
  })

  it('adds visual-first guidance to The Prompt without changing the JSON contract', () => {
    const prompt = buildScriptSystem()
    expect(prompt).toContain('VISUAL-FIRST REEL DIRECTION')
    expect(prompt).toContain('Return ONLY valid JSON')
    expect(prompt).toContain('"hook"')
    expect(prompt).not.toContain('REEL STORYBOARD DIRECTION')
  })

  it('adds family-safe storyboard guidance only to family reels', () => {
    const reel = buildDrafterUserMessage({
      format: 'reel', channel: 'instagram', beat: 'launch', objective: 'save',
      cta: { label: 'Se aktiviteten' },
    }, theme)
    const post = buildDrafterUserMessage({
      format: 'single_post', channel: 'instagram', beat: 'launch', objective: 'save',
      cta: { label: 'Se aktiviteten' },
    }, theme)
    expect(reel).toContain('REEL STORYBOARD DIRECTION')
    expect(reel).toContain('"reel_spec"')
    expect(reel).toContain('SVARA MED ENBART DENNA JSON')
    expect(post).not.toContain('REEL STORYBOARD DIRECTION')
  })
})
