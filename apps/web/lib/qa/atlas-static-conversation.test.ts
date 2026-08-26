/**
 * Atlas static-conversation classifier — adversarial matrix.
 *
 * The classifier exists to be WRONG IN ONE DIRECTION ONLY. A greeting that takes
 * the full path costs milliseconds; a status or action request that takes the
 * static path gets answered with no data behind it. So the bulk of this file is
 * not "does it recognise hej" — it is a long list of things that must NEVER be
 * recognised, including the ones that look harmless because they contain no
 * project keyword at all.
 */

import { describe, it, expect } from 'vitest'
import {
  classifyStaticConversation,
  staticConversationVeto,
  STATIC_CONVERSATION_SYSTEM,
} from '@/lib/atlas/static-conversation'

const isStatic = (s: unknown) => classifyStaticConversation(s) === 'static_conversation'
const isFull = (s: unknown) => classifyStaticConversation(s) === 'full_path'

describe('static conversation — the eligible class', () => {
  const STATIC = [
    'Hej',
    'Hej Atlas',
    'Tack',
    'Tack Atlas',
    'Vem är du?',
    'Vad heter du?',
    'Vad är Atlas?',
  ]

  for (const s of STATIC) {
    it(`classifies as static: ${s}`, () => {
      expect(classifyStaticConversation(s)).toBe('static_conversation')
    })
  }

  it('accepts the close conversational variants it was built for', () => {
    for (const s of [
      'hejsan', 'tjena', 'hallå', 'god morgon', 'hi', 'hello', 'hey',
      'tackar', 'tack så mycket', 'thanks', 'thank you',
      'vem är atlas', 'who are you', 'what is atlas',
      'hej då', 'vi ses', 'bye',
    ]) {
      expect(isStatic(s), s).toBe(true)
    }
  })
})

describe('static conversation — mandatory full-path rejects', () => {
  // Every one of these is a request the operator would be materially misled by
  // if it were answered from identity alone.
  const FULL = [
    // Time / date — Time Foundation owns these, never the static path.
    'Vad är klockan i New York?',
    'Vad är klockan i USA?',
    'Vilket datum är det idag?',
    // Live world.
    'Hur är vädret i Malmö?',
    'Vad hände inom AI idag?',
    // Project / status.
    'Hur har The Prompt gått idag?',
    'Vad är status på Familje-Stunden?',
    'Visa dagens statistik',
    'Hur går det?',
    'Vad är status på projektet?',
    // Memory / operator history.
    'Vad minns du om min plan för The Prompt?',
    'Vad gjorde du igår?',
    // Actions.
    'Publicera nästa video',
    'Kan du publicera nästa video?',
    'Kör workflowet',
    'Starta workflowet',
    // Capability questions that carry a project.
    'Vad kan du göra med The Prompt?',
    'Kan du hjälpa mig med The Prompt?',
    'Har Familje-Stunden några fel?',
    // Context-dependent follow-ups — no keywords, but meaningless alone.
    'Vad menar du?',
    'Varför då?',
    'Berätta mer om det',
  ]

  for (const s of FULL) {
    it(`stays on the full path: ${s}`, () => {
      expect(classifyStaticConversation(s)).toBe('full_path')
    })
  }

  it('keeps "Vad kan du göra?" on the full path — ambiguity is not resolved in favour of speed', () => {
    // A capability answer is only trustworthy when Atlas can see its own tools.
    // It is also one word away from "Vad kan du göra med The Prompt?".
    expect(classifyStaticConversation('Vad kan du göra?')).toBe('full_path')
  })

  it('keeps bare acknowledgements on the full path', () => {
    // "ok" is frequently the answer to a question Atlas just asked.
    for (const s of ['ok', 'okej', 'javisst', 'kör på']) {
      expect(isFull(s), s).toBe(true)
    }
  })
})

describe('static conversation — surface-form robustness', () => {
  it('is insensitive to casing', () => {
    for (const s of ['HEJ', 'Hej', 'hEj', 'VEM ÄR DU?', 'Vem Är Du?']) {
      expect(isStatic(s), s).toBe(true)
    }
  })

  it('is insensitive to punctuation and repeated punctuation', () => {
    for (const s of ['Hej!', 'Hej!!!', 'Hej.', 'Tack!', 'Vem är du???', 'Hej…']) {
      expect(isStatic(s), s).toBe(true)
    }
  })

  it('is insensitive to leading and trailing whitespace', () => {
    for (const s of ['  Hej  ', '\tTack\n', '\n\n Vem är du? \t']) {
      expect(isStatic(s), s).toBe(true)
    }
  })

  it('collapses internal whitespace', () => {
    expect(isStatic('Vem   är    du?')).toBe(true)
    expect(isStatic('hej  atlas')).toBe(true)
  })

  it('handles Swedish characters, including decomposed Unicode', () => {
    expect(isStatic('Vem är du?')).toBe(true)
    expect(isStatic('God kväll')).toBe(true)
    // Written with explicit escapes so the byte sequence is unambiguous in
    // source: 'a' + U+0308 (combining diaeresis) is a different encoding of
    // the same word, and NFC normalisation must fold it onto composed 'ä'.
    expect(isStatic('Vem a\u0308r du?')).toBe(true)
    expect(isStatic('God kva\u0308ll')).toBe(true)
  })

  it('treats a curly apostrophe the same as a straight one', () => {
    expect(isStatic("what's your name")).toBe(true)
    expect(isStatic('what’s your name')).toBe(true)
  })

  it('strips surrounding quotes', () => {
    expect(isStatic('"Hej"')).toBe(true)
    expect(isStatic('“Tack”')).toBe(true)
  })
})

describe('static conversation — project-name contamination', () => {
  it('rejects any greeting carrying a project reference', () => {
    for (const s of [
      'Hej, hur går det för The Prompt?',
      'Tack för hjälpen med Familje-Stunden',
      'Hej Atlas, vad är status på GainPilot?',
      'Vem är du och vad gör du för The Prompt?',
    ]) {
      expect(isFull(s), s).toBe(true)
    }
  })

  it('names the veto that fired, for diagnosis', () => {
    expect(staticConversationVeto('Hur har The Prompt gått idag?')).toBe('temporal')
    // "projektet" trips the project veto before the status one — vetoes are
    // ordered, and the first disqualifying subject is the one reported.
    expect(staticConversationVeto('Vad är status på projektet?')).toBe('project')
    expect(staticConversationVeto('Vad är mrr?')).toBe('status')
    expect(staticConversationVeto('Publicera nästa video')).toBe('action')
    expect(staticConversationVeto('Vad minns du om planen?')).toBe('memory')
    expect(staticConversationVeto('Öppna godkännanden')).toBe('navigation')
    expect(staticConversationVeto('Vad menar du?')).toBe('anaphora')
    expect(staticConversationVeto('Hej')).toBeNull()
  })
})

describe('static conversation — fails closed', () => {
  it('returns full_path for empty and whitespace-only input', () => {
    for (const s of ['', '   ', '\n\t']) expect(isFull(s), JSON.stringify(s)).toBe(true)
  })

  it('returns full_path for non-string input rather than throwing', () => {
    for (const s of [null, undefined, 42, {}, [], true, Symbol('x')]) {
      expect(() => classifyStaticConversation(s)).not.toThrow()
      expect(isFull(s), String(String(s))).toBe(true)
    }
  })

  it('returns full_path for anything longer than a short utterance', () => {
    expect(isFull('hej ' + 'a'.repeat(200))).toBe(true)
    // A long message that merely STARTS like a greeting is not a greeting.
    expect(isFull('Hej! Jag undrar om du kan sammanfatta veckans resultat åt mig.')).toBe(true)
  })

  it('never classifies an unknown utterance as static', () => {
    for (const s of [
      'asdfghjkl', 'kan du?', 'hjälp', 'vad tycker du om detta',
      'skriv en post', 'sammanfatta', 'hej hopp tjolahopp',
    ]) {
      expect(isFull(s), s).toBe(true)
    }
  })

  it('only ever returns one of the two declared classes', () => {
    const samples = ['Hej', 'Kör workflowet', '', null, 'Vem är du?', 'x'.repeat(500)]
    for (const s of samples) {
      expect(['static_conversation', 'full_path']).toContain(classifyStaticConversation(s))
    }
  })
})

describe('static conversation — the system prompt is a containment layer', () => {
  it('states it has no live data and forbids inventing it', () => {
    const p = STATIC_CONVERSATION_SYSTEM
    expect(p).toMatch(/do NOT have the live operational snapshot/i)
    expect(p).toMatch(/no tools available/i)
    expect(p).toMatch(/do not guess and do not invent numbers/i)
  })

  it('does NOT repeat the full prompt’s claim that a snapshot is provided', () => {
    // The full Atlas prompt ends with "You have a live snapshot ... Ground every
    // statement in it." Carrying that sentence onto a path with no snapshot is
    // exactly how fabricated figures would appear.
    expect(STATIC_CONVERSATION_SYSTEM).not.toMatch(/You have a live snapshot/i)
    expect(STATIC_CONVERSATION_SYSTEM).not.toMatch(/Ground every statement in it/i)
  })

  it('keeps Atlas identity rather than becoming a generic assistant', () => {
    expect(STATIC_CONVERSATION_SYSTEM).toMatch(/You are Atlas/)
    expect(STATIC_CONVERSATION_SYSTEM).toMatch(/Executive Chief of Staff/)
  })
})
