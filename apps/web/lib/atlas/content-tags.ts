/**
 * lib/atlas/content-tags.ts — grov ämnesklassificering för innehållsanalys.
 *
 * Deterministisk, nyckelordsbaserad. Speglar backfill-logiken så befintliga och
 * framtida inlägg taggas likadant. Coarse med flit — på låg volym är finkorniga
 * ämnen brus. Används vid skapande (step) och kan köras om vid behov.
 */

export type ContentTopic =
  | 'regulation' | 'healthcare' | 'infrastructure' | 'coding'
  | 'business' | 'research' | 'model' | 'other'

const RULES: [ContentTopic, RegExp][] = [
  ['regulation',     /(vatican|political|regulat|policy|govern|audit|\blaw\b|antitrust)/i],
  ['healthcare',     /(hospital|health|disease|medical|patient|children'?s|clinic|doctor|white coat)/i],
  ['infrastructure', /(gpu|cluster|datacenter|data center|cable|infrastructure|compute)/i],
  ['coding',         /(developer|coding|\bcode\b|engineer|software|backlog|\bship\b|requirements)/i],
  ['business',       /(startup|\byc\b|enterprise|gartner|\bjob\b|hiring|business|adopt|market)/i],
  ['research',       /(conjecture|genetic|physics|\bmath\b|research|scientist|rejuven|simulate)/i],
  ['model',          /(openai|google|deepmind|anthropic|model|\bgpt\b|gemini|claude|launch|release)/i],
]

/** Klassificera ett inlägg utifrån dess hook (+ ev. script). Faller till 'other'. */
export function classifyTopic(hook: string | null | undefined, extra = ''): ContentTopic {
  const text = `${hook ?? ''} ${extra}`.trim()
  if (!text) return 'other'
  for (const [topic, re] of RULES) if (re.test(text)) return topic
  return 'other'
}
