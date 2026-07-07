/**
 * Navigation-intent detection.
 *
 * A direct imperative navigation command ("Open The Prompt", "Take me to
 * approvals", "Visa failed runs") IS the operator's confirmation — Atlas should
 * navigate immediately rather than offer shortcuts and wait for a second turn.
 * The chat route uses this to force `tool_choice: navigate` on the first turn
 * for these commands, so they deterministically result in a navigate call.
 *
 * Pure function (no deps) so it is unit-testable without loading the route.
 */

// Le, valfri artig/hjälpande inledning som inte ändrar avsikten.
const POLITE_PREFIX = /^(?:(?:kan du|kan ni|skulle du kunna|snälla|please|could you|can you|would you)\s+)?/

// Otvetydiga imperativa navigeringsverb (eng. + sv). "open/öppna/go to/gå till/
// take me to/ta mig till/navigate to/navigera till".
const DIRECT_NAV = /^(öppna|open|gå till|go to|navigera till|navigate to|ta mig till|take me to)\b/

// "show/visa" är navigering OM det inte är en fråga om HUR man gör något
// ("show me how", "visa hur", "how do I…") — då är det inte en vy-öppning.
const SHOW_NAV = /^(visa|show)\b/
const SHOW_NOT_NAV = /^(visa|show)\s+(me\s+how|how|hur|mig\s+hur)\b/

/**
 * True when the message is a direct imperative request to open/navigate to a
 * destination (a project or a page). Conservative on purpose: only fires for
 * leading navigation verbs, and excludes "show me how"-style questions.
 */
export function isNavIntent(text: string): boolean {
  const t = (text ?? '').trim().toLowerCase().replace(POLITE_PREFIX, '')
  if (!t) return false
  if (DIRECT_NAV.test(t)) return true
  if (SHOW_NAV.test(t) && !SHOW_NOT_NAV.test(t)) return true
  return false
}
