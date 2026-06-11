/**
 * Atlas action-intent detection.
 *
 * The operator asks Atlas to DO something concrete (run/start/publish/activate/
 * delegate/create-task). When this matches, the chat route forces tool_choice on
 * the first turn so a real tool call is guaranteed — Atlas can never merely claim
 * the action happened.
 *
 * Extracted into its own module (like nav-intent) so it is unit-testable without
 * loading the chat route and its dependencies.
 */
export function isActionIntent(text: string): boolean {
  const t = (text || '').toLowerCase().trim()
  // RECALL/FRÅGA om DÅTIDA åtgärder ("vad/vilka delegerade du nyss?", "what did you
  // delegate?") är INTE en åtgärdsbegäran — då får vi inte tvinga ett verktyg.
  const isRecallQuestion =
    t.endsWith('?')
    || /(?<![\wåäöÅÄÖ])(vad|vilka|vilken|vilket)(?![\wåäöÅÄÖ])/.test(t)
    || /\b(what|which|did you|have you|har du|gjorde du)\b/.test(t)
    || /(?<![\wåäöÅÄÖ])du nyss(?![\wåäöÅÄÖ])/.test(t)
  // Publicera/posta innebär en åtgärd i sig själv (inget objekt krävs).
  if (/\b(publicera|publish|posta|publicering)\b/.test(t)) return true
  // Delegering / Dream→Action är en åtgärd i sig själv — men BARA som imperativ,
  // inte som recall-fråga ("delegera de kritiska" ✓ / "vad delegerade du?" ✗).
  if (!isRecallQuestion) {
    if (/(?<![\wåäöÅÄÖ])delegera(?![\wåäöÅÄÖ])|\bdelegate\b/.test(t)) return true
    // "skapa/create uppgift(er)/task(s) (av/från fynd …)".
    if (/\b(skapa|create|gör)\b[^.!?]*\b(uppgift|uppgifter|task|tasks)\b/.test(t)) return true
  }
  // Media-stegens egennamn räknas som objekt (engelska namn → matcha direkt).
  if (/\b(fetch ai news|generate script|generate voiceover|render video|publish to social|publish to youtube)\b/.test(t)) return true
  // Övriga handlingsverb kräver ett objekt (workflow/nyhet/script/analys/fynd/uppgift …).
  return /\b(starta|start|kör|kör igång|dra igång|sätt igång|aktivera|generera|skapa|gör|trigga|exekvera|genomför|utför|hämta|sök|hitta)\b/.test(t)
    && /\b(workflow|arbetsflöde|flöde|analys|process|agent|kampanj|pipeline|körning|jobb|inlägg|post|video|reel|manus|script|nyhet|nyheter|artikel|innehåll|content|story|veckobrev|rapport|render|deploy|news|publish|youtube|voiceover|fynd|finding|findings|dream|ärende|ärenden|uppgift|uppgifter|task|tasks)\b/.test(t)
}
