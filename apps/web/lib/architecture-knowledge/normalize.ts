import { sha256 } from './hash'

export interface MarkdownSectionDraft {
  sectionId: string
  sectionTitle: string
  anchor: string
  ordinal: number
  text: string
  textChecksum: string
}

export function normalizeCanonicalText(input: string): string {
  const lines = input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.replace(/[\t ]+$/g, ''))

  const output: string[] = []
  let blank = false
  for (const line of lines) {
    if (!line.trim()) {
      if (!blank && output.length) output.push('')
      blank = true
      continue
    }
    output.push(line)
    blank = false
  }
  return output.join('\n').trim()
}

export function stripFrontMatter(markdown: string): { body: string; frontMatter: Record<string, string> } {
  const normalized = markdown.replace(/\r\n?/g, '\n')
  if (!normalized.startsWith('---\n')) return { body: normalized, frontMatter: {} }
  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) return { body: normalized, frontMatter: {} }
  const frontMatter: Record<string, string> = {}
  for (const line of normalized.slice(4, end).split('\n')) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!match) continue
    frontMatter[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return { body: normalized.slice(end + 5), frontMatter }
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'section'
}

function uniqueId(base: string, seen: Map<string, number>): string {
  const next = (seen.get(base) ?? 0) + 1
  seen.set(base, next)
  return next === 1 ? base : `${base}-${next}`
}

/** Parse a canonical Markdown reading copy without rewriting any source wording. */
export function parseMarkdownSections(markdown: string, chapterNumber: number): MarkdownSectionDraft[] {
  const { body } = stripFrontMatter(markdown)
  const lines = body.split('\n')
  const sections: MarkdownSectionDraft[] = []
  const seen = new Map<string, number>()
  let pendingAnchor: string | null = null
  let currentTitle = 'Chapter mandate'
  let currentId = `chapter-${chapterNumber}-mandate`
  let currentAnchor = currentId
  let buffer: string[] = []

  const flush = () => {
    const text = normalizeCanonicalText(buffer.join('\n'))
    buffer = []
    if (!text) return
    const canonicalText = normalizeCanonicalText(`${currentTitle}\n\n${text}`)
    sections.push({
      sectionId: currentId,
      sectionTitle: currentTitle,
      anchor: currentAnchor,
      ordinal: sections.length,
      text: canonicalText,
      textChecksum: sha256(canonicalText),
    })
  }

  for (const line of lines) {
    const anchor = line.match(/^<a\s+id=["']([^"']+)["']\s*><\/a>\s*$/i)
    if (anchor) {
      pendingAnchor = anchor[1]
      continue
    }
    const heading = line.match(/^#{2,6}\s+(.+?)\s*$/)
    if (heading) {
      flush()
      currentTitle = normalizeCanonicalText(heading[1])
      const numbered = currentTitle.match(/^(\d+(?:\.\d+)+)\b/)
      currentId = uniqueId(numbered?.[1] ?? `chapter-${chapterNumber}-${slugify(currentTitle)}`, seen)
      currentAnchor = pendingAnchor ?? `section-${currentId.replace(/\./g, '-')}`
      pendingAnchor = null
      continue
    }
    // The chapter H1 is identity metadata, not a section body.
    if (/^#\s+/.test(line)) continue
    buffer.push(line)
  }
  flush()
  return sections.map((section, ordinal) => ({ ...section, ordinal }))
}

export function normalizeQuery(query: string): string {
  return query.normalize('NFKC').toLocaleLowerCase('sv-SE').replace(/\s+/g, ' ').trim()
}

function stemLexicalToken(token: string): string {
  if (/\d/.test(token) || token.includes('-')) return token
  const irregular: Record<string, string> = {
    selected: 'select', selection: 'select', selections: 'select', selecting: 'select',
    registered: 'register', registration: 'register', registrations: 'register', registering: 'register',
  }
  if (irregular[token]) return irregular[token]
  if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

export function tokenize(input: string): string[] {
  return (normalizeQuery(input).match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? []).map(stemLexicalToken)
}
