/**
 * Atlas action-intent detection.
 *
 * The operator asks Atlas to DO something concrete (run/start/publish/activate/
 * delegate/create-task). When this matches, the chat route forces tool_choice on
 * the first turn so a real tool call is guaranteed — Atlas can never merely claim
 * the action happened.
 *
 * THREE THINGS DECIDE A MATCH, and all three have to hold:
 *
 *  1. AN ACTION VERB IN IMPERATIVE POSITION. The verb must open the clause,
 *     optionally behind a polite prefix ("kan du köra …"). This is what
 *     separates a command from a description: "Kör workflowet" is an order,
 *     while "Systemet kör workflowet" and "The Prompt kör en pipeline
 *     automatiskt" merely report what something else does. The previous
 *     implementation looked for the verb anywhere in the sentence and
 *     classified that last example as an action — a false positive on prose.
 *
 *  2. AN OBJECT FROM A KNOWN CONCEPT FAMILY, in that same clause, in a form
 *     Swedish actually uses. `\bworkflow\b` does not match `workflowet`, so
 *     every definite-form request an operator naturally types — "kör
 *     workflowet", "starta arbetsflödet", "skapa uppgiften" — fell through.
 *     Forms are enumerated explicitly (see `forms`) rather than guessed by a
 *     suffix engine, so `workflowexpert` can never match `workflow`.
 *
 *  3. NOT AN INFORMATIONAL OR RECALL QUESTION. "Hur kör jag workflowet?" and
 *     "Har du kört workflowet?" contain a verb and an object but ask for an
 *     explanation or a memory, and must never force a tool.
 *
 * Two boundary notes. JavaScript's `\b` is ASCII-oriented: å/ä/ö are not word
 * characters to it, so `\bgenomför\b` cannot anchor after its trailing "ö" and
 * `\barbetsflöde\b` behaves inconsistently around Swedish neighbours. Every
 * boundary here therefore uses the Unicode lookaround convention already
 * established in `nav-intent`, `honesty` and `status-intent`. And matching is
 * per-clause, so a descriptive sentence cannot license an action in another.
 *
 * THE ASYMMETRY: a false negative costs one conversational turn. A false
 * positive forces a tool call — potentially a real workflow run — on something
 * the operator only asked about. Ambiguity therefore resolves to NOT an action.
 *
 * Pure function (no deps) so it is unit-testable without loading the route.
 */

/** Unicode-safe lexical boundaries. `\b` is not usable for Swedish here. */
const B = '(?<![\\p{L}\\p{N}_])'
const E = '(?![\\p{L}\\p{N}_])'

/** A bounded alternation of literal words/phrases. */
const anyOf = (alts: readonly string[]) => `${B}(?:${alts.join('|')})${E}`

/**
 * Explicit inflected forms for one concept. Enumerated, never derived: this is
 * what keeps `workflowet` matching while `workflowexpert` does not.
 */
const forms = (base: string, ...suffixes: readonly string[]) =>
  [base, ...suffixes.map(s => base + s)]

/**
 * Action verbs, imperative/present only.
 *
 * Past tense is deliberately absent. "Körde du workflowet?" and "Vad
 * publicerade du?" ask about something already done; omitting the past forms
 * means they cannot be read as commands in the first place.
 *
 * Multi-word verbs precede their single-word prefixes so alternation reaches
 * the longer form first ("kör igång" before "kör").
 */
const ACTION_VERBS: readonly string[] = [
  // Swedish — imperative
  'kör igång', 'dra igång', 'sätt igång', 'starta', 'start', 'kör', 'aktivera',
  'generera', 'skapa', 'gör', 'trigga', 'exekvera', 'genomför', 'utför',
  'hämta', 'sök', 'hitta', 'rendera',
  // Swedish — infinitive. Required because a polite prefix takes the infinitive:
  // "kan du KÖRA workflowet", not "kan du kör". Most verbs are identical in both
  // forms; these are the ones that are not, and without them "kan du köra …"
  // would be classified differently from "kan du starta …" for purely
  // morphological reasons.
  'köra', 'göra', 'genomföra', 'utföra', 'söka',
  // English
  'kick off', 'run', 'trigger', 'execute', 'generate', 'create', 'fetch',
  'search', 'find', 'render', 'activate',
]

/**
 * Objects an action can be performed on, with the Swedish forms operators type.
 * The definite and plural forms are the entire point of this list.
 */
const ACTION_OBJECTS: readonly string[] = [
  ...forms('workflow', 'et', 's', 'en'),
  ...forms('arbetsflöde', 't', 'n', 'na'),
  ...forms('flöde', 't', 'n'),
  ...forms('process', 'en', 'er', 'erna'),
  ...forms('analys', 'en', 'er', 'erna'),
  ...forms('körning', 'en', 'ar', 'arna'),
  ...forms('jobb', 'et', 'en'),
  ...forms('agent', 'en', 'er', 'erna'),
  ...forms('kampanj', 'en', 'er', 'erna'),
  ...forms('pipeline', 'n', 's'),
  ...forms('inlägg', 'et', 'en'),
  ...forms('post', 'en', 'er', 'erna'),
  ...forms('video', 'n', 'r', 'rna', 's'),
  ...forms('reel', 's', 'en'),
  ...forms('manus', 'et', 'en'),
  ...forms('script', 'et', 's', 'en'),
  ...forms('nyhet', 'en', 'er', 'erna'),
  ...forms('artikel', 'n'), 'artiklar', 'artiklarna',
  ...forms('innehåll', 'et'),
  ...forms('rapport', 'en', 'er', 'erna'),
  ...forms('story', 'n'),
  ...forms('veckobrev', 'et'),
  ...forms('fynd', 'et', 'en', 'ena'),
  ...forms('ärende', 't', 'n', 'na'),
  ...forms('uppgift', 'en', 'er', 'erna'),
  // English / domain nouns
  'content', 'render', 'deploy', 'news', 'publish', 'youtube', 'voiceover',
  'finding', 'findings', 'dream', 'task', 'tasks', 'issue', 'issues',
]

/**
 * Polite framings that do not change the imperative — the same set
 * `nav-intent` strips before reading a navigation command.
 *
 * "vill du …?" and "kör du … åt mig?" are deliberately NOT here. They are
 * yes/no interrogatives, and although a Swedish operator often means them as
 * requests, they are also literally questions. Under this module's asymmetry
 * that ambiguity resolves to NOT an action: the cost is one extra turn, where
 * guessing wrong would run a workflow the operator was only asking about.
 */
const POLITE_PREFIX = new RegExp(
  '^(?:(?:kan du|kan ni|skulle du kunna|snälla|please|could you|can you|would you)\\s+)+',
  'iu',
)

/** Interrogatives: the clause asks for an explanation or an inventory. */
const INFORMATIONAL = new RegExp(
  `^(?:${['hur', 'vad', 'vilka', 'vilken', 'vilket', 'varför', 'när', 'vem', 'var',
    'how', 'what', 'which', 'why', 'when', 'who', 'where'].join('|')})${E}`,
  'iu',
)

/**
 * Swedish yes/no questions invert to verb-first, which looks exactly like an
 * imperative until you see what follows: "Kör workflowet" is an order, "Kör du
 * workflowet?" is a question. The giveaway is a pronoun subject immediately
 * after the verb. Treating these as commands would force a workflow run on
 * something the operator was only asking about.
 */
const SUBJECT_INVERSION = new RegExp(`^\\S+\\s+(?:du|ni|man|jag|vi)${E}`, 'iu')

/** Recall framings: the operator asks what already happened. */
const RECALL = new RegExp(
  [
    `${B}(?:har du|hade du|gjorde du|körde du|did you|have you|had you)${E}`,
    `${B}du nyss${E}`,
  ].join('|'),
  'iu',
)

/** Media-pipeline step proper names are an object in themselves. */
const MEDIA_STEP_NAMES = new RegExp(
  anyOf(['fetch ai news', 'generate script', 'generate voiceover', 'render video',
    'publish to social', 'publish to youtube']),
  'iu',
)

/**
 * Publish/post is an action on its own — the verb already names the effect, so
 * no object is required. VERB forms only: the noun "publicering" used to be a
 * trigger, which made the subject of a sentence enough to force a tool.
 * "Publiceringen startar efter godkännande" is a description, not a command.
 */
const PUBLISH_VERBS = new RegExp(`^(?:${['publicera', 'publish', 'posta', 'post'].join('|')})${E}`, 'iu')

/** Delegation is an action in itself, imperative only. */
const DELEGATE_VERBS = new RegExp(`^(?:${['delegera', 'delegate'].join('|')})${E}`, 'iu')

/** "skapa/create/gör … uppgift(er)/ärende(n)/task(s)". */
const CREATE_TASK = new RegExp(
  `^(?:skapa|create|gör)${E}[^.!?]*${anyOf([
    ...forms('uppgift', 'en', 'er', 'erna'),
    ...forms('ärende', 't', 'n', 'na'),
    'task', 'tasks',
  ])}`,
  'iu',
)

const VERB_AT_CLAUSE_START = new RegExp(`^(?:${ACTION_VERBS.join('|')})${E}`, 'iu')
const OBJECT_ANYWHERE = new RegExp(anyOf(ACTION_OBJECTS), 'iu')

/** Clause boundaries — a description and a command can share one message. */
const CLAUSE_SPLIT = /[.!?…\n]+|[,;:]\s+|\s+[—–]\s+/

/**
 * True when the message is a direct request for Atlas to perform an action.
 *
 * Evaluated clause by clause: after any polite prefix is removed, a clause
 * qualifies when it OPENS with an action verb and (for the general case) names
 * a known object in that same clause, and is not an informational or recall
 * question.
 */
export function isActionIntent(text: string): boolean {
  const raw = (text ?? '').normalize('NFC').trim()
  if (!raw) return false

  // A recall framing anywhere disqualifies the whole message: "Har du kört
  // workflowet?" must not become an order because of its verb and object.
  if (RECALL.test(raw)) return false

  for (const rawClause of raw.split(CLAUSE_SPLIT)) {
    const clause = rawClause.trim().toLowerCase()
    if (!clause) continue

    // A media step's proper name is a request in itself ("Fetch AI News").
    if (MEDIA_STEP_NAMES.test(clause)) return true

    if (INFORMATIONAL.test(clause)) continue

    const command = clause.replace(POLITE_PREFIX, '').trim()
    if (!command) continue
    if (INFORMATIONAL.test(command)) continue
    // Verb-first with a pronoun subject is an inverted question, not an order.
    if (SUBJECT_INVERSION.test(command)) continue

    if (PUBLISH_VERBS.test(command)) return true
    if (DELEGATE_VERBS.test(command)) return true
    if (CREATE_TASK.test(command)) return true

    if (VERB_AT_CLAUSE_START.test(command) && OBJECT_ANYWHERE.test(command)) return true
  }

  return false
}
