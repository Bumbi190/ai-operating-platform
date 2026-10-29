import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('server-only', () => ({}))

import { inferNotionEntityScope, selectNotionEntityEvidence } from '@/lib/atlas/notion/entity-evidence'
import { handleAtlasNotionRead, persistedNotionToolResult } from '@/lib/atlas/notion/atlas-tools'
import type { NotionReadConfig, NotionReferenceEvidence } from '@/lib/atlas/notion/read-only'

const PROJECT = '10000000-0000-4000-8000-000000000001'
const PAGE = '20000000-0000-4000-8000-000000000001'
const TOKEN = 'test_fake_notion_access_token_not_a_secret'
const fakeDb = {} as Parameters<typeof handleAtlasNotionRead>[1]['db']
const QUERY = 'Vad står i Notion om Handlarbörsens pilot och Kareby Bil?'
const MARKDOWN = [
  '### EVExperten – svar 26 oktober 2026',
  'Bolagskoppling bekräftad. Semester och administratörsgodkännande återstår.',
  '## Pilotoutreach',
  '- EVExperten: konto behöver verifieras.',
  '- Kareby Bil: registreringslänk skickad.',
  '## Pilot och försäljning',
  '### Notis till Atlas – Kareby Bil, uppföljning 22 oktober 2026',
  '- Thomas Ivarsson frågade om registreringen.',
  '- Uppföljning skickad 22 oktober, ingen registrering bekräftad.',
  'Founding 5: andra bolag och äldre statistik.',
  '## Överlämning',
  'Ingen publicering är godkänd.',
].join('\n\n')
const EVIDENCE: NotionReferenceEvidence = {
  source: 'notion',
  projectId: PROJECT,
  pageId: PAGE,
  title: 'Handlarbörsen – status',
  url: 'https://www.notion.so/' + PAGE.replace(/-/g, ''),
  editedAt: '2026-10-28T07:08:00.000Z',
  contentHash: 'a'.repeat(64),
  markdown: MARKDOWN,
  actionAuthority: false,
}
const config = (): NotionReadConfig => ({
  mode: 'read',
  token: TOKEN,
  authorizedProjectIds: [PROJECT],
  approvedPages: [{ projectId: PROJECT, pageId: PAGE }],
})
const mocks = (evidence: NotionReferenceEvidence = EVIDENCE) => ({
  resolveProject: (async () => PROJECT) as never,
  loadConfig: () => config(),
  read: async () => evidence,
})

describe('Atlas Notion entity-evidence isolation', () => {
  it('recognizes one named company, excluding the encompassing project', () => {
    expect(inferNotionEntityScope(QUERY, 'Handlarbörsen'))
      .toEqual({ kind: 'named', subject: 'Kareby Bil' })
  })

  it('isolates Kareby Bil evidence from EVExperten corporate approval and holiday', () => {
    const result = selectNotionEntityEvidence(MARKDOWN, QUERY, 'Handlarbörsen')
    expect(result.kind).toBe('found')
    if (result.kind !== 'found') return
    expect(result.sourceEvidence).toBe('named_heading')
    expect(result.excerpt).toContain('Thomas Ivarsson')
    expect(result.excerpt).toContain('22 oktober')
    expect(result.excerpt).not.toMatch(/EVExperten|semester|bolagskoppling|administratörsgodkännande/i)
    expect(result.actionAuthority).toBe(false)
  })

  it('isolates EVExperten if the explicit question names EVExperten instead', () => {
    const result = selectNotionEntityEvidence(MARKDOWN, 'Vad står i Notion om EVExperten?', 'Handlarbörsen')
    expect(result.kind).toBe('found')
    if (result.kind !== 'found') return
    expect(result.excerpt).toContain('EVExperten')
    expect(result.excerpt).not.toMatch(/Kareby Bil|Thomas Ivarsson/)
  })

  it('requires a distinct named subject rather than treating a general pilot question as single-company evidence', () => {
    expect(inferNotionEntityScope('Vad står i Notion om Handlarbörsens pilot?', 'Handlarbörsen'))
      .toEqual({ kind: 'general' })
  })

  it('refuses an ambiguous question naming two companies rather than merging statuses', () => {
    expect(selectNotionEntityEvidence(MARKDOWN, 'Vad gäller för Kareby Bil och EVExperten?', 'Handlarbörsen'))
      .toEqual({ kind: 'ambiguous' })
  })

  it('refuses to borrow another company when the named company has no evidence', () => {
    const output = selectNotionEntityEvidence('### EVExperten\nBolagskoppling bekräftad.', QUERY, 'Handlarbörsen')
    expect(output).toEqual({ kind: 'not_found', subject: 'Kareby Bil' })
  })

  it('fallback only includes subject-anchored list bullets, never the whole mixed block', () => {
    const output = selectNotionEntityEvidence(
      '## Företag\n- EVExperten: väntar på behörighetskontroll.\n- Kareby Bil: fått registreringslänk.\n- Firman C: på semester.',
      QUERY, 'Handlarbörsen',
    )
    expect(output.kind).toBe('found')
    if (output.kind !== 'found') return
    expect(output.sourceEvidence).toBe('named_line')
    expect(output.excerpt).toContain('Kareby Bil')
    expect(output.excerpt).not.toMatch(/EVExperten|Firman C|semester/)
  })

  it('does not treat a mid-sentence reference to Kareby as that company status', () => {
    const source = '- EVExperten och Kareby Bil: EVExperten behöver administratörsgodkännande.'
    const result = selectNotionEntityEvidence(source, QUERY, 'Handlarbörsen')
    expect(result.kind).toBe('not_found')
  })

  it('never attaches an unrelated following paragraph to a company heading', () => {
    const source = '### Kareby Bil\nRegistreringslänk skickad.\n\nFounding 5: GP Motor, Autolane och Moberg Bil.\n\n## Ny fas'
    const result = selectNotionEntityEvidence(source, QUERY, 'Handlarbörsen')
    expect(result.kind).toBe('found')
    if (result.kind !== 'found') return
    expect(result.excerpt).toContain('Registreringslänk')
    expect(result.excerpt).not.toMatch(/GP Motor|Autolane|Moberg Bil/)
  })

  it('does not match prefixes such as Kareby Bilverkstad to Kareby Bil', () => {
    const result = selectNotionEntityEvidence('### Kareby Bilverkstad\nEtt annat företag.', QUERY, 'Handlarbörsen')
    expect(result.kind).toBe('not_found')
  })

  it('bounds even the longest subject-only response to 4800 characters', () => {
    const huge = '### Kareby Bil\n' + 'Kareby Bil: ingen verifierad registrering. '.repeat(500)
    const result = selectNotionEntityEvidence(huge, QUERY, 'Handlarbörsen')
    expect(result.kind).toBe('found')
    if (result.kind !== 'found') return
    expect(result.excerpt.length).toBeLessThanOrEqual(4_800)
  })

  it('uses the authenticated original question instead of a generic LLM tool paraphrase', async () => {
    const result = await handleAtlasNotionRead({
      project: 'Handlarbörsen', question: 'Vad är allmän pilotstatus?',
    }, {
      db: fakeDb, allowedProjectIds: [PROJECT], userQuestion: QUERY,
    }, mocks())
    expect(result).toMatchObject({
      ok: true,
      sourceScope: 'single_named_subject',
      sourceSubject: 'Kareby Bil',
      sourceEvidence: 'named_heading',
      sourceUntrusted: true,
      actionAuthority: false,
      url: EVIDENCE.url,
      sourceHash: EVIDENCE.contentHash,
    })
    expect(String(result.excerpt)).toContain('Thomas Ivarsson')
    expect(String(result.excerpt)).not.toMatch(/EVExperten|semester|administratörsgodkännande/)
  })

  it('rejects missing subject evidence rather than falling back to mixed general snippets', async () => {
    const otherOnly = { ...EVIDENCE, markdown: '### EVExperten\nBolagskoppling bekräftad.' }
    const result = await handleAtlasNotionRead({
      project: 'Handlarbörsen', question: 'Vad är allmän pilotstatus?',
    }, {
      db: fakeDb, allowedProjectIds: [PROJECT], userQuestion: QUERY,
    }, mocks(otherOnly))
    expect(result).toEqual({ ok: false, code: 'notion_subject_not_found' })
  })

  it('rejects multiple explicitly named subjects with no source excerpt', async () => {
    const result = await handleAtlasNotionRead({
      project: 'Handlarbörsen', question: 'Vad gäller för Kareby Bil och EVExperten?',
    }, {
      db: fakeDb, allowedProjectIds: [PROJECT],
      userQuestion: 'Vad gäller för Kareby Bil och EVExperten?',
    }, mocks())
    expect(result).toEqual({ ok: false, code: 'notion_subject_ambiguous' })
  })

  it('general project questions still support the original, sourced project preview', async () => {
    const result = await handleAtlasNotionRead({
      project: 'Handlarbörsen', question: 'Vad står i Notion om Handlarbörsens pilot?',
    }, {
      db: fakeDb, allowedProjectIds: [PROJECT],
      userQuestion: 'Vad står i Notion om Handlarbörsens pilot?',
    }, mocks())
    expect(result).toMatchObject({ ok: true, sourceScope: 'general_project', sourceSubject: null })
  })

  it('persists only citation metadata, never source body or model excerpts', async () => {
    const result = await handleAtlasNotionRead({
      project: 'Handlarbörsen', question: 'Varför frågade Thomas om registrering?',
    }, {
      db: fakeDb, allowedProjectIds: [PROJECT], userQuestion: QUERY,
    }, mocks())
    const persisted = persistedNotionToolResult(result)
    expect(JSON.stringify(persisted)).not.toMatch(/Thomas Ivarsson|EVExperten|semester|fick registreringslänk/i)
    expect(JSON.stringify(persisted)).not.toContain(TOKEN)
    expect(persisted).toMatchObject({ sourceHash: EVIDENCE.contentHash, actionAuthority: false })
  })

  it('preserves unambiguous standalone prose (legacy source contract)', () => {
    const source = '# Handlarbörsen\n\nPilotstart med Kareby Bil.'
    const result = selectNotionEntityEvidence(source, QUERY, 'Handlarbörsen')
    expect(result.kind).toBe('found')
    if (result.kind !== 'found') return
    expect(result.excerpt).toContain('Pilotstart med Kareby Bil.')
  })

  it('does not treat an ASCII project slug as another named company', () => {
    expect(inferNotionEntityScope(QUERY, 'handlarborsen'))
      .toEqual({ kind: 'named', subject: 'Kareby Bil' })
  })

  it('Notion-only chat turns cannot include live data, action memory or the Handlarbörsen dashboard facts', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/chat/route.ts'), 'utf8')
    expect(route).toMatch(/const activeTools\s*=\s*notionReadOnlyTurn\s*\?\s*ATLAS_NOTION_TOOLS/)
    expect(route).toContain("if (!notionReadOnlyTurn && liveResult.status === 'fulfilled')")
    expect(route).toContain("if (!notionReadOnlyTurn && actionResult.status === 'fulfilled')")
    expect(route).toContain("if (!notionReadOnlyTurn && toolResult.status === 'fulfilled')")
    expect(route).toContain('if (!notionReadOnlyTurn && isViewAwarenessEnabled())')
    expect(route).toContain('if (!notionReadOnlyTurn && !actionIntent && !navIntent && !resolutionIntent)')
    expect(route).toContain('if (!notionReadOnlyTurn && isContextShadowEnabled())')
  })
})
