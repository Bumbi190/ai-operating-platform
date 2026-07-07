/**
 * Navigation-intent detection.
 *
 * A direct imperative command must be recognised as navigation intent so the
 * chat route forces a navigate tool call on turn 0 — no second confirmation
 * turn. Browsing/questions and "show me how"-style asks must NOT trigger it.
 */
import { describe, it, expect } from 'vitest'
import { isNavIntent } from '@/lib/atlas/nav-intent'

describe('isNavIntent — direct navigation commands (must be true)', () => {
  const commands = [
    'Open The Prompt',
    'Open GainPilot',
    'Open Familje-Stunden',
    'Open approvals',
    'Open failed runs',
    'Take me to approvals',
    'Go to The Prompt',
    'Visa The Prompt',
    'Öppna The Prompt',
    'Ta mig till The Prompt',
    'Show failed runs',
    // polite prefixes still count
    'Kan du öppna The Prompt',
    'Please open approvals',
    'navigate to revenue',
    'gå till kostnader',
  ]
  for (const c of commands) {
    it(`true: "${c}"`, () => expect(isNavIntent(c)).toBe(true))
  }
})

describe('isNavIntent — non-navigation (must be false)', () => {
  const nonNav = [
    'Vad händer idag?',
    'How are the businesses doing?',
    'Kör Fetch AI News',
    'Summarize this week',
    'Sammanfatta veckan',
    'show me how to publish a reel', // "how to" question, not a view-open
    'Show me how it works',
    'Visa hur man gör',
    'Hur många godkännanden väntar?',
    'I want to open a new campaign later', // not a leading imperative open
    '',
  ]
  for (const c of nonNav) {
    it(`false: "${c}"`, () => expect(isNavIntent(c)).toBe(false))
  }
})
