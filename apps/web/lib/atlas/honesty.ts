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

// Ord/fraser som PÅSTÅR en utförd/pågående åtgärd (workflow-körning/publicering).
// Om Atlas skriver något av dessa utan att ha kört ett åtgärds-verktyg samma tur
// → falskt påstående (åtgärds-ärlighetsspärr).
export const ACTION_CLAIM_RE = new RegExp(
  [
    // Starka åtgärds-verb i presens (med eller utan "jag") = påstår pågående körning/postning.
    '\\b(startar|triggar|publicerar|postar|kör igång|drar igång|sätter igång|påbörjar)\\b',
    // "kör/genomför … <workflow-objekt eller -namn>" (ej ren analys).
    '\\b(kör|genomför)\\b[^.!?]*\\b(workflow|arbetsflöde|fetch ai news|generate script|generate voiceover|publish to social|publish to youtube|render video|render|youtube|nyhet|nyheten|artikeln|scriptet|manus|posten|inlägget|publicering|videon|reel)\\b',
    // Status-påståenden om workflow/körning/publicering.
    '\\bworkflow(et)?\\b[^.!?]*\\b(startat|köat|köad|igång|påbörjat|triggat)\\b',
    '\\b(körningen|publiceringen)\\b[^.!?]*\\b(startad|köad|igång|påbörjad)\\b',
    '\\b(har )?(startat|köat|triggat|publicerat) (workflow|körning|scriptet|nyheten|posten|inlägget)\\b',
  ].join('|'),
  'i',
)

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
