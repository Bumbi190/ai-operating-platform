/**
 * Action intent — Swedish morphology and boundary matrix.
 *
 * Two classes of defect are pinned here.
 *
 * MORPHOLOGY: `\bworkflow\b` does not match `workflowet`, so every definite-form
 * request an operator naturally types fell through — "kör workflowet", "starta
 * arbetsflödet", "skapa uppgiften", "hämta nyheten". The fix enumerates the
 * inflected forms explicitly, which is also what keeps `workflowexpert` from
 * matching `workflow`.
 *
 * BOUNDARY: JavaScript's `\b` is ASCII-oriented and å/ä/ö are not word
 * characters to it, so `\bgenomför\b` could not anchor after its trailing "ö".
 *
 * The third group is the one that matters most. Fixing morphology makes verbs
 * and objects match in far more sentences — including questions and prose that
 * must NEVER force a tool call. Those negatives are the safety half of this
 * file, not an afterthought.
 */

import { describe, it, expect } from 'vitest'
import { isActionIntent } from '@/lib/atlas/action-intent'

describe('action intent — required positives, workflow family', () => {
  const CASES = [
    'Kör workflowet', 'Kör workflow', 'Starta workflowet', 'Starta workflow',
    'Kör arbetsflödet', 'Starta arbetsflödet', 'Dra igång workflowet',
    'Sätt igång workflowet', 'Aktivera workflowet', 'Trigga workflowet',
    'Exekvera workflowet', 'Genomför workflowet',
  ]
  for (const c of CASES) {
    it(`action: "${c}"`, () => expect(isActionIntent(c)).toBe(true))
  }
})

describe('action intent — required positives, other object families', () => {
  const CASES = [
    'Kör processen', 'Starta processen',
    'Kör analysen', 'Starta analysen',
    'Starta körningen',
    'Generera manuset', 'Generera scriptet',
    'Skapa uppgiften', 'Skapa uppgifter', 'Skapa ärendet', 'Skapa ärenden',
    'Hämta nyheten', 'Hämta nyheter', 'Sök nyheter', 'Hitta nyheten',
  ]
  for (const c of CASES) {
    it(`action: "${c}"`, () => expect(isActionIntent(c)).toBe(true))
  }
})

describe('action intent — special actions and media step names', () => {
  const CASES = [
    'Publicera nästa video', 'Posta videon', 'Delegera de kritiska fynden',
    'Fetch AI News', 'Generate Script', 'Generate Voiceover',
    'Render Video', 'Publish to Social', 'Publish to YouTube',
  ]
  for (const c of CASES) {
    it(`action: "${c}"`, () => expect(isActionIntent(c)).toBe(true))
  }
})

describe('action intent — casing, punctuation, whitespace', () => {
  const CASES = ['KÖR WORKFLOWET', 'Kör workflowet!', '  Kör workflowet', 'kör workflowet.', 'Kör   workflowet']
  for (const c of CASES) {
    it(`action: ${JSON.stringify(c)}`, () => expect(isActionIntent(c)).toBe(true))
  }
})

describe('action intent — polite framings are still commands', () => {
  it('accepts "kan du" with the Swedish infinitive', () => {
    // Swedish takes the infinitive after a modal: "kan du KÖRA", not "kan du kör".
    // Without the infinitive forms, "kan du köra" and "kan du starta" would be
    // classified differently for purely morphological reasons.
    expect(isActionIntent('Kan du köra workflowet?')).toBe(true)
    expect(isActionIntent('Kan du starta workflowet?')).toBe(true)
    expect(isActionIntent('Kan du generera manuset?')).toBe(true)
    expect(isActionIntent('Skulle du kunna köra workflowet?')).toBe(true)
    expect(isActionIntent('Snälla kör workflowet')).toBe(true)
  })

  it('preserves the existing polite delegation behaviour', () => {
    expect(isActionIntent('kan du delegera dem')).toBe(true)
  })
})

describe('action intent — inverted yes/no questions are NOT commands', () => {
  it('treats a pronoun subject after the verb as a question', () => {
    // Swedish yes/no questions invert to verb-first, which looks exactly like an
    // imperative. "Kör workflowet" is an order; "Kör du workflowet?" is not.
    // Ambiguity resolves away from forcing a tool.
    expect(isActionIntent('Kör du workflowet åt mig?')).toBe(false)
    expect(isActionIntent('Vill du köra workflowet åt mig?')).toBe(false)
    expect(isActionIntent('Startar du workflowet?')).toBe(false)
  })

  it('still treats the plain imperative as a command', () => {
    expect(isActionIntent('Kör workflowet')).toBe(true)
  })
})

describe('action intent — informational, inventory and recall questions', () => {
  // Each of these contains an action verb AND a known object. Before the
  // morphology fix they were rejected by accident, because the object simply
  // did not match. They must stay rejected on purpose.
  const CASES = [
    'Hur kör jag workflowet?',
    'Hur startar man workflowet?',
    'Vad händer när workflowet körs?',
    'Vilket workflow ska jag köra?',
    'Vilka workflows finns?',
    'Har du kört workflowet?',
    'Körde du workflowet?',
    'Vad körde du nyss?',
    'Vad publicerade du?',
    'Vad delegerade du?',
    'Hur fungerar arbetsflödet?',
    'Vad är status på workflowet?',
    'Hur går workflowet idag?',
  ]
  for (const c of CASES) {
    it(`NOT action: "${c}"`, () => expect(isActionIntent(c)).toBe(false))
  }
})

describe('action intent — descriptive prose is never a command', () => {
  const CASES = [
    'Workflowet kör varje dag.',
    'Workflowet startar kl 14.',
    'Systemet kör workflowet.',
    'The Prompt kör en pipeline automatiskt.',
    'Den här processen genererar manus.',
    'Publiceringen startar efter godkännande.',
  ]
  for (const c of CASES) {
    it(`NOT action: "${c}"`, () => expect(isActionIntent(c)).toBe(false))
  }

  it('fixes the false positive that shipped before this slice', () => {
    // This one previously classified as an action: the verb "kör" and the object
    // "pipeline" both appeared, and position was never considered.
    expect(isActionIntent('The Prompt kör en pipeline automatiskt.')).toBe(false)
  })

  it('no longer treats the noun "publicering" as a trigger', () => {
    // The old pattern fired on the bare noun, so a sentence whose SUBJECT was a
    // publication was enough to force a tool.
    expect(isActionIntent('Publiceringen startar efter godkännande.')).toBe(false)
    expect(isActionIntent('Publiceringen är klar.')).toBe(false)
    // The verb still is an action.
    expect(isActionIntent('Publicera inlägget')).toBe(true)
  })
})

describe('action intent — morphology is enumerated, not guessed', () => {
  it('matches the definite and plural forms operators actually type', () => {
    for (const c of [
      'Kör workflowet', 'Kör workflows', 'Starta arbetsflödet', 'Starta arbetsflöden',
      'Kör processen', 'Kör analysen', 'Starta körningen',
      'Skapa uppgiften', 'Skapa uppgifterna', 'Skapa ärendena',
      'Hämta nyheterna', 'Generera manuset', 'Generera scriptet',
      'Posta videon', 'Posta videor',
    ]) {
      expect(isActionIntent(c), c).toBe(true)
    }
  })

  it('does not match a longer word that merely starts with a known stem', () => {
    // The reason forms are enumerated rather than derived by suffix stripping.
    for (const c of [
      'Kör workflowexperten', 'Starta processledaren', 'Kör analysverktyget',
      'Hämta nyhetsbrevsprenumeranten',
    ]) {
      expect(isActionIntent(c), c).toBe(false)
    }
  })

  it('anchors verbs that end in ö, which ASCII \\b cannot', () => {
    // `\bgenomför\b` fails because "ö" is not a word character to JavaScript.
    expect(isActionIntent('Genomför workflowet')).toBe(true)
    expect(isActionIntent('Utför analysen')).toBe(true)
  })
})

describe('action intent — mixed messages and fail-closed behaviour', () => {
  it('finds a command that follows a descriptive sentence', () => {
    expect(isActionIntent('Workflowet kör varje dag. Kör workflowet nu.')).toBe(true)
  })

  it('does not let a descriptive clause create an action on its own', () => {
    expect(isActionIntent('Workflowet kör varje dag. Det är bra.')).toBe(false)
  })

  it('a recall framing anywhere disqualifies the whole message', () => {
    expect(isActionIntent('Har du kört workflowet? Kör det annars.')).toBe(false)
  })

  it('returns false for empty and junk input rather than throwing', () => {
    for (const c of ['', '   ', '\n', 'asdfghjkl', '???']) {
      expect(() => isActionIntent(c)).not.toThrow()
      expect(isActionIntent(c), JSON.stringify(c)).toBe(false)
    }
  })

  it('a bare verb with no object is not an action', () => {
    for (const c of ['Kör', 'Starta', 'Generera', 'Kör nu']) {
      expect(isActionIntent(c), c).toBe(false)
    }
  })
})

describe('action intent — closed-slice traffic must not become an action', () => {
  it('static conversation stays out', () => {
    for (const c of ['Hej Atlas', 'Vem är du?', 'Tack']) {
      expect(isActionIntent(c), c).toBe(false)
    }
  })

  it('status questions stay out', () => {
    for (const c of ['Hur har The Prompt gått idag?', 'Vad är status på Familje-Stunden?', 'Hur går det?']) {
      expect(isActionIntent(c), c).toBe(false)
    }
  })

  it('time questions stay out', () => {
    for (const c of ['Vad är klockan i New York?', 'Vilket datum är det idag?']) {
      expect(isActionIntent(c), c).toBe(false)
    }
  })
})
