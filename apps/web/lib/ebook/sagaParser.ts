/**
 * sagaParser.ts
 *
 * Parsar Saga-berättarens markdown-output till strukturerad data
 * för EPUB- och PDF-generering.
 *
 * Format som förväntas:
 *   ## 📖 SAGANS OMSLAG
 *   ## 📚 BILDSAGA — 16 SIDOR
 *   **[Sid X]** + illustration + > text
 *   ## 📖 BAKSIDA
 *   ## 🎙️ MP3-MANUS
 */

export interface StoryPage {
  number: number
  illustrationDesc: string   // kursiv beskrivning av vad bilden visar
  text: string               // 1-2 meningar som läses högt
}

export interface ParsedSaga {
  title: string
  subtitle: string
  coverIllustrationDesc: string
  pages: StoryPage[]
  backCoverIllustrationDesc: string
  sensmoralen: string
  quote: string
  mp3Script: string
  /** Raw saga text (för fallback) */
  rawMarkdown: string
}

/** Strip markdown bold/italic/trailing asterisks from a string */
function stripMd(s: string): string {
  return s
    .replace(/\*\*([^*]*)\*\*/g, '$1') // **bold** → bold
    .replace(/\*([^*]*)\*/g, '$1')     // *italic* → italic
    .replace(/\*+/g, '')               // stray asterisks
    .replace(/__([^_]*)__/g, '$1')     // __bold__
    .replace(/_([^_]*)_/g, '$1')       // _italic_
    .trim()
}

export function parseSaga(markdown: string): ParsedSaga {
  const raw = markdown.trim()

  // ── Omslag ────────────────────────────────────────────────────────────────
  const coverMatch = raw.match(
    /##\s*📖\s*SAGANS OMSLAG[\s\S]*?Titel:\s*(.+?)\n[\s\S]*?Undertitel:\s*(.+?)\n[\s\S]*?\*\[([^\]]+)\]\*/
  )
  // Fallback: look for any bold title near the top of the document
  const titleFallback = raw.match(/^#\s+(.+)|^\*\*Titel:\*\*\s*(.+)|Titel:\s*(.+)/m)
  const title        = stripMd(coverMatch?.[1]?.trim() ?? titleFallback?.[1]?.trim() ?? titleFallback?.[2]?.trim() ?? titleFallback?.[3]?.trim() ?? 'Nova & Pling-sagan')
  const subtitle     = stripMd(coverMatch?.[2]?.trim() ?? 'En Nova & Pling-saga')
  const coverIllDesc = coverMatch?.[3]?.trim() ?? ''

  // ── Sidor ─────────────────────────────────────────────────────────────────
  // Try the BILDSAGA section first, fall back to scanning the whole doc
  const pagesSection = raw.match(/##\s*📚\s*BILDSAGA[^\n]*\n([\s\S]*?)(?=##\s*📖\s*BAKSIDA|##\s*🎙️|$)/)
  const pagesText = pagesSection?.[1] ?? raw

  const pages: StoryPage[] = []

  /**
   * Multi-format page matcher — handles:
   *   New: **[Sid N]**   (with brackets)
   *   Old: **Sida N**    (no brackets, old agent format)
   *   Old: ### Sida N    (heading variant)
   */
  const pageRegex = /(?:\*\*\[Sid\s+(\d+)\]\*\*|\*\*Sida\s+(\d+)\*\*|###?\s+Sida\s+(\d+))\s*\n([\s\S]*?)(?=(?:\*\*\[Sid\s+\d+\]\*\*|\*\*Sida\s+\d+\*\*|###?\s+Sida\s+\d+)|##\s|$)/g
  let m: RegExpExecArray | null
  while ((m = pageRegex.exec(pagesText)) !== null) {
    const num = parseInt(m[1] ?? m[2] ?? m[3], 10)
    const block = m[4].trim()

    // Illustration: *[...]* or _[...]_ or *...*
    const illMatch = block.match(/^\*\[([^\]]+)\]\*|^_\[([^\]]+)\]_|^\*([^*\n]{10,})\*/)
    const illustrationDesc = (illMatch?.[1] ?? illMatch?.[2] ?? illMatch?.[3] ?? '').trim()

    // Text: > blockquote, or just the first non-italic paragraph
    const quoteLines = block.match(/^>\s*.+/gm) ?? []
    let text = quoteLines.map((l) => l.replace(/^>\s*/, '').trim()).join(' ')

    // Fallback: if no blockquote, use first plain paragraph (not italic, not heading)
    if (!text) {
      const plainLines = block.split('\n').filter(
        (l) => l.trim() && !l.startsWith('*') && !l.startsWith('_') && !l.startsWith('#') && !l.startsWith('>'),
      )
      text = plainLines[0]?.trim() ?? ''
    }

    if (num >= 1 && num <= 20 && text) {
      pages.push({ number: num, illustrationDesc, text })
    }
  }

  // Sort by page number
  pages.sort((a, b) => a.number - b.number)

  // ── Baksida ───────────────────────────────────────────────────────────────
  const backMatch = raw.match(/##\s*📖\s*BAKSIDA([\s\S]*?)(?=##\s*🎙️|$)/)
  const backText = backMatch?.[1] ?? ''

  const backIllMatch = backText.match(/\*\[([^\]]+)\]\*/)
  const backCoverIllDesc = backIllMatch?.[1]?.trim() ?? ''

  const sensMoralMatch = backText.match(/\*\*Sensmoralen:\*\*\s*(.+?)(?:\n|$)/)
  const sensmoralen = sensMoralMatch?.[1]?.trim() ?? ''

  const quoteMatch = backText.match(/\*\*"([^"]+)"\*\*\s*—\s*Nova/)
  const quote = quoteMatch?.[1]?.trim() ?? ''

  // ── MP3-manus ─────────────────────────────────────────────────────────────
  const mp3Match = raw.match(/##\s*🎙️\s*MP3-MANUS([\s\S]*)$/)
  const mp3Script = mp3Match?.[1]?.trim() ?? ''

  return {
    title,
    subtitle,
    coverIllustrationDesc: coverIllDesc,
    pages,
    backCoverIllustrationDesc: backCoverIllDesc,
    sensmoralen,
    quote,
    mp3Script,
    rawMarkdown: raw,
  }
}
