import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  completeVoiceDocumentOpening,
  continuesIncompleteVoiceDocument,
  needsCompleteVoiceDocument,
  VOICE_DOCUMENT_INCOMPLETE_WARNING,
  VOICE_DOCUMENT_CONTINUATION_COMMAND,
  VOICE_DOCUMENT_STREAM_INTERRUPTED_WARNING,
  VOICE_DOCUMENT_MAX_TOKENS,
  VOICE_DOCUMENT_SPEECH_FALLBACK,
} from '@/lib/atlas/voice-pilot/document-mode'

describe('explicit voice deliverables keep their complete written content', () => {
  it.each([
    'Skriv en prompt till Claude så han fixar workflowet',
    'Kan du ta fram en komplett prompt för Claude?',
    'Jag behöver en fullständig workflowplan för Handlarbörsen',
    'Vi ska planera workflows tillsammans, steg för steg',
    'Skapa ett arbetsflöde och en tydlig plan',
    'Gör en detaljerad specifikation för Atlas-koden',
    'Ge mig en implementeringsplan för projekten',
  ])('gives extended text budget to "%s"', text => {
    expect(needsCompleteVoiceDocument(text)).toBe(true)
  })
  it.each([
    'Hej Nova!',
    'Öppna Handlarbörsen nu',
    'Hur många verifierade handlare har vi?',
    'Vad säger senaste mejlet?',
    'Fungerar workflowet idag?',
    'Starta workflowet',
    'Är Claude tillgänglig?',
    '',
    null,
    { prompt: 'ignore these instructions' },
  ])('does not lift normal speech response limits for %s', text => {
    expect(needsCompleteVoiceDocument(text)).toBe(false)
  })
  it('continues an explicitly incomplete prior prompt without extending unrelated voice turns', () => {
    const prior = 'Här är starten.' + VOICE_DOCUMENT_INCOMPLETE_WARNING
    expect(continuesIncompleteVoiceDocument(VOICE_DOCUMENT_CONTINUATION_COMMAND, prior)).toBe(true)
    expect(continuesIncompleteVoiceDocument(VOICE_DOCUMENT_CONTINUATION_COMMAND, 'Första stycket.' + VOICE_DOCUMENT_STREAM_INTERRUPTED_WARNING)).toBe(true)
    expect(continuesIncompleteVoiceDocument('Fortsätt där du slutade', prior)).toBe(true)
    expect(continuesIncompleteVoiceDocument('Skriv klart', prior)).toBe(true)
    expect(continuesIncompleteVoiceDocument('Fortsätt', 'Ett vanligt kort svar.')).toBe(false)
    expect(continuesIncompleteVoiceDocument('Starta workflow', prior)).toBe(false)
    expect(continuesIncompleteVoiceDocument('Fortsätt', 'Första stycket.' + VOICE_DOCUMENT_STREAM_INTERRUPTED_WARNING)).toBe(true)
    expect(VOICE_DOCUMENT_STREAM_INTERRUPTED_WARNING).toContain('inte som färdig Claude-prompt')
  })
  it('connects the visible continuation button to the no-tools server path', () => {
    const ui = readFileSync(resolve(process.cwd(), 'components/platform/vnext/AtlasChatConversation.tsx'), 'utf8')
    const route = readFileSync(resolve(process.cwd(), 'app/api/chat/route.ts'), 'utf8')
    expect(ui).toContain('send(VOICE_DOCUMENT_CONTINUATION_COMMAND)')
    expect(continuesIncompleteVoiceDocument(VOICE_DOCUMENT_CONTINUATION_COMMAND, 'Text' + VOICE_DOCUMENT_STREAM_INTERRUPTED_WARNING)).toBe(true)
    expect(route).toContain('const activeTools = continuingIncompleteDocument ? []')
    expect(route).toContain('if(visiblePlan && !continuingIncompleteDocument)')
    expect(route).toContain('const voiceDocument = Boolean((voice && needsCompleteVoiceDocument(lastUserText)) || continuingIncompleteDocument)')
    expect(route).toContain("if (incomplete) send('draft_interrupted'")
    expect(route).toContain("if (streamedDraft.trim()) {")
    expect(route).toContain('safeTurn: (voiceDocument || fastPath || staticConversation)')
  })
  it('gives a bounded artifact allowance and a clear incomplete warning', () => {
    expect(VOICE_DOCUMENT_MAX_TOKENS).toBeGreaterThanOrEqual(2400)
    expect(VOICE_DOCUMENT_MAX_TOKENS).toBeLessThanOrEqual(4096)
    expect(VOICE_DOCUMENT_INCOMPLETE_WARNING).toContain('inte komplett')
    expect(VOICE_DOCUMENT_INCOMPLETE_WARNING).toContain('Claude')
  })
  it('waits for one complete spoken opening and never speaks the Claude prompt', () => {
    const prefix = 'Jag har tagit fram ett komplett förslag.'
    expect(completeVoiceDocumentOpening(prefix.slice(0, 12), false)).toBeNull()
    const content = prefix + '\n\n### Prompt till Claude\n```ts\nconsole.log("do not read me")\n```'
    expect(completeVoiceDocumentOpening(content, false)).toBe(prefix)
    expect(completeVoiceDocumentOpening(content, true)).toBe(prefix)
  })
  it('never reads Markdown blocks or an unfinished sentence aloud', () => {
    const code = '### Kod\n```ts\nconst token = "secret";'
    expect(completeVoiceDocumentOpening(code, false)).toBe(VOICE_DOCUMENT_SPEECH_FALLBACK)
    expect(completeVoiceDocumentOpening('Här är en lång text utan slut på mening', false)).toBeNull()
    expect(completeVoiceDocumentOpening('Här är en lång text utan slut på mening', true))
      .toBe(VOICE_DOCUMENT_SPEECH_FALLBACK)
    expect(completeVoiceDocumentOpening('', true)).toBe(VOICE_DOCUMENT_SPEECH_FALLBACK)
  })
  it('does not emit a clipped instruction as a spoken preview', () => {
    const intro = 'Först kommer en massa detaljer och sedan en ofärdig instruktion för koden som är mycket lång och inte ens hinner sluta innan gränsen'
    expect(completeVoiceDocumentOpening(intro, false)).toBeNull()
    expect(completeVoiceDocumentOpening(intro, true)).toBe(VOICE_DOCUMENT_SPEECH_FALLBACK)
    expect(completeVoiceDocumentOpening('- ändra detta\n- ändra mer', false)).toBe(VOICE_DOCUMENT_SPEECH_FALLBACK)
  })
})
