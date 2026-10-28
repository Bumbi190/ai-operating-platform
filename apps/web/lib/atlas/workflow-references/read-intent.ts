/**
 * Precise read-intent for Atlas's PINNED EXTERNAL workflow reference catalog.
 *
 * This is NOT a workflow execution intent. Exact external-source requests must
 * reach the authenticated full tool path even if they contain writing words
 * such as "förbättra" (formerly misclassified as content-only fast path).
 *
 * Deliberately fail-closed: ordinary n8n discussions, content rewrites,
 * negated searches and commands to run automations are not catalog searches.
 * Only the first (operator-directed) clause can license this routing; text
 * quoted later in a document cannot force tools.
 */
const SUBJECT = /(?<![\p{L}\p{N}_])(?:workflow[\s-]?referens(?:en|er|erna)?|arbetsflödesreferens(?:en|er|erna)?|flödesreferens(?:en|er|erna)?|extern(?:a|t)?\s+(?:workflows?|arbetsflöden?|automationsflöden?|flöden?|workflowkatalog(?:en)?|workflowbibliotek(?:et)?|automationsbibliotek(?:et)?|n8n)|n8n(?:[\s-]*(?:workflows?|flöden?|bibliotek(?:et)?|katalog(?:en)?|referenser?))?)(?![\p{L}\p{N}_])/iu

const POLITE = /^(?:(?:kan du|kan ni|skulle du kunna|could you|snälla|please)\s+)*/iu
const READ = /^(?:sök|söka|hitta|visa|lista|jämför|jämföra|granska|leta upp|leta|search|find|show|list|compare)(?![\p{L}\p{N}_])/iu
const QUESTION = /^(?:vilka|vilken|vilket|finns det|which|what)(?![\p{L}\p{N}_])/iu
const NEGATED_READ = /^(?:sök|söka|hitta|visa|lista|jämför|jämföra|granska|leta upp|leta)\s+(?:inte|ej|aldrig)(?![\p{L}\p{N}_])/iu

export function isExternalWorkflowReferenceReadIntent(text: unknown): boolean {
  if (typeof text !== 'string' || text.length > 1200) return false
  const normalized = text.normalize('NFC').trim().toLocaleLowerCase('sv-SE')
  if (!normalized || !SUBJECT.test(normalized)) return false
  const command = normalized.replace(POLITE, '').trim()
  if (NEGATED_READ.test(command)) return false
  return READ.test(command) || QUESTION.test(command)
}
