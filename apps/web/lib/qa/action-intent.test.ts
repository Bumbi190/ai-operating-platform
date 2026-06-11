/**
 * Atlas action-intent detection.
 *
 * When the operator asks Atlas to DO something (run/publish/delegate/create
 * tasks), isActionIntent must return true so the route forces a tool call —
 * otherwise Atlas narrates the action without executing it (the Dream-delegation
 * bug). It must NOT fire on pure questions / read requests.
 */
import { describe, it, expect } from 'vitest'
import { isActionIntent } from '@/lib/atlas/action-intent'

describe('isActionIntent — delegation / task creation (the Dream bug)', () => {
  const actions = [
    'delegate the critical findings',
    'delegate all critical Dream issues',
    'create tasks from the critical findings',
    'delegera de kritiska fynden',
    'delegera alla kritiska Dream-ärenden',
    'skapa uppgifter från de kritiska fynden',
    'kan du delegera dem',
  ]
  for (const a of actions) {
    it(`forces a tool for: "${a}"`, () => expect(isActionIntent(a)).toBe(true))
  }
})

describe('isActionIntent — existing action coverage still holds', () => {
  const actions = [
    'publicera inlägget',
    'kör Fetch AI News',
    'starta workflow',
    'trigga arbetsflöde',
    'generera ett manus',
  ]
  for (const a of actions) {
    it(`forces a tool for: "${a}"`, () => expect(isActionIntent(a)).toBe(true))
  }
})

describe('isActionIntent — does NOT fire on reads / questions', () => {
  const reads = [
    'vilka kritiska Dream-fynd finns?',
    'visa Dream-fynden för The Prompt',
    'sammanfatta de kritiska fynden',
    'hur går det idag?',
    'vad väntar på godkännande?',
  ]
  for (const r of reads) {
    it(`does not force a tool for: "${r}"`, () => expect(isActionIntent(r)).toBe(false))
  }
})

describe('isActionIntent — recall questions about delegation are NOT actions (no forced re-fetch)', () => {
  const recalls = [
    'What did you just delegate?',
    'Which tasks did you delegate?',
    'Vilka uppgifter delegerade du nyss?',
    'Vad delegerade du?',
    'have you delegated the critical findings?',
  ]
  for (const r of recalls) {
    it(`does not force a tool for recall: "${r}"`, () => expect(isActionIntent(r)).toBe(false))
  }

  // Imperative delegation requests must STILL force a tool.
  const actions = ['delegate the critical Dream findings', 'Delegera de kritiska fynden', 'create tasks from the critical findings']
  for (const a of actions) {
    it(`still forces a tool for imperative: "${a}"`, () => expect(isActionIntent(a)).toBe(true))
  }
})
