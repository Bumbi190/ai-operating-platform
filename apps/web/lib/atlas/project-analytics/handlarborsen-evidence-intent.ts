/**
 * Strict intent for one operator-facing READ comparing existing Handlarbörsen
 * sales evidence to an untrusted, static external workflow reference catalog.
 *
 * This is a routing hint, never authentication. Exact project ownership and
 * platform-operator authority are separately enforced by executeTool.
 */
const HB = /handlarb[oö]rs(?:en|ens|[-\s]?b[oö]rsen)?/iu
const INTERNAL = /(?:crm|sälj|sales|kontakt|mejl|e-post|epost|inkorg|inbox|svar|scb|pipeline|uppfölj|outreach)/iu
const EXTERNAL = /(?:n8n|extern(?:a|t)?[\s-]+(?:workflow|arbetsflö|flöde|automati)|workflow[\s-]?referens|arbetsflödesreferens|workflowkatalog)/iu
const READ_BEGIN = /^(?:(?:kan du|skulle du kunna|vänligen|snälla|please)\s+)*(?:jämför|jämföra|granska|visa\s+(?:en\s+)?jämförelse|gör\s+en\s+jämförelse|sök)(?![\p{L}\p{N}_])/iu
const NO_READ = /^(?:(?:kan du|skulle du kunna|vänligen|snälla)\s+)*(?:jämför|granska|visa|sök)\s+(?:inte|ej|aldrig)(?![\p{L}\p{N}_])/iu
const WRITES = /^(?:(?:kan du|skulle du kunna|vänligen|snälla)\s+)*(?:skriv|skicka|kör|starta|publicera|importera|radera|uppdatera|aktivera)(?![\p{L}\p{N}_])|(?:\boch\b|\bsamt\b)\s+(?:skicka|starta|publicera|importera|radera|aktivera)(?![\p{L}\p{N}_])/iu

export function isHandlarborsenEvidenceComparisonIntent(input: unknown): boolean {
  if (typeof input !== 'string' || input.length > 1200) return false
  const text = input.normalize('NFC').trim().toLowerCase()
  if (!text || !HB.test(text) || !INTERNAL.test(text) || !EXTERNAL.test(text)) return false
  if (!READ_BEGIN.test(text) || NO_READ.test(text) || WRITES.test(text)) return false
  // "Sök" alone is an external-source lookup. Demand a genuine comparison.
  if (/^(?:(?:kan du|skulle du kunna|vänligen|snälla|please)\s+)*sök\b/iu.test(text) &&
      !/(?:jämför|jämförelse|mot\s+(?:vårt|våra|befintlig)|med\s+(?:vårt|våra|befintlig))/iu.test(text)) return false
  return true
}
