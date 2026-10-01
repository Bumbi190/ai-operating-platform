export type SpeechBoundary = 'sentence' | 'soft' | 'final'

export interface SpeechSegment {
  /** Exact source characters. Concatenating every segment reconstructs input. */
  text: string
  boundary: SpeechBoundary
}

const ABBREVIATIONS = new Set([
  'bl.a.', 'ca.', 'd.v.s.', 'dr.', 'etc.', 'ex.', 'fr.o.m.', 'kl.', 'm.fl.',
  'nr.', 'obs.', 'prof.', 's.k.', 't.ex.', 't.o.m.', 'vs.',
])

const MIN_WORDS = 4
// Phase B samples showed complete, useful first clauses commonly landing at
// 5–7 words before a comma or em dash. Keep both floors so acknowledgements and
// filler fragments still buffer, while a semantic clause can reach TTS sooner.
const MIN_SOFT_WORDS = 5
const MIN_SOFT_CHARS = 32

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length
}

function tokenBefore(value: string, index: number): string {
  return value.slice(0, index + 1).trimEnd().split(/\s+/u).at(-1)?.toLowerCase() ?? ''
}

function isProtectedPeriod(value: string, index: number): boolean {
  const before = value[index - 1]
  const after = value[index + 1]
  if (/\d/u.test(before ?? '') && /\d/u.test(after ?? '')) return true

  let left = index
  let right = index + 1
  while (left > 0 && /[\p{L}.]/u.test(value[left - 1])) left -= 1
  while (right < value.length && /[\p{L}.]/u.test(value[right])) right += 1
  const dottedToken = value.slice(left, right).toLowerCase()
  const token = tokenBefore(value, index)
  if (ABBREVIATIONS.has(dottedToken) || ABBREVIATIONS.has(token)) return true
  if (/^(?:https?:\/\/|www\.)/iu.test(token)) return true
  if (/^[\p{L}\p{N}-]+\.[\p{L}\p{N}.-]+$/u.test(token)) return true
  if (/^(?:[\p{L}]\.){2,}$/u.test(token)) return true
  return false
}

function boundaryEnd(value: string, index: number): number {
  let end = index + 1
  while (/[.!?…]/u.test(value[end] ?? '')) end += 1
  while (/\s/u.test(value[end] ?? '')) end += 1
  return end
}

function findBoundary(value: string, final: boolean): { end: number; boundary: SpeechBoundary } | null {
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (/[.!?…]/u.test(char)) {
      if (char === '.' && isProtectedPeriod(value, i)) continue
      const end = boundaryEnd(value, i)
      const isClosed = end > i + 1 || final || i < value.length - 1
      if (!isClosed) continue
      const candidate = value.slice(0, end)
      if (wordCount(candidate) < MIN_WORDS && !final) continue
      return { end, boundary: 'sentence' }
    }

    if (!/[,;:\u2014]/u.test(char)) continue
    if (char === ':' && /\d/u.test(value[i - 1] ?? '') && /\d/u.test(value[i + 1] ?? '')) continue
    if (char === ':' && /https?$/iu.test(value.slice(Math.max(0, i - 5), i))) continue
    const end = boundaryEnd(value, i)
    if (end === i + 1 && !final) continue
    const candidate = value.slice(0, end)
    if (candidate.trim().length < MIN_SOFT_CHARS || wordCount(candidate) < MIN_SOFT_WORDS) continue
    return { end, boundary: 'soft' }
  }
  return null
}

/** Stateful, pure-with-respect-to-I/O incremental speech segmentation. */
export class IncrementalSpeechSegmenter {
  private pending = ''

  push(chunk: string, final = false): SpeechSegment[] {
    this.pending += chunk
    const result: SpeechSegment[] = []

    for (;;) {
      const found = findBoundary(this.pending, final)
      if (!found) break
      result.push({ text: this.pending.slice(0, found.end), boundary: found.boundary })
      this.pending = this.pending.slice(found.end)
    }

    if (final && this.pending) {
      result.push({ text: this.pending, boundary: 'final' })
      this.pending = ''
    }
    return result
  }

  buffered(): string {
    return this.pending
  }
}

/** Remove presentation-only Markdown from speech without changing visible text. */
export function toSpeechText(source: string): string {
  return source
    .replace(/```[\s\S]*?```/gu, ' kodblock ')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]\s|\d+[.)]\s|>\s?)/gmu, '')
    .replace(/[*_~]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}
