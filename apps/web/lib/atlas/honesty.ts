/**
 * Atlas honesty guards — claim-detection regexes.
 *
 * Atlas streams free text. These patterns detect when that text *claims* an
 * action or a navigation happened. The chat route pairs each regex with a
 * "did the corresponding tool actually run this turn?" flag and appends a
 * correction when a claim is made without the backing tool call.
 *
 * Pure module (regex only) so the guards are unit-testable without loading the
 * server route and its dependencies.
 */

// Åtgärdsverb som, när Atlas självt är subjektet, påstår en utförd eller pågående
// körning/publicering. Presens, preteritum och supinum — ett påstående är lika
// falskt i dåtid ("jag publicerade videon") som i presens ("jag publicerar den").
const ACTION_VERBS = [
  'startar', 'startat', 'startade',
  'triggar', 'triggat', 'triggade',
  'publicerar', 'publicerat', 'publicerade',
  'postar', 'postat', 'postade',
  'genomför', 'genomfört', 'genomförde',
  // Bare "kör/körde/kört" is a claim only because this pattern is clause-initial:
  // "Jag körde workflowet" matches, "Systemet kör en render" does not, because
  // the latter has its own subject in front of the verb.
  'kör', 'körde', 'kört',
  'kör igång', 'körde igång', 'drar igång', 'drog igång',
  'sätter igång', 'satte igång',
  'påbörjar', 'påbörjat', 'påbörjade',
].join('|')

/**
 * Ett åtgärdspåstående — SATSINITIALT, inte var som helst i texten.
 *
 * Detta är hela skillnaden mellan ett påstående och en beskrivning. "Startar
 * publiceringen." och "Jag publicerade videon." har Atlas som subjekt. "Nästa
 * körning startar kl 14." och "The Prompt publicerar två gånger om dagen." har
 * ett annat subjekt före verbet — de rapporterar verksamheten och påstår
 * ingenting om vad Atlas gjort. Den gamla regexen såg bara verbet, var det än
 * stod, och kunde därför inte skilja dem åt: en ren statusrapport utlöste en
 * körnings-varning. Den missade samtidigt dåtidspåståenden helt, så det
 * verkligt farliga fallet ("jag publicerade videon") gick igenom.
 *
 * Satsinitialt = satsens början, eventuellt föregånget av "jag"/"vi" och ett
 * hjälpord. Står något annat framför verbet är någon annan subjektet.
 */
export const ACTION_CLAIM_RE = new RegExp(
  `^(?:(?:jag|vi)\\s+)?(?:har\\s+|nu\\s+|redan\\s+|precis\\s+)?(?:${ACTION_VERBS})(?![\\wåäöÅÄÖ])`
  + `|^(?:jag|vi)\\s+(?:har\\s+)?(?:startat|köat|triggat|publicerat|kört)(?![\\wåäöÅÄÖ])`,
  'i',
)

/**
 * Framingar som aldrig är påståenden: frågor och erbjudanden. "Vill du att jag
 * kör publiceringen?" och "Ska jag starta workflowet?" innehåller åtgärdsverb i
 * första person men lovar ingenting — de ber om tillstånd.
 */
const OFFER_RE = /(vill du|vill ni|ska jag|ska vi|kan jag|kan vi|om du vill|säg till|bekräfta)/i

/** Satsgränser: meningsskiljetecken samt komma/semikolon/tankstreck. */
const CLAUSE_SPLIT = /[.!?…\n]+|[,;]\s+|\s+[—–]\s+/

/**
 * Sant när texten påstår en utförd/pågående åtgärd. Paras i route.ts med
 * "kördes ett åtgärdsverktyg denna tur?" — bara ett obackat påstående korrigeras.
 *
 * Satsvis, av två skäl som drar åt olika håll: ett beskrivande led ska inte
 * smitta hela svaret, och ett påstående gömt mitt i en lång statusrapport ska
 * ändå fångas. Frågor och erbjudanden hoppas över.
 */
export function isUnsupportedActionClaim(text: string): boolean {
  if (!text) return false
  for (const rawClause of text.split(CLAUSE_SPLIT)) {
    const clause = rawClause.trim()
    if (!clause) continue
    if (OFFER_RE.test(clause)) continue
    if (ACTION_CLAIM_RE.test(clause)) return true
  }
  return false
}

// Fraser som PÅSTÅR att en delegering/uppgift skapats — Dream→Action eller
// generell delegate. Paras i route.ts med delegateToolUsed (delegate /
// delegate_dream_finding som LYCKADES denna tur). Påstående utan backande
// verktygsanrop → delegerings-ärlighetsspärr (egen, workflow-oberoende text).
export const DELEGATE_CLAIM_RE = new RegExp(
  [
    '(?<![\\wåäöÅÄÖ])(delegerar|delegerat|delegerade)(?![\\wåäöÅÄÖ])',
    '\\b(delegating|delegated)\\b',
    '(?<![\\wåäöÅÄÖ])(skapar|skapat|skapade)(?![\\wåäöÅÄÖ])[^.!?]*(?<![\\wåäöÅÄÖ])(uppgift|uppgifter|uppgiften)(?![\\wåäöÅÄÖ])',
    '\\b(creating|created)\\b[^.!?]*\\b(task|tasks)\\b',
  ].join('|'),
  'i',
)

// Fraser som PÅSTÅR en utförd/pågående NAVIGERING — att en vy/sida/projekt
// öppnats eller att operatören tagits dit. Om Atlas skriver något av dessa utan
// att ett LYCKAT navigate-verktyg kördes denna tur → falskt påstående
// (navigations-ärlighetsspärr). VIKTIGT: "här är genvägar"/"here are shortcuts"
// (present_links) ska INTE matcha — det är ett erbjudande, inte en navigering.
export const NAV_CLAIM_RE = new RegExp(
  [
    // Engelska
    '\\b(opened|opening|navigated|navigating|switched to|brought you to)\\b',
    '\\b(took|taking) you (to|there)\\b',
    '\\b(showing|showed)( you)? (the )?[\\w-]+ (page|view|project|queue|dashboard|approvals|costs|revenue|activity)\\b',
    '\\bopened the (page|project|view)\\b',
    // Svenska. OBS: \b fungerar inte för ord som börjar/slutar på å/ä/ö (de är
    // inte \w-tecken), så vi använder Unicode-medvetna lookarounds i stället.
    '(?<![\\wåäöÅÄÖ])(öppnar|öppnat|öppnade)(?![\\wåäöÅÄÖ])',
    '(?<![\\wåäöÅÄÖ])(navigerar|navigerade)(?![\\wåäöÅÄÖ])',
    '(?<![\\wåäöÅÄÖ])(tar|tog) dig (till|dit)(?![\\wåäöÅÄÖ])',
    '(?<![\\wåäöÅÄÖ])(visar|visade)( dig)? (sidan|vyn|projektet|godkännande|godkännanden|kostnader|intäkter|aktiviteten)(?![\\wåäöÅÄÖ])',
  ].join('|'),
  'i',
)
