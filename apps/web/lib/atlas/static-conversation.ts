/**
 * Atlas static-conversation classification.
 *
 * A tiny, closed class of requests — greetings, thanks, "who are you" — can be
 * answered from Atlas's stable identity alone. Those need no live snapshot, no
 * project data, no Memory, no operator history, no clock and no tools, so they
 * have no business paying for eight database round trips and a fifteen-tool
 * schema before the first token.
 *
 * THE ASYMMETRY THAT SHAPES THIS MODULE
 *
 * A false negative — a trivial greeting taking the full path — costs latency and
 * nothing else. A false positive — a status, project, time, memory or action
 * request answered from a context-free prompt — produces a confident answer
 * built on nothing. Those two errors are not comparable, so this classifier is
 * deliberately lopsided: it recognises an explicit allow-list of exact phrases
 * and refuses everything else.
 *
 * It is an ALLOW-LIST, not a heuristic. There is no attempt to "understand" the
 * message. `classifyStaticConversation` answers one question — "is this exactly
 * one of the few utterances I can prove need nothing?" — and any answer other
 * than yes is `full_path`. That is also why it is immune to the known Swedish
 * morphology gap in `isActionIntent` (`\b` not matching å/ä/ö): "kör workflowet"
 * does not need to be *detected* as an action here, it simply fails to be a
 * greeting, which is enough.
 *
 * Pure and dependency-free, so it unit-tests without a database or network.
 */

/** What path a request must take. Explicit union — never a bare boolean. */
export type AtlasRequestClass = 'static_conversation' | 'full_path'

/**
 * Nothing longer than this can be one of the allow-listed utterances (the
 * longest is 17 characters). A cheap guard that stops a long message from ever
 * reaching the matcher.
 */
const MAX_STATIC_LENGTH = 40

/**
 * Swedish-safe word boundaries. JavaScript's `\b` treats å/ä/ö as NON-word
 * characters, so `\bvad\b` matches inside "vadå" and `\bkör\b` fails to anchor
 * correctly. These lookarounds are what `\b` should have been for this alphabet.
 */
const B = '(?<![\\p{L}\\p{N}_])'
const E = '(?![\\p{L}\\p{N}_])'
const w = (body: string) => new RegExp(`${B}(?:${body})${E}`, 'u')

/**
 * DEFENCE IN DEPTH — subject vetoes.
 *
 * The allow-list below is exact-match, so "vad kan du göra med The Prompt?" is
 * already rejected simply by not being in it; these vetoes are redundant today
 * BY DESIGN. They exist so that if anyone later loosens the matcher, a message
 * carrying live, project, memory or action meaning still cannot reach the static
 * path. Cheap insurance on the side of the error that actually hurts.
 */
const VETOES: ReadonlyArray<readonly [string, RegExp]> = [
  // Live / temporal — anything whose answer changes with the clock.
  ['temporal', w('klockan|klocka|tid|tiden|datum|idag|i dag|igår|i går|imorgon|i morgon|nu|just nu|aktuell|aktuellt|senaste|nyss|vecka|veckan|månad|månaden|väder|vädret|hänt|händer|hände|today|yesterday|tomorrow|now|current|latest|weather|time|date')],
  // Project / business references.
  ['project', w('prompt|familje|stunden|familje-stunden|gainpilot|projekt|projektet|project|verksamhet|verksamheten|business|bolag')],
  // Status, metrics and Executive data.
  ['status', w('status|statistik|siffror|kostnad|kostnader|intäkt|intäkter|mrr|churn|leads|lead|rapport|analys|analysera|prestanda|godkännand|approvals|runs|körning|körningar|fel|buggar|prognos|resultat')],
  // "how is it going" — status in question form.
  ['progress', /hur\s+(går|mår|presterar|ligger|har)\b/u],
  // Memory / operator history.
  ['memory', w('minns|minnas|kommer du ihåg|ihåg|remember|historik|gjorde|gjort|sa du|berättade')],
  // Actions and mutations.
  ['action', w('publicera|publish|posta|kör|köra|starta|start|run|skapa|generera|delegera|aktivera|trigga|workflow|arbetsflöde|pipeline|render|deploy|uppgift|task')],
  // Navigation.
  ['navigation', w('öppna|open|visa|show|gå till|go to|navigera|ta mig till|take me to')],
  // Context-dependent follow-ups: no keywords, but meaningless without history.
  ['anaphora', /(menar du|varför|berätta mer|mer om|det där|samma|förklara|hur menar)/u],
]

/** Trailing/leading noise that never changes meaning. */
const EDGE_PUNCTUATION = /^[\s"'“”«»¡¿(\[]+|[\s"'“”«»!?.,…:;)\]]+$/gu

/**
 * The complete set of utterances provable to need nothing but Atlas's identity.
 *
 * Deliberately excluded, and worth recording why:
 *
 * - "vad kan du göra?" — a capability answer is only trustworthy when Atlas can
 *   see its own tools and the operator's businesses. Answered from a context-free
 *   prompt it risks describing capabilities it cannot currently reach, and it sits
 *   one word away from "vad kan du göra med The Prompt?", a mandatory full-path
 *   request. Ambiguous, therefore full path.
 * - "ok" / "okej" — safe on data, but it is frequently the answer to a question
 *   Atlas just asked ("ska jag publicera?"). Answering it without context would
 *   silently drop the thread.
 */
const STATIC_UTTERANCES: ReadonlySet<string> = new Set([
  // Greetings
  'hej', 'hejsan', 'hej hej', 'tjena', 'tjenare', 'hallå', 'halloj', 'tja',
  'hej atlas', 'hejsan atlas', 'tjena atlas', 'hallå atlas',
  'god morgon', 'godmorgon', 'god kväll', 'godkväll', 'god middag',
  'hi', 'hello', 'hey', 'hi atlas', 'hello atlas', 'hey atlas',
  'good morning', 'good evening',
  // Thanks
  'tack', 'tack atlas', 'tackar', 'tack så mycket', 'tusen tack',
  'tack ska du ha', 'thanks', 'thank you', 'thanks atlas', 'thank you atlas',
  // Identity
  'vem är du', 'vem är du atlas', 'vad heter du', 'vem är atlas', 'vad är atlas',
  'who are you', 'what is atlas', 'what are you', 'whats your name',
  'what is your name',
  // Farewell
  'hej då', 'hejdå', 'vi ses', 'bye', 'goodbye', 'see you',
])

/**
 * Normalise for matching: Unicode-compose, lowercase, strip edge punctuation and
 * quotes, collapse internal whitespace. Apostrophes are dropped so "what's your
 * name" and "whats your name" are the same utterance. Swedish characters are
 * preserved — å/ä/ö are letters here, not noise.
 */
function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(EDGE_PUNCTUATION, '')
    .replace(/[’'`]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * Classify a single operator message.
 *
 * Returns `static_conversation` ONLY for an exact allow-list hit that also
 * survives every veto. Everything else — unknown phrasing, empty input, a
 * non-string, anything that throws — is `full_path`. There is no code path in
 * which uncertainty produces `static_conversation`.
 */
export function classifyStaticConversation(text: unknown): AtlasRequestClass {
  try {
    if (typeof text !== 'string') return 'full_path'

    const t = normalize(text)
    if (!t) return 'full_path'
    if (t.length > MAX_STATIC_LENGTH) return 'full_path'

    // Vetoes first: a subject that disqualifies wins over any shape match.
    for (const [, pattern] of VETOES) {
      if (pattern.test(t)) return 'full_path'
    }

    return STATIC_UTTERANCES.has(t) ? 'static_conversation' : 'full_path'
  } catch {
    // Classification must never be able to fail open.
    return 'full_path'
  }
}

/** Which veto rejected a message. Diagnostics and tests only — not routing. */
export function staticConversationVeto(text: string): string | null {
  const t = normalize(text)
  for (const [name, pattern] of VETOES) {
    if (pattern.test(t)) return name
  }
  return null
}

/**
 * The smallest stable system context for a static reply.
 *
 * Note what this does NOT say. The full Atlas prompt ends with "You have a live
 * snapshot of the whole operation (provided below each turn) … Ground every
 * statement in it." On this path there IS no snapshot, so repeating that line
 * would invite invented numbers. Instead the model is told plainly that it has
 * no live data this turn and must offer to fetch rather than guess — which is
 * also the containment for any classifier mistake: even a message that reached
 * this path in error cannot be answered with fabricated figures.
 */
export const STATIC_CONVERSATION_SYSTEM = `You are Atlas, the Executive Chief of Staff for Andre's company group, running on Omnira. You are not a chatbot or a support bot — you are the intelligence that runs these businesses.

This turn is a short conversational exchange (a greeting, thanks, or a question about who you are). Answer briefly and directly, in the operator's language (Swedish or English, matching them). No filler, no "How can I help?", no bullet lists.

You do NOT have the live operational snapshot this turn, and you have no tools available. If the operator asks for anything that needs live or current information — figures, status, the time or date, project data, what you remember, or an action — do not guess and do not invent numbers. Say briefly that you will pull it up, and ask them to send that as its own message.`
