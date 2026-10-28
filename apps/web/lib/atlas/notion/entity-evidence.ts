/**
 * Atlas Notion P1: single named-subject evidence selection.
 * Pure and project-agnostic. All Notion text is untrusted evidence, never authority.
 * The caller must still enforce authenticated project + approved-page access.
 */
export type EntityScope =
  | { kind: 'general' }
  | { kind: 'ambiguous' }
  | { kind: 'named'; subject: string }

export type ScopedEntityEvidence =
  | { kind: 'general' }
  | { kind: 'ambiguous' }
  | { kind: 'not_found'; subject: string }
  | { kind: 'found'; subject: string; excerpt: string; excerptOnly: true; actionAuthority: false; sourceEvidence: 'named_heading' | 'named_line' }

const GENERIC = new Set([
  'notion', 'atlas', 'omnira', 'handlarbörsen', 'handlarbörsens', 'projekt',
  'projektet', 'pilot', 'piloten', 'status', 'överlämning', 'tidigare',
  'beslut', 'dag', 'företaget', 'företag', 'firman', 'personen', 'idag',
])
const MAX_EXCERPT = 4_800
const SEPARATOR = '\n\n[--- separat källutdrag ---]\n\n'

const normalized = (text: string) => text.normalize('NFC').toLocaleLowerCase('sv-SE').replace(/\s+/g, ' ').trim()

/** The model must not decide whether a question concerns one business or two. */
export function inferNotionEntityScope(question: string, project: string): EntityScope {
  if (typeof question !== 'string' || question.length > 1_800) return { kind: 'general' }
  const projectName = normalized(project).replace(/s$/, '')
  // Look for explicit named referents, not generic capitalized sentence starts.
  const expression = /(?:^|[\s(])(?:om|och|för|gällande|kring|angående|med|hos|rörande|about|regarding|företaget|firman|personen)\s+([\p{Lu}][\p{L}\p{N}.-]*(?:\s+[\p{Lu}][\p{L}\p{N}.-]*){0,2})(?=[\s?!.,;:)]|$)/gu
  const candidates = [...question.matchAll(expression)].map(m => m[1].trim())
  const selected = candidates.filter(candidate => {
    const name = normalized(candidate)
    const noGenitive = name.replace(/s$/, '')
    return name.length >= 4 && !GENERIC.has(name) && !GENERIC.has(noGenitive)
      && noGenitive !== projectName && !name.startsWith(projectName + ' ')
  })
  const distinct = [...new Map(selected.map(s => [normalized(s), s])).values()]
  if (distinct.length > 1) return { kind: 'ambiguous' }
  return distinct.length === 1 ? { kind: 'named', subject: distinct[0] } : { kind: 'general' }
}

/** Literal name match with word boundaries; Kareby Bil is not Kareby Bilverkstad. */
function mentions(text: string, name: string): boolean {
  const normText = normalized(text)
  const normName = normalized(name)
  let at = normText.indexOf(normName)
  while (at >= 0) {
    const before = at > 0 ? normText[at - 1] : ''
    const after = normText[at + normName.length] ?? ''
    if ((!before || !/[\p{L}\p{N}]/u.test(before)) && (!after || !/[\p{L}\p{N}]/u.test(after))) return true
    at = normText.indexOf(normName, at + 1)
  }
  return false
}

function headingLevel(line: string): number | null {
  const match = line.match(/^(#{1,6})\s/u)
  return match ? match[1].length : null
}

/**
 * Fail closed for a named person/company when there is no exact-heading
 * evidence. In a mixed-company list, output only lines mentioning that name;
 * never include adjacent status bullets belonging to a different company.
 */
export function selectNotionEntityEvidence(markdown: string, question: string, project: string): ScopedEntityEvidence {
  const scope = inferNotionEntityScope(question, project)
  if (scope.kind !== 'named') return scope
  const subject = scope.subject
  if (typeof markdown !== 'string' || !markdown.trim()) return { kind: 'not_found', subject }
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const headingStarts: { index: number; level: number; title: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const level = headingLevel(lines[i])
    if (level) headingStarts.push({ index: i, level, title: lines[i] })
  }

  // A named heading's FIRST following paragraph is its local evidence. A
  // later, unrelated paragraph might still be physically under the same
  // heading (for example a Founding 5 list below Kareby Bil's status). Do
  // not silently attach that later paragraph to the named company.
  const dedicated: string[] = []
  for (const heading of headingStarts) {
    if (!mentions(heading.title, subject)) continue
    // Avoid mixed-entity headings such as "Kareby Bil och EVExperten".
    if (/\boch\s+[\p{Lu}][\p{L}\p{N}.-]*/u.test(heading.title.slice(heading.title.indexOf(subject) + subject.length))) continue
    let first = heading.index + 1
    while (first < lines.length && !lines[first].trim()) first++
    if (first >= lines.length || headingLevel(lines[first])) continue
    let end = first
    while (end < lines.length && lines[end].trim() && !headingLevel(lines[end])) end++
    const block = lines.slice(first, end).join('\n').trim()
    if (block) dedicated.push(heading.title + '\n' + block)
  }

  let passages: string[]
  let sourceEvidence: 'named_heading' | 'named_line'
  if (dedicated.length) {
    // Latest explicit subject note first, not generic older campaign logs.
    passages = dedicated.reverse()
    sourceEvidence = 'named_heading'
  } else {
    // Fallback: only individually named lines. Never return an entire mixed
    // paragraph just because one company name occurs somewhere within it.
    const scoped = lines.filter(line => mentions(line, subject) && headingLevel(line) === null)
      .map(line => line.trim()).filter(Boolean)
    passages = [...new Set(scoped)].reverse()
    sourceEvidence = 'named_line'
  }
  if (!passages.length) return { kind: 'not_found', subject }

  let excerpt = ''
  for (const passage of passages) {
    const remaining = MAX_EXCERPT - excerpt.length - (excerpt ? SEPARATOR.length : 0)
    if (remaining < 30) break
    // Don't add a fragment of a company status if the first named section is
    // already outside the bound. The caller sees excerptOnly=true and can ask
    // for a further scoped query rather than mistaking silence for absence.
    excerpt += (excerpt ? SEPARATOR : '') + passage.slice(0, remaining)
  }
  if (!mentions(excerpt, subject)) return { kind: 'not_found', subject }
  return { kind: 'found', subject, excerpt, excerptOnly: true, actionAuthority: false, sourceEvidence }
}
