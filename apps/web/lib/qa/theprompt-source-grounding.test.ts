import { describe, expect, it } from 'vitest'
import { buildScriptSystem } from '../media/script-prompt'

describe('The Prompt source-grounded script instructions', () => {
  it('requires factual backing for claims, dates, figures and company capabilities', () => {
    const instructions = buildScriptSystem()
    expect(instructions).toContain('FACTUAL SOURCE LOCK')
    expect(instructions).toContain('HIGHEST PRIORITY')
    expect(instructions).toContain('NEVER invent or imply numbers')
    expect(instructions).toContain('human-equivalent')
    expect(instructions).toContain('Only say "just" if the source explicitly supports recency')
    expect(instructions).toContain('SOURCE-SUPPORTED facts')
    expect(instructions).toContain('independent review may still reject')
  })

  it('keeps factual source constraints above untrusted competitor hook examples', () => {
    const instructions = buildScriptSystem(['An AI secretly replaced everyone overnight'])
    expect(instructions).toContain('FACTUAL SOURCE LOCK')
    expect(instructions).toContain('competitor trends')
    expect(instructions).toContain('STYLE TEMPLATES ONLY — NOT FACTUAL EXAMPLES')
    expect(instructions).toContain('An AI secretly replaced everyone overnight')
    expect(instructions).toContain('Editorial QA and independent review may still reject')
  })

  it('never instructs the model to invent recency, autonomous actions, or fake interfaces', () => {
    const instructions = buildScriptSystem()
    expect(instructions).toContain('AUTONOMY AND CONSENT')
    expect(instructions).toContain('VISUAL TRUTH TEST')
    expect(instructions).toContain('Never say a model automatically did something')
    expect(instructions).toContain('human authorization')
    expect(instructions).toContain('honestly labelled conceptual explanation')
    expect(instructions).toContain('source-grounded stake. Max 12 words. No unverified recency/autonomy')
    expect(instructions).not.toContain('"hook": "Named actor + just')
    expect(instructions).not.toContain('Trump just signed')
    expect(instructions).not.toContain('Braintrust just eliminated')
  })
})
