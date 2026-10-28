/**
 * Voice deliverables must not inherit the two-sentence / 150-token small-talk
 * ceiling. This pure intent check runs independently in the chat route and the
 * microphone client so the text is complete but spoken output remains brief.
 *
 * It is content formatting, never permission to execute a workflow/code change.
 */
const PROMPT = /\bprompt(?:en|ar|erna)?\b/i
const PROMPT_WRITING = /\b(skriv|skriva|skapa|g[oö]r|generera|formulera|ta fram|ge mig|vill ha|beh[oö]ver|kopiera|f[aå]|utforma|bygg)\b/i
const CLAUDE_INSTRUCTION = /\bclaude\b.{0,100}\b(prompt|instruktion|underlag|specifikation|kod|workflow|arbetsfl[oö]de)\b|\b(prompt|instruktion|underlag|specifikation)\b.{0,70}\bclaude\b/i
const WORKFLOW = /\b(workflow(?:s|et|erna|plan(?:en|er)?)?|arbetsfl[oö]d(?:e|en|et|ena)|automation(?:en|er)?)\b/i
const WORKFLOW_PLANNING = /\b(planera|plan|planering|skissa|rita upp|s[aä]tt upp|bygga|bygg|designa|utforma|beskriv|implementera|ta fram|steg.f[oö]r.steg|skriv|specifikation)\b/i
const LONG_DELIVERABLE = /\b(komplett|fullst[aä]ndig|detaljerad|utf[oö]rlig|genomarbetad|kopierbar)\b.{0,90}\b(plan|prompt|specifikation|guide|instruktion|arbetsfl[oö]de|workflowplan(?:en|er)?|workflow|kod)\b/i
const WRITTEN_PLAN = /\b(skriv|skapa|ta fram|formulera|g[oö]r|generera|ge mig)\b.{0,90}\b(plan|specifikation|implementeringsplan|implementationsplan|steg.f[oö]r.steg|checklista|kodf[oö]rslag)\b/i

export function needsCompleteVoiceDocument(input: unknown): boolean {
  if (typeof input !== 'string' || !input.trim()) return false
  const t = input.normalize('NFC').toLowerCase().slice(0, 4000)
  return (PROMPT.test(t) && PROMPT_WRITING.test(t))
    || CLAUDE_INSTRUCTION.test(t)
    || (WORKFLOW.test(t) && WORKFLOW_PLANNING.test(t))
    || LONG_DELIVERABLE.test(t)
    || WRITTEN_PLAN.test(t)
}

export const VOICE_DOCUMENT_MAX_TOKENS = 3200 as const
/** Stable command shared by the chat button and the continuation classifier. */
export const VOICE_DOCUMENT_CONTINUATION_COMMAND = 'Fortsätt' as const
export const VOICE_DOCUMENT_SPEECH_FALLBACK =
  'Jag har lagt hela underlaget i chatten, så att du kan kopiera det.'

/**
 * Extract one safe spoken opening while preserving every streamed character in
 * chat. The opening should be a complete brief sentence, never an unfinished
 * snippet of a long Claude prompt, Markdown list or code fence.
 */
export function completeVoiceDocumentOpening(text: string, final: boolean): string | null {
  const raw = text.trimStart()
  if (!raw) return final ? VOICE_DOCUMENT_SPEECH_FALLBACK : null
  if (/^(?:#|\*|[-•]\s|\d+\.|\x60{3}|\|)/.test(raw))
    return VOICE_DOCUMENT_SPEECH_FALLBACK

  const newline = raw.indexOf('\n')
  const ending = /[.!?](?=\s|$)/.exec(raw)
  const endingIndex = ending ? ending.index + 1 : -1
  const breakAt = newline >= 0 && (endingIndex < 0 || newline < endingIndex)
    ? newline
    : endingIndex

  if (breakAt >= 0) {
    const candidate = raw.slice(0, breakAt).trim().replace(/\s+/g, ' ')
    if (candidate.length >= 8 && candidate.length <= 170
      && !/[\x60#*|<>]/.test(candidate) && !/^(?:\d+[.)]|[-•])\s/.test(candidate))
      return /[.!?]$/.test(candidate) ? candidate : candidate + '.'
    return VOICE_DOCUMENT_SPEECH_FALLBACK
  }
  if (raw.length > 180 || final) return VOICE_DOCUMENT_SPEECH_FALLBACK
  return null
}

export const VOICE_DOCUMENT_INCOMPLETE_WARNING =
  '\n\n⚠️ Svaret nådde längdgränsen och är inte komplett. Använd inte en halv prompt till Claude. Be Nova fortsätta resten i nästa meddelande.'

/** Provider stream ended without a confirmed final artifact. Never present this text as a ready-to-run Claude prompt. */
export const VOICE_DOCUMENT_STREAM_INTERRUPTED_WARNING =
  '\n\n⚠️ Utkastet avbröts innan det blev komplett. Kopiera inte som färdig Claude-prompt. Använd Fortsätt utkast för att skriva klart resten.'

/** Only a visibly incomplete prior document authorises a one-word continuation
 * to use the extended writing mode. No unrelated chat turn inherits this budget.
 */
export function continuesIncompleteVoiceDocument(input: unknown, previousAssistantText: unknown): boolean {
  if (typeof input !== 'string' || typeof previousAssistantText !== 'string') return false
  const command = input.normalize('NFC').trim().toLowerCase()
  if (!/^(?:ja[, ]+)?(?:forts[aä]tt(?: d[aä]r du slutade)?|skriv klart|slutf[oö]r|forts[aä]tt med resten|ge mig resten)[.!? ]*$/i.test(command))
    return false
  return previousAssistantText.includes(VOICE_DOCUMENT_INCOMPLETE_WARNING.trim())
    || previousAssistantText.includes(VOICE_DOCUMENT_STREAM_INTERRUPTED_WARNING.trim())
}
