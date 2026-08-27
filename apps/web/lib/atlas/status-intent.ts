/**
 * Atlas status-intent detection.
 *
 * The operator asks a read-only question about how something is going — "hur har
 * The Prompt gått idag?", "vad är status på Familje-Stunden?". Two things about
 * that request were being lost before it reached the model:
 *
 *  1. THE TIME WINDOW. "idag" is not decoration. The live context carries figures
 *     for several different periods — some labelled ("publicerat idag", "fel 24h",
 *     "kostnad idag"), some labelled as a wider period ("denna vecka"), and some
 *     carrying no period at all (cumulative view counts, current queue depth).
 *     With nothing stating which window was asked for, an unlabelled number is
 *     free to be reported under the operator's "idag" framing — which is how
 *     lifetime view totals came to be presented as today's reach.
 *
 *  2. WHICH PROJECT. Only when it is unambiguous. A guessed project is worse than
 *     no project, so "hur går det?" and "vad är status på projektet?" resolve to
 *     nothing here and are left to the conversation and view context that the
 *     full path already supplies.
 *
 * This layer does NOT route. A status request stays on the full context path with
 * unchanged authentication, project isolation and tool schema; the only thing
 * produced here is a short directive appended to the system prompt. It also does
 * not write the answer — it states the scope and the grounding rules and leaves
 * Atlas to synthesise from real context.
 *
 * Pure and dependency-light, so it unit-tests without a database or network.
 */

import { PROJECT_ALIAS_ENTRIES } from '@/lib/nav/registry'
import { BUSINESS_PROFILES } from '@/lib/atlas/identity'

/** The window the operator asked about. `current` = no temporal wording given. */
export type StatusScope = 'day' | 'week' | 'month' | 'current'

export interface StatusIntent {
  scope: StatusScope
  /** Canonical slug, or null when no project was named unambiguously. */
  projectSlug: string | null
  /** Display name for the resolved slug, or null. */
  projectName: string | null
}

/** Swedish-safe boundaries — JS `\b` treats å/ä/ö as non-word characters. */
const B = '(?<![\\p{L}\\p{N}_])'
const E = '(?![\\p{L}\\p{N}_])'

/**
 * Read-only "how is it going / what is the state" question shapes.
 *
 * Conservative on purpose: an imperative or an action request must never be read
 * as a status question, so this matches interrogative/reporting phrasings only.
 */
const STATUS_SHAPES: readonly RegExp[] = [
  // "hur har X gått", "hur går det (för X)", "hur ligger vi till"
  new RegExp(`${B}hur\\s+(har|går|gick|mår|presterar|ligger)${E}`, 'iu'),
  // "vad är status …", "status på/för X"
  new RegExp(`${B}status${E}`, 'iu'),
  // "hur är läget", "vad är läget", "läget för X"
  new RegExp(`${B}läget${E}`, 'iu'),
  // English equivalents the operator occasionally uses
  new RegExp(`${B}how\\s+(is|are|did|has)${E}`, 'iu'),
]

/**
 * Action verbs that disqualify a status reading. "Kör status-workflowet" is a
 * command that happens to contain the word status; it is not a status question.
 * This does NOT reuse `isActionIntent` — that classifier answers a different
 * question (should a tool be forced?) and carries a known Swedish morphology
 * gap. Here we only need a veto, and a veto must not inherit that gap.
 */
const ACTION_VETO = new RegExp(
  `${B}(kör|köra|starta|startar|publicera|publicerar|posta|trigga|triggar|aktivera|delegera|skapa|generera|render|rendera)`,
  'iu',
)

/** Temporal wording → scope. Ordered: the most specific phrasing wins. */
const SCOPE_PATTERNS: ReadonlyArray<readonly [StatusScope, RegExp]> = [
  ['month', new RegExp(`${B}(denna\\s+månad(en)?|den\\s+här\\s+månaden|i\\s+månaden|this\\s+month)${E}`, 'iu')],
  ['week', new RegExp(`${B}(denna\\s+vecka(n)?|den\\s+här\\s+veckan|i\\s+veckan|this\\s+week)${E}`, 'iu')],
  ['day', new RegExp(`${B}(idag|i\\s+dag|today)${E}`, 'iu')],
]

const SCOPE_LABEL: Record<StatusScope, string> = {
  day: 'idag',
  week: 'denna vecka',
  month: 'denna månad',
  current: 'nuläget (ingen period angavs)',
}

/**
 * Find the project named in free text, using the canonical alias table.
 *
 * Returns null when nothing matches AND when two different businesses are named
 * — an ambiguous reference must not be silently narrowed to one of them.
 */
function resolveProjectInText(normalized: string): string | null {
  const found = new Set<string>()
  for (const [alias, slug] of PROJECT_ALIAS_ENTRIES) {
    // Alias keys are lowercase; match on a word boundary so "prompt" does not
    // fire inside "prompten" and a slug does not fire inside a longer word.
    //
    // NOTE: `-` is deliberately NOT escaped. These regexes are built in `u` mode,
    // where `\-` is an invalid identity escape and throws at construction —
    // which, behind this module's catch, would silently disable status detection
    // for every message rather than fail loudly. Outside a character class the
    // hyphen is already literal, so escaping it buys nothing.
    const re = new RegExp(`${B}${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${E}`, 'iu')
    if (re.test(normalized)) found.add(slug)
  }
  return found.size === 1 ? [...found][0] : null
}

/**
 * Classify a message as a read-only status request, or null.
 *
 * Null means "nothing to add" — the request proceeds down the existing full path
 * completely unchanged. There is no path where this function alters routing.
 */
export function classifyStatusIntent(text: unknown): StatusIntent | null {
  try {
    if (typeof text !== 'string') return null
    const t = text.normalize('NFC').toLowerCase().trim()
    if (!t) return null
    if (ACTION_VETO.test(t)) return null
    if (!STATUS_SHAPES.some(re => re.test(t))) return null

    let scope: StatusScope = 'current'
    for (const [candidate, re] of SCOPE_PATTERNS) {
      if (re.test(t)) { scope = candidate; break }
    }

    const projectSlug = resolveProjectInText(t)
    return {
      scope,
      projectSlug,
      projectName: projectSlug ? (BUSINESS_PROFILES[projectSlug]?.name ?? projectSlug) : null,
    }
  } catch {
    // Uncertainty must never manufacture a scope the operator did not ask for.
    return null
  }
}

/**
 * The directive appended to the system prompt for a status request.
 *
 * Guidance, not a template: it states what was asked and how to ground the
 * answer, and leaves the business content entirely to Atlas and the real
 * context. The grounding rules are the correctness half — they are what stops an
 * unlabelled cumulative figure from being reported as belonging to the period.
 */
export function renderStatusDirective(intent: StatusIntent): string {
  const lines = [
    '',
    '',
    '[STATUSFÖRFRÅGAN — läsning, ingen åtgärd]',
    intent.projectName
      ? `Projekt: ${intent.projectName}`
      : 'Projekt: inte angivet — använd samtalets eller vyns sammanhang. Gissa aldrig ett projekt.',
    `Period: ${SCOPE_LABEL[intent.scope]}`,
    'Grunda varje siffra i data som verkligen gäller den perioden.',
    'Skilj på HÄNDELSER under perioden ("idag har X publicerats") och NULÄGE ("just nu väntar Y på rendering") — det är olika påståenden.',
    'En siffra utan periodetikett i kontexten gäller inte perioden. Redovisa den som nuläge eller totalt, aldrig som periodens utfall.',
    'Saknas ett mått för perioden: säg det rakt ut. Byt aldrig tyst till en bredare period, och hitta aldrig på siffran.',
  ]
  return lines.join('\n')
}
