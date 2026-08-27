/**
 * Status intent + honesty precision — unit contracts.
 *
 * Two defects are pinned here. The status classifier had to start carrying the
 * operator's time window, because an unlabelled figure with no stated period is
 * free to be reported as "today". And the honesty guard was wrong in BOTH
 * directions at once: it fired on any sentence containing an action verb
 * regardless of who the subject was, while missing past-tense claims entirely —
 * so a status report drew an execution warning and "jag publicerade videon"
 * did not.
 */

import { describe, it, expect } from 'vitest'
import {
  classifyStatusIntent,
  renderStatusDirective,
  type StatusIntent,
} from '@/lib/atlas/status-intent'
import { isUnsupportedActionClaim, ACTION_CLAIM_RE } from '@/lib/atlas/honesty'

const intent = (s: string) => classifyStatusIntent(s) as StatusIntent

describe('status intent — project resolution', () => {
  it('resolves the required project cases to canonical slugs', () => {
    expect(intent('Hur har The Prompt gått idag?').projectSlug).toBe('ai-media-automation')
    expect(intent('Vad är status på The Prompt idag?').projectSlug).toBe('ai-media-automation')
    expect(intent('Hur går det för The Prompt idag?').projectSlug).toBe('ai-media-automation')
    expect(intent('Hur har Familje-Stunden gått idag?').projectSlug).toBe('familje-stunden')
    expect(intent('Vad är status på Familje-Stunden?').projectSlug).toBe('familje-stunden')
    expect(intent('Hur går det för GainPilot?').projectSlug).toBe('gainpilot')
  })

  it('exposes the display name from the canonical profile', () => {
    expect(intent('Hur har The Prompt gått idag?').projectName).toBe('The Prompt')
    expect(intent('Vad är status på Familje-Stunden?').projectName).toBe('Familje-Stunden')
  })

  it('does NOT guess a project for generic forms', () => {
    // These depend on conversation/view context; binding them to a business here
    // would be worse than leaving them unresolved.
    expect(intent('Hur går det?').projectSlug).toBeNull()
    expect(intent('Vad är status på projektet?').projectSlug).toBeNull()
    expect(intent('Hur är läget?').projectSlug).toBeNull()
  })

  it('does NOT guess when two businesses are named', () => {
    const i = intent('Hur går det för The Prompt och GainPilot?')
    expect(i.projectSlug).toBeNull()
  })

  it('does not fire on a substring of a longer word', () => {
    // "prompt" is an alias; "prompten"/"prompts" must not resolve it.
    expect(intent('Hur går det med prompten?').projectSlug).toBeNull()
  })
})

describe('status intent — temporal scope', () => {
  it('maps the required temporal wordings', () => {
    expect(intent('Hur har The Prompt gått idag?').scope).toBe('day')
    expect(intent('Hur har The Prompt gått i dag?').scope).toBe('day')
    expect(intent('Hur har The Prompt gått denna vecka?').scope).toBe('week')
    expect(intent('Hur har The Prompt gått den här veckan?').scope).toBe('week')
    expect(intent('Hur går The Prompt den här månaden?').scope).toBe('month')
    expect(intent('Hur går The Prompt denna månad?').scope).toBe('month')
  })

  it('invents no scope when none was asked for', () => {
    expect(intent('Hur går det för The Prompt?').scope).toBe('current')
    expect(intent('Vad är status på Familje-Stunden?').scope).toBe('current')
  })

  it('prefers the most specific period when several could match', () => {
    expect(intent('Hur har The Prompt gått denna vecka?').scope).toBe('week')
    expect(intent('Hur har The Prompt gått denna månad?').scope).toBe('month')
  })
})

describe('status intent — what is NOT a status request', () => {
  it('rejects action requests even when they mention status words', () => {
    expect(classifyStatusIntent('Publicera nästa video')).toBeNull()
    expect(classifyStatusIntent('Kör workflowet')).toBeNull()
    expect(classifyStatusIntent('Starta workflowet')).toBeNull()
    expect(classifyStatusIntent('Kör status-workflowet')).toBeNull()
  })

  it('rejects greetings and unrelated conversation', () => {
    for (const s of ['Hej', 'Tack', 'Vem är du?', 'Vad är klockan i New York?']) {
      expect(classifyStatusIntent(s), s).toBeNull()
    }
  })

  it('fails closed on junk input', () => {
    for (const s of [null, undefined, 42, {}, '', '   ']) {
      expect(classifyStatusIntent(s as unknown)).toBeNull()
    }
  })
})

describe('status directive — grounding rules, not a templated answer', () => {
  it('states the resolved project and period', () => {
    const d = renderStatusDirective(intent('Hur har The Prompt gått idag?'))
    expect(d).toContain('The Prompt')
    expect(d).toContain('idag')
  })

  it('tells Atlas not to guess when no project was named', () => {
    const d = renderStatusDirective(intent('Hur går det?'))
    expect(d).toMatch(/Gissa aldrig ett projekt/i)
  })

  it('separates period events from current state, and forbids silent widening', () => {
    const d = renderStatusDirective(intent('Hur har The Prompt gått idag?'))
    expect(d).toMatch(/NULÄGE/)
    expect(d).toMatch(/utan periodetikett/i)
    expect(d).toMatch(/Byt aldrig tyst till en bredare period/i)
  })

  it('contains no business figures — the answer stays Atlas’s to synthesise', () => {
    const d = renderStatusDirective(intent('Hur har The Prompt gått idag?'))
    expect(d).not.toMatch(/\d+\s*(kr|visningar|publicerat)/i)
  })
})

describe('honesty — read-only reporting draws no execution warning', () => {
  const READ_ONLY = [
    'Idag har 0 publicerats. Nästa körning startar kl 14.',
    'The Prompt publicerar två gånger om dagen.',
    'Systemet kör en render just nu.',
    'Just nu väntar 4 på rendering och 1 renderar.',
    'Du har 3 väntande godkännanden.',
    'Vill du trigga en publicering eller kolla vad som ligger i kön?',
    'Vill du att jag kör publiceringen?',
    'Ska jag starta workflowet?',
    'Klockan är 13:42 i New York.',
    'Jag är Atlas — din Chief of Staff.',
  ]
  for (const t of READ_ONLY) {
    it(`no warning: "${t.slice(0, 48)}"`, () => {
      expect(isUnsupportedActionClaim(t)).toBe(false)
    })
  }
})

describe('honesty — unsupported execution claims are still caught', () => {
  const CLAIMS = [
    'Jag publicerade nästa video åt dig.',
    'Klart, jag publicerade den.',
    'Jag triggar workflowet nu.',
    'Jag startar publiceringen.',
    'Startar publiceringen.',
    'Jag har publicerat inlägget.',
    'Jag körde workflowet åt dig.',
    'Jag satte igång renderingen.',
    'Jag har triggat körningen.',
  ]
  for (const t of CLAIMS) {
    it(`caught: "${t}"`, () => {
      expect(isUnsupportedActionClaim(t)).toBe(true)
    })
  }

  it('catches a claim buried inside an otherwise read-only report', () => {
    const mixed = 'Idag har 0 publicerats. Just nu väntar 4 på rendering. Jag publicerade den senaste åt dig.'
    expect(isUnsupportedActionClaim(mixed)).toBe(true)
  })

  it('is not fooled by a descriptive clause appearing before a real claim', () => {
    expect(isUnsupportedActionClaim('Nästa körning startar kl 14. Jag triggade den nu.')).toBe(true)
  })
})

describe('honesty — final adversarial matrix', () => {
  // The locked contract. Every string here is one the guard must get right in a
  // specific direction; the two lists exist to stop a future widening of one
  // from quietly breaking the other.
  const MUST_WARN = [
    'Jag publicerade nästa video.',
    'Jag har publicerat nästa video.',
    'Publicerade nästa video.',
    'Klart, jag publicerade den.',
    'Klart — jag har publicerat videon.',
    'Jag körde workflowet.',
    'Körde workflowet.',
    'Jag startade körningen.',
    'Startade körningen.',
    'Startar publiceringen.',
  ]
  for (const t of MUST_WARN) {
    it(`claim → warning: "${t}"`, () => expect(isUnsupportedActionClaim(t)).toBe(true))
  }

  const MUST_NOT_WARN = [
    // passive / reporting
    'Videon publicerades kl 14.',
    'Det ser ut som att videon publicerades kl 14.',
    // scheduled / current state
    'Nästa körning startar kl 14.',
    'Systemet kör en render.',
    'The Prompt publicerar två gånger om dagen.',
    'Publicering sker kl 14.',
    // question / offer
    'Vill du att jag publicerar nästa video?',
    'Ska jag publicera nästa video?',
    // capability / future
    'Jag kan publicera den om du vill.',
    'Jag kommer att publicera den först efter ditt godkännande.',
  ]
  for (const t of MUST_NOT_WARN) {
    it(`not a claim → quiet: "${t.slice(0, 46)}"`, () => expect(isUnsupportedActionClaim(t)).toBe(false))
  }

  it('modal/future forms are blocked structurally, not only by the offer phrase', () => {
    // Nothing here says "om du vill" — "kan/ska/tänker/kommer" simply is not an
    // auxiliary the claim pattern accepts, so the subject never reads as Atlas
    // having already acted.
    for (const t of ['Jag kan publicera den.', 'Jag ska publicera den.', 'Jag tänker publicera den.', 'Jag kommer publicera den.']) {
      expect(isUnsupportedActionClaim(t), t).toBe(false)
    }
  })

  it('leading confirmation words and punctuation do not bypass protection', () => {
    for (const t of ['Klart, jag publicerade den.', 'Klart — jag har publicerat videon.', 'Klart! Jag publicerade den.', 'Ja — jag körde workflowet.']) {
      expect(isUnsupportedActionClaim(t), t).toBe(true)
    }
  })
})

describe('honesty — existing claim-regex behaviour preserved', () => {
  // These four assertions come from the pre-existing honesty suite and must not
  // change meaning: the guard still keys on claims, not on navigation or
  // delegation, and still ignores plain status.
  it('matches a workflow run claim', () => {
    expect(ACTION_CLAIM_RE.test('Jag triggar workflowet nu.')).toBe(true)
    expect(ACTION_CLAIM_RE.test('Startar publiceringen.')).toBe(true)
  })
  it('does not match a navigation-only claim', () => {
    expect(ACTION_CLAIM_RE.test('Jag öppnade godkännanden.')).toBe(false)
  })
  it('does not match a plain status answer', () => {
    expect(ACTION_CLAIM_RE.test('Du har 3 väntande godkännanden.')).toBe(false)
  })
  it('does NOT match delegation claims (those are DELEGATE_CLAIM_RE)', () => {
    expect(ACTION_CLAIM_RE.test('Jag delegerar de kritiska fynden.')).toBe(false)
  })
})
