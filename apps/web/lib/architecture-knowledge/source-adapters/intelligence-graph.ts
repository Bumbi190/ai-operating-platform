import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import { normalizeCanonicalText } from '../normalize'
import { sha256 } from '../hash'
import type { KnowledgeSection } from '../types'
import type { KnowledgeSourceAdapter, SourceAdapterResult } from './types'

const EXPECTED_CHAPTERS = 10
const EXPECTED_SECTIONS = 202

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function textFromXml(xml: string): string {
  const prepared = xml.replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n')
  return decodeXml([...prepared.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(match => match[1]).join(''))
}

function tableText(xml: string): string {
  const rows: string[] = []
  for (const row of xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
    const cells = [...row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)]
      .map(cell => normalizeCanonicalText(textFromXml(cell[0])))
      .filter(Boolean)
    if (cells.length) rows.push(`| ${cells.join(' | ')} |`)
  }
  return rows.join('\n')
}

interface GraphBlock { style: string | null; text: string; kind: 'paragraph' | 'table' }

function documentBlocks(xml: string): GraphBlock[] {
  const body = xml.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1]
  if (!body) throw new Error('Intelligence Graph DOCX has no readable document body')
  const blocks: GraphBlock[] = []
  for (const match of body.matchAll(/<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>/g)) {
    const xmlBlock = match[0]
    if (xmlBlock.startsWith('<w:tbl')) {
      const text = tableText(xmlBlock)
      if (text) blocks.push({ style: null, text, kind: 'table' })
      continue
    }
    const text = normalizeCanonicalText(textFromXml(xmlBlock))
    if (!text) continue
    const style = xmlBlock.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)?.[1] ?? null
    const list = /<w:numPr\b/.test(xmlBlock) && !/^[-•]/.test(text) ? `- ${text}` : text
    blocks.push({ style, text: list, kind: 'paragraph' })
  }
  return blocks
}

export interface IntelligenceGraphExtractionDiagnostics {
  chapterCount: number
  sectionCount: number
  sourceBlockCount: number
  consumedBlockCount: number
  sourceTextChecksum: string
  sectionTextChecksum: string
}

export async function extractIntelligenceGraphDocx(sourcePath: string): Promise<{
  chapters: Array<{ number: number; title: string }>
  sections: Array<{ chapterNumber: number; chapterTitle: string; sectionId: string; sectionTitle: string; text: string; ordinal: number }>
  diagnostics: IntelligenceGraphExtractionDiagnostics
}> {
  const zip = await JSZip.loadAsync(readFileSync(sourcePath))
  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) throw new Error('Intelligence Graph DOCX is missing word/document.xml')
  const allBlocks = documentBlocks(documentXml)
  const firstChapter = allBlocks.findIndex(block => block.style === 'Heading1' && /^(Kapitel|Chapter)\s+\d+/i.test(block.text))
  if (firstChapter < 0) throw new Error('Intelligence Graph DOCX has no numbered Heading1 chapter')
  let numberedChapters = 0
  let chapterEnd = allBlocks.length
  for (let index = firstChapter; index < allBlocks.length; index += 1) {
    const block = allBlocks[index]
    if (block.style !== 'Heading1') continue
    if (/^(Kapitel|Chapter)\s+\d+/i.test(block.text)) numberedChapters += 1
    else if (numberedChapters >= EXPECTED_CHAPTERS) { chapterEnd = index; break }
  }
  const blocks = allBlocks.slice(firstChapter, chapterEnd)
  const chapters: Array<{ number: number; title: string }> = []
  const sections: Array<{ chapterNumber: number; chapterTitle: string; sectionId: string; sectionTitle: string; text: string; ordinal: number }> = []
  let chapter: { number: number; title: string } | null = null
  let current: { sectionId: string; sectionTitle: string; body: string[] } | null = null
  let chapterPrefix: string[] = []
  let consumedBlockCount = 0

  const flush = () => {
    if (!chapter || !current) return
    const body = normalizeCanonicalText([...chapterPrefix, ...current.body].join('\n\n'))
    chapterPrefix = []
    const text = normalizeCanonicalText(`${current.sectionTitle}\n\n${body}`)
    sections.push({ ...current, chapterNumber: chapter.number, chapterTitle: chapter.title, text, ordinal: sections.length })
    current = null
  }

  for (const block of blocks) {
    consumedBlockCount += 1
    if (block.style === 'Heading1') {
      flush()
      const match = block.text.match(/^(?:Kapitel|Chapter)\s+(\d+)\s*[—–:-]?\s*(.*)$/i)
      if (!match) throw new Error(`Unexpected Heading1 inside chapter body: ${block.text}`)
      chapter = { number: Number(match[1]), title: match[2].trim() || block.text }
      chapters.push(chapter)
      chapterPrefix = []
      continue
    }
    if (!chapter) throw new Error('Content encountered before first graph chapter')
    if (block.style === 'Heading2') {
      const match = block.text.match(/^(\d+(?:\.\d+)+)\s+(.+)$/)
      if (!match) {
        if (current) current.body.push(block.text)
        else chapterPrefix.push(block.text)
        continue
      }
      flush()
      current = { sectionId: match[1], sectionTitle: block.text, body: [] }
      continue
    }
    if (current) current.body.push(block.text)
    else chapterPrefix.push(block.text)
  }
  flush()
  if (chapterPrefix.length) throw new Error('Trailing chapter text was not associated with a section')
  const ids = new Set(sections.map(section => section.sectionId))
  if (chapters.length !== EXPECTED_CHAPTERS) throw new Error(`Intelligence Graph: expected ${EXPECTED_CHAPTERS} chapters, received ${chapters.length}`)
  if (sections.length !== EXPECTED_SECTIONS) throw new Error(`Intelligence Graph: expected ${EXPECTED_SECTIONS} sections, received ${sections.length}`)
  if (ids.size !== sections.length) throw new Error('Intelligence Graph: duplicate section IDs')
  if (consumedBlockCount !== blocks.length) throw new Error('Intelligence Graph: dropped document blocks')
  return {
    chapters,
    sections,
    diagnostics: {
      chapterCount: chapters.length,
      sectionCount: sections.length,
      sourceBlockCount: blocks.length,
      consumedBlockCount,
      sourceTextChecksum: sha256(blocks.map(block => `${block.style ?? block.kind}:${block.text}`).join('\n')),
      sectionTextChecksum: sha256(sections.map(section => section.text).join('\n')),
    },
  }
}

export const intelligenceGraphAdapter: KnowledgeSourceAdapter = {
  id: 'intelligence-graph',
  async load(source, repoRoot): Promise<SourceAdapterResult> {
    const extraction = await extractIntelligenceGraphDocx(resolve(repoRoot, source.canonicalPath))
    const sections: KnowledgeSection[] = extraction.sections.map(section => ({
      knowledgeSourceId: source.knowledgeSourceId,
      bookId: source.bookId,
      title: source.title,
      version: source.version,
      chapterNumber: section.chapterNumber,
      chapterTitle: section.chapterTitle,
      canonicalStatus: source.canonicalStatus,
      implementationStatus: 'unknown_not_verified_in_this_package',
      canonicalPath: source.canonicalPath,
      sourceChecksum: source.sourceChecksum,
      effectiveAt: source.effectiveAt,
      scope: source.scope,
      classification: source.classification,
      sectionId: section.sectionId,
      sectionTitle: section.sectionTitle,
      anchor: `section-${section.sectionId.replace(/\./g, '-')}`,
      ordinal: section.ordinal,
      text: section.text,
      textChecksum: sha256(section.text),
    }))
    return {
      source,
      sections,
      diagnostics: {
        chapterCount: extraction.diagnostics.chapterCount,
        sectionCount: extraction.diagnostics.sectionCount,
        deterministicChecks: ['docx-source-checksum', 'chapter-count-10', 'section-count-202', 'all-blocks-consumed', 'unique-section-ids'],
      },
    }
  },
}
