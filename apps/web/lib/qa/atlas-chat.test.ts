/**
 * vNext Chat — `/chat` and `/chat/[id]`.
 *
 * The presentation layer moved; the Chat backend did not. What these tests pin:
 *
 *   1 · history — what the transcript shows and what the route receives: the
 *       replaced page's own filters, text only
 *   2 · the stream — the route's eight events, each segment shown once, the
 *       same history as before, independent of how bytes arrive
 *   3 · waiting and failures — named for what they are
 *   4 · tool steps — the stored outcome, never "klar" for a failure
 *   5 · the route contract it speaks, as tripwires (the route is not changed)
 *   6 · the history list — calendar days, an honest cap, errors as states
 *   7 · reads — user ownership, messages only after the proof
 *   8 · rendering — nothing invented, no persisted tool row surfaced
 *   9 · wiring — the same endpoints, the same fields, no stop control
 *  10 · the generation branch and the hash-pinned legacy bodies
 *  11 · layout rules that are load-bearing
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import {
  ALREADY_HERE_NOTICE,
  ATLAS_FAILED_NOTICE,
  CONVERSATION_STARTERS,
  DISCLAIMER,
  EMPTY_HISTORY,
  HISTORY_UNREADABLE,
  SESSION_EXPIRED_NOTICE,
  TOOL_LABELS,
  TOOL_OUTCOME_LABELS,
  TOOL_PREVIEW_LIMIT,
  TRANSCRIPT_UNREADABLE,
  applyStreamEvent,
  awaitingAtlas,
  failedResponseNotice,
  historyCountLabel,
  hydrateTranscript,
  parseStreamLine,
  readSendParam,
  runSummary,
  splitStreamBuffer,
  startReply,
  textHistory,
  toolDataPreview,
  toolError,
  toolLabel,
  toolOutcome,
  type ChatConversationModel,
  type ChatHomeModel,
  type ReplyEffect,
  type SavedMessage,
  type ToolEntry,
  type TranscriptEntry,
} from '@/lib/os/chat-shared'
import { CHAT_HISTORY_LIMIT, assembleChatHome, projectNameOf, recencyGroup, updatedLabel } from '@/lib/os/chat'
import { deriveOperatorName } from '@/lib/os/briefing'
import { AtlasChatHome } from '@/components/platform/vnext/AtlasChatHome'
import { AtlasChatConversation, ChatEntry } from '@/components/platform/vnext/AtlasChatConversation'
import { EXECUTIVE_PROMPTS } from '@/app/(platform)/chat/ExecutiveAssistant'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} }),
  usePathname: () => '/chat/k-mine',
  useSearchParams: () => new URLSearchParams(),
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

// Under vitest, esbuild ignores tsconfig's `jsx: preserve` and compiles JSX with the
// classic runtime, so the rendered components need `React` in scope — the same
// arrangement the other vNext surface suites make.
;(globalThis as unknown as { React: typeof React }).React = React

const WEB = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB, p), 'utf8')
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()

const PATH = '/chat/k-mine'

/** One frame, byte-for-byte the way `/api/chat` writes it. */
const frame = (event: string, data: Record<string, unknown> = {}) => `data: ${JSON.stringify({ event, ...data })}\n\n`

const TABLE_REPLY = '| Kanal | Besök |\n|---|---|\n| Webb | 412 |'
const LINKS = [{ id: 'approvals' as const, label: 'Öppna Granskningar', href: '/approvals' }]

/** A conversation as production stores it: text, a tool row, a links row, an empty assistant row. */
const SAVED: SavedMessage[] = [
  { role: 'user', content: 'Hur har The Prompt gått idag?', tool_data: null, created_at: '2026-09-13T07:00:00Z' },
  { role: 'assistant', content: 'Jag hämtar siffrorna.', tool_data: null, created_at: '2026-09-13T07:00:01Z' },
  {
    role: 'tool',
    content: null,
    tool_data: { kind: 'tool_result', tool: 'get_records', input: { kind: 'traffic' }, result: { rows: ['SECRET-TOOL-ROW'] } },
    created_at: '2026-09-13T07:00:02Z',
  },
  { role: 'assistant', content: TABLE_REPLY, tool_data: null, created_at: '2026-09-13T07:00:03Z' },
  { role: 'assistant', content: null, tool_data: { kind: 'links', links: LINKS }, created_at: '2026-09-13T07:00:04Z' },
  { role: 'assistant', content: '', tool_data: null, created_at: '2026-09-13T07:00:05Z' },
]

/** A production-shaped reply: two model turns, two tool calls, links in between. */
const REPLY = [
  frame('timing', { reqType: 'atlas', contextMs: 180, firstTokenMs: 950 }),
  frame('text', { text: 'Jag hämtar Dream-fynden ' }),
  frame('text', { text: 'först.' }),
  frame('tool_call', { tool: 'get_dream_findings', input: { project: 'the-prompt' } }),
  frame('tool_result', { tool: 'get_dream_findings', result: { findings: [{ issue_id: 'critical_alerting_missing' }] } }),
  frame('text', { text: 'Tre fynd är öppna — ' }),
  frame('text', { text: 'här är genvägarna.' }),
  frame('tool_call', { tool: 'present_links', input: { destinations: ['approvals'] } }),
  frame('links', { links: LINKS }),
  frame('tool_result', { tool: 'present_links', result: { links: LINKS, note: 'Genvägar visade under svaret.' } }),
  frame('timing', { reqType: 'atlas', contextMs: 180, firstTokenMs: 950, serverTotalMs: 4200 }),
  frame('done'),
].join('')

/** Runs a stream the way the conversation does: bytes → decoder → lines → events. */
function play(stream: string, chunkBytes: number, before: TranscriptEntry[] = [{ kind: 'user', text: 'Hej' }]) {
  const bytes = new TextEncoder().encode(stream)
  const decoder = new TextDecoder()
  let state = startReply(before)
  const effects: ReplyEffect[] = []
  let buffer = ''
  for (let i = 0; i < bytes.length; i += chunkBytes) {
    buffer += decoder.decode(bytes.slice(i, i + chunkBytes), { stream: true })
    const { lines, rest } = splitStreamBuffer(buffer)
    buffer = rest
    for (const line of lines) {
      const event = parseStreamLine(line)
      if (!event) continue
      const step = applyStreamEvent(state, event, PATH)
      state = step.state
      if (step.effect.type !== 'none') effects.push(step.effect)
    }
  }
  return { state, effects }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · History
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas chat · history', () => {
  it('shows user and assistant text and the links rows — never a tool row or an empty row', () => {
    expect(hydrateTranscript(SAVED)).toEqual([
      { kind: 'user', text: 'Hur har The Prompt gått idag?' },
      { kind: 'assistant', text: 'Jag hämtar siffrorna.' },
      { kind: 'assistant', text: TABLE_REPLY },
      { kind: 'links', links: LINKS },
    ])
  })

  it('treats links data on a user row as text, and drops rows of any other role', () => {
    expect(hydrateTranscript([
      { role: 'user', content: 'Hej', tool_data: { kind: 'links', links: LINKS }, created_at: null },
      { role: 'system', content: 'SECRET-SYSTEM', tool_data: null, created_at: null },
    ])).toEqual([{ kind: 'user', text: 'Hej' }])
  })

  it('sends the route text only — the same history the replaced page sent', () => {
    const history = textHistory(SAVED)
    expect(history).toEqual([
      { role: 'user', content: 'Hur har The Prompt gått idag?' },
      { role: 'assistant', content: 'Jag hämtar siffrorna.' },
      { role: 'assistant', content: TABLE_REPLY },
    ])
    for (const m of history) {
      expect(Object.keys(m).sort()).toEqual(['content', 'role'])
      expect(typeof m.content).toBe('string')
    }
  })

  it('both filters are the replaced page’s own expressions', () => {
    const legacy = read('components/platform/ChatClient.tsx')
    expect(legacy).toMatch(/\.filter\(m => \(m\.role === 'user' \|\| m\.role === 'assistant'\) && !!m\.content\)/)
    expect(legacy).toMatch(/if \(m\.role === 'assistant' && td\?\.kind === 'links' && Array\.isArray\(td\.links\)\)/)
    expect(legacy).toMatch(/if \(!m\.content\) return null/)
  })

  it('reads a launcher’s question from ?send= exactly as before', () => {
    expect(readSendParam('?send=Vad%20beh%C3%B6ver%20min%20uppm%C3%A4rksamhet%20idag%3F')).toBe('Vad behöver min uppmärksamhet idag?')
    expect(readSendParam('')).toBeNull()
    expect(readSendParam('?send=')).toBe('')
    expect(read('components/platform/ChatClient.tsx')).toMatch(/new URLSearchParams\(window\.location\.search\)\.get\('send'\)/)
  })

  it('offers the replaced page’s four starters in an empty conversation, in order', () => {
    const legacy = read('components/platform/ChatClient.tsx')
    const start = legacy.indexOf('const SUGGESTED_PROMPTS = [')
    const block = legacy.slice(start, legacy.indexOf(']', start))
    expect([...block.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...CONVERSATION_STARTERS])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2 · The stream
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas chat · stream framing', () => {
  it('reads one data line into its event', () => {
    expect(parseStreamLine('data: {"event":"text","text":"Hej"}')).toEqual({ event: 'text', text: 'Hej' })
  })

  it('ignores blank lines, comments, malformed JSON and frames without an event', () => {
    for (const line of ['', ': keep-alive', 'event: text', 'data: {not json', 'data: {"text":"x"}', 'data: "text"', 'data: null']) {
      expect(parseStreamLine(line), line).toBeNull()
    }
  })

  it('keeps an unfinished line for the next chunk', () => {
    expect(splitStreamBuffer('data: {"event":"done"}\n\ndata: {"ev')).toEqual({
      lines: ['data: {"event":"done"}', ''],
      rest: 'data: {"ev',
    })
  })
})

describe('atlas chat · the stream', () => {
  it('a production-shaped reply shows each segment once, in the order it happened', () => {
    const { state } = play(REPLY, 64)
    expect(state.entries.map((e) => e.kind)).toEqual(['user', 'assistant', 'tool', 'assistant', 'tool', 'links'])
    expect(state.entries[1]).toEqual({ kind: 'assistant', text: 'Jag hämtar Dream-fynden först.' })
    expect(state.entries[3]).toEqual({ kind: 'assistant', text: 'Tre fynd är öppna — här är genvägarna.' })
    expect(state.entries[5]).toEqual({ kind: 'links', links: LINKS })
  })

  it('text written before a tool call is not repeated after it', () => {
    const { state } = play(REPLY, 64)
    const segments = state.entries.flatMap((e) => (e.kind === 'assistant' ? [e.text] : []))
    expect(segments.filter((t) => t.includes('Jag hämtar Dream-fynden'))).toHaveLength(1)
    // The replaced page rendered the whole accumulated reply again after the call.
    expect(segments[1]).not.toMatch(/^Jag hämtar/)
  })

  it('the history still receives the whole reply, exactly as the replaced page accumulated it', () => {
    const { effects } = play(REPLY, 64)
    expect(effects.filter((e) => e.type === 'done')).toEqual([
      { type: 'done', fullText: 'Jag hämtar Dream-fynden först.Tre fynd är öppna — här är genvägarna.' },
    ])
  })

  it('the result does not depend on how the bytes arrive — å, ä and — split across chunks included', () => {
    const whole = play(REPLY, 1 << 20)
    for (const size of [1, 2, 3, 5, 7, 11, 64, 257]) {
      const chunked = play(REPLY, size)
      expect(chunked.state, `chunk ${size}`).toEqual(whole.state)
      expect(chunked.effects, `chunk ${size}`).toEqual(whole.effects)
    }
  })

  it('each tool step resolves its own call, in the order the route runs them', () => {
    const { state } = play([
      frame('tool_call', { tool: 'get_records', input: { n: 1 } }),
      frame('tool_result', { tool: 'get_records', result: { first: true } }),
      frame('tool_call', { tool: 'get_records', input: { n: 2 } }),
      frame('tool_result', { tool: 'get_records', result: { second: true } }),
    ].join(''), 16)
    const tools = state.entries.filter((e): e is ToolEntry => e.kind === 'tool')
    expect(tools.map((t) => [t.input, t.result, t.resolved])).toEqual([
      [{ n: 1 }, { first: true }, true],
      [{ n: 2 }, { second: true }, true],
    ])
  })

  it('a result without an open call changes nothing', () => {
    expect(play(frame('tool_result', { tool: 'navigate', result: { ok: true } }), 8).state.entries).toEqual([{ kind: 'user', text: 'Hej' }])
  })

  it('an empty or malformed links event adds nothing', () => {
    const { state } = play(frame('links', { links: [] }) + frame('links', { links: 'nope' }) + frame('links'), 8)
    expect(state.entries).toEqual([{ kind: 'user', text: 'Hej' }])
  })

  it('navigate to another view is a navigation, not a transcript change', () => {
    const { state, effects } = play(frame('navigate', { href: '/approvals?project=the-prompt', label: 'Granskningar', id: 'approvals' }), 32)
    expect(effects).toEqual([{ type: 'navigate', href: '/approvals?project=the-prompt' }])
    expect(state.entries).toEqual([{ kind: 'user', text: 'Hej' }])
  })

  it('navigate to the view already open adds a notice and a link instead, as before', () => {
    const { state, effects } = play(frame('navigate', { href: `${PATH}?x=1`, label: 'Den här konversationen', id: 'chat' }), 32)
    expect(effects).toEqual([])
    expect(state.entries.slice(1)).toEqual([
      { kind: 'notice', tone: 'info', text: ALREADY_HERE_NOTICE },
      { kind: 'links', links: [{ id: 'chat', label: 'Den här konversationen', href: `${PATH}?x=1` }] },
    ])
    expect(play(frame('navigate', { href: PATH }), 32).state.entries[2]).toEqual({
      kind: 'links',
      links: [{ id: 'atlas', label: 'Öppna vyn', href: PATH }],
    })
    expect(read('components/platform/ChatClient.tsx')).toMatch(/content: 'Du är redan på den här vyn\.'/)
  })

  it('timing is logged, not shown — the effect carries the route’s numbers', () => {
    const { state, effects } = play(frame('timing', { reqType: 'static_conversation', contextMs: 0, firstTokenMs: 410, serverTotalMs: 900 }), 32)
    expect(effects).toEqual([{ type: 'timing', reqType: 'static_conversation', firstTokenMs: 410, serverTotalMs: 900 }])
    expect(state.entries).toEqual([{ kind: 'user', text: 'Hej' }])
  })

  it('an error shows the route’s own message, and a plain fallback when it has none', () => {
    const said = play(frame('text', { text: 'Del' }) + frame('error', { code: 'ATLAS_PROVIDER_OVERLOADED', message: 'Atlas är överbelastad just nu.' }), 32)
    expect(said.state.entries.slice(1)).toEqual([
      { kind: 'assistant', text: 'Del' },
      { kind: 'notice', tone: 'error', text: 'Atlas är överbelastad just nu.' },
    ])
    expect(said.effects.some((e) => e.type === 'done')).toBe(false)
    expect(play(frame('error', { code: 'X' }), 32).state.entries[1]).toEqual({ kind: 'notice', tone: 'error', text: ATLAS_FAILED_NOTICE })
  })

  it('after done, later text starts a new segment instead of extending the old one', () => {
    const { state } = play(frame('text', { text: 'Ett.' }) + frame('done') + frame('text', { text: 'Två.' }), 32)
    expect(state.entries.slice(1)).toEqual([{ kind: 'assistant', text: 'Ett.' }, { kind: 'assistant', text: 'Två.' }])
  })

  it('unknown events and empty text change nothing', () => {
    const { state, effects } = play(frame('status', { phase: 'thinking' }) + frame('text', { text: '' }) + frame('text'), 32)
    expect(state.entries).toEqual([{ kind: 'user', text: 'Hej' }])
    expect(effects).toEqual([])
  })

  it('an honesty-guard correction arrives as text, so it stays in the reply and in the history', () => {
    const correction = ' \n\n⚠️ Obs: jag har faktiskt inte kört något än — ingen körning startades.'
    const { state, effects } = play(frame('text', { text: 'Jag triggar workflowet.' }) + frame('text', { text: correction }) + frame('done'), 16)
    expect(state.entries[1]).toEqual({ kind: 'assistant', text: `Jag triggar workflowet.${correction}` })
    expect(effects).toEqual([{ type: 'done', fullText: `Jag triggar workflowet.${correction}` }])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Waiting and failures
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas chat · waiting and failures', () => {
  const tool = (resolved: boolean): ToolEntry => ({ kind: 'tool', tool: 'get_records', input: {}, result: resolved ? { rows: [] } : undefined, resolved })
  const user: TranscriptEntry = { kind: 'user', text: 'Hej' }

  it('shows that Atlas has not answered only while nothing of the reply is on screen', () => {
    expect(awaitingAtlas([], false)).toBe(false)
    expect(awaitingAtlas([user], false)).toBe(false)
    expect(awaitingAtlas([], true)).toBe(true)
    expect(awaitingAtlas([user], true)).toBe(true)
    expect(awaitingAtlas([user, { kind: 'assistant', text: 'Sva' }], true)).toBe(false)
    expect(awaitingAtlas([user, tool(false)], true)).toBe(false)
    expect(awaitingAtlas([user, tool(true)], true)).toBe(true)
    expect(awaitingAtlas([user, { kind: 'links', links: LINKS }], true)).toBe(true)
  })

  it('names a refused session as a session problem, not a connection problem', () => {
    expect(failedResponseNotice(401, { error: 'Unauthorized' })).toBe(SESSION_EXPIRED_NOTICE)
  })

  it('shows the route’s own message when it refuses before streaming', () => {
    expect(failedResponseNotice(503, { code: 'ATLAS_PROVIDER_NOT_CONFIGURED', error: 'Atlas är inte konfigurerad.' })).toBe('Atlas är inte konfigurerad.')
  })

  it('falls back to a plain sentence when a failure carries nothing readable', () => {
    expect(failedResponseNotice(500, null)).toBe(ATLAS_FAILED_NOTICE)
    expect(failedResponseNotice(502, { error: '   ' })).toBe(ATLAS_FAILED_NOTICE)
    expect(failedResponseNotice(500, '<html>')).toBe(ATLAS_FAILED_NOTICE)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Tool steps
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas chat · tool steps show their stored outcome', () => {
  const step = (tool: string, result: unknown, resolved = true): ToolEntry => ({ kind: 'tool', tool, input: {}, result, resolved })

  it('a call without a result yet is running', () => {
    expect(toolOutcome(step('get_records', undefined, false))).toBe('running')
  })

  it('a result carrying an error failed — where the replaced page said "klar"', () => {
    expect(toolOutcome(step('trigger_workflow', { error: 'Workflow hittades inte.' }))).toBe('failed')
    expect(toolError(step('trigger_workflow', { error: 'Workflow hittades inte.' }))).toBe('Workflow hittades inte.')
    expect(toolOutcome(step('navigate', { ok: false, error: 'Okänd destination' }))).toBe('failed')
    expect(toolOutcome(step('save_workflow', { ok: false, saved: false }))).toBe('failed')
  })

  it('a publish step awaiting confirmation did not run', () => {
    expect(toolOutcome(step('run_media_step', { needs_confirmation: true, step: 'publish_facebook', message: 'Bekräfta.' }))).toBe('needs_confirmation')
    expect(TOOL_OUTCOME_LABELS.needs_confirmation).toBe('kräver bekräftelse')
  })

  it('anything else finished, and an empty result is said as such', () => {
    expect(toolOutcome(step('get_dream_findings', { findings: [] }))).toBe('done')
    expect(toolOutcome(step('get_current_time', '2026-09-13T10:00:00+02:00'))).toBe('done')
    expect(toolOutcome(step('get_records', null))).toBe('no_result')
    expect(toolError(step('get_records', { rows: [] }))).toBeNull()
  })

  it('a queued run is named queued, with its id — and only a run that was queued', () => {
    expect(runSummary(step('trigger_workflow', { run_id: '0123456789abcdef', workflow_name: 'X', status: 'queued' }))).toBe('körning 01234567 · köad')
    expect(runSummary(step('trigger_workflow', { run_id: '0123456789abcdef', status: 'running' }))).toBe('körning 01234567 · running')
    expect(runSummary(step('trigger_workflow', { error: 'Nej', run_id: '0123456789abcdef' }))).toBeNull()
    expect(runSummary(step('trigger_workflow', undefined, false))).toBeNull()
    expect(runSummary(step('get_run_status', { run_id: '0123456789abcdef', status: 'queued' }))).toBeNull()
  })

  it('the raw data is truncated, never expanded', () => {
    const preview = toolDataPreview({ rows: 'x'.repeat(TOOL_PREVIEW_LIMIT * 2) })!
    expect(preview).toHaveLength(TOOL_PREVIEW_LIMIT + 1)
    expect(preview.endsWith('…')).toBe(true)
    expect(toolDataPreview({ a: 1 })).toBe('{\n  "a": 1\n}')
    expect(toolDataPreview(undefined)).toBeNull()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(toolDataPreview(circular)).toBeNull()
  })

  it('an unknown tool is shown by its own name rather than a guessed label', () => {
    expect(toolLabel('some_new_tool')).toBe('some_new_tool')
    expect(toolLabel('delegate_dream_finding')).toBe('Delegerar Dream-fynd')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5 · The route contract (tripwires — /api/chat is not changed by this surface)
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas chat · the route contract it speaks', () => {
  const ROUTE = read('app/api/chat/route.ts')

  it('frames every event as one data line followed by a blank line', () => {
    expect(ROUTE).toContain("encoder.encode(`data: ${JSON.stringify({ event, ...( typeof data === 'object' ? data : { data }) })}\\n\\n`)")
  })

  it('emits exactly the eight events this surface handles', () => {
    const events = [...new Set([...ROUTE.matchAll(/\bsend\('([a-z_]+)'/g)].map((m) => m[1]))].sort()
    expect(events).toEqual(['done', 'error', 'links', 'navigate', 'text', 'timing', 'tool_call', 'tool_result'])
  })

  it('does not observe a client abort — which is why there is no stop control', () => {
    expect(ROUTE).not.toMatch(/request\.signal/)
  })

  it('counts a result carrying `error` as a failure — the rule the tool steps follow', () => {
    expect(ROUTE).toMatch(/const errored = !!r && 'error' in r/)
  })

  it('has one label here for every tool it offers, and none for a tool it does not', () => {
    const start = ROUTE.indexOf('const TOOLS: Anthropic.Tool[] = [')
    expect(start).toBeGreaterThan(-1)
    const block = ROUTE.slice(start, ROUTE.indexOf('\n]\n', start))
    const names = [...block.matchAll(/\bname: '([a-z_]+)'/g)].map((m) => m[1])
    expect(names.length).toBeGreaterThanOrEqual(15)
    expect(Object.keys(TOOL_LABELS).sort()).toEqual([...names].sort())
  })

  it('titles a conversation on its first user message — why an unreadable history must not be continued', () => {
    expect(ROUTE).toMatch(/messages\.filter\(m => m\.role === 'user'\)\.length === 1/)
  })

  it('stores tool rows as memory the replaced page never displayed', () => {
    expect(ROUTE).toMatch(/Visas inte i UI \(klientens filter behåller bara user\/assistant\)/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6 · The history list
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas chat · the history list', () => {
  const NOW = new Date('2026-09-13T08:00:00Z') // 10:00 in Stockholm
  const row = (id: string, updated_at: string | null, extra: Record<string, unknown> = {}) => ({
    id, title: `Titel ${id}`, project_id: null, updated_at, projects: null, ...extra,
  })

  it('groups by Stockholm calendar day — 23:30 last night is yesterday, not today', () => {
    expect(recencyGroup('2026-09-12T21:30:00Z', NOW)).toBe('Igår')
    expect(recencyGroup('2026-09-12T22:30:00Z', NOW)).toBe('Idag')
    expect(recencyGroup('2026-09-13T07:59:00Z', NOW)).toBe('Idag')
    expect(recencyGroup('2026-09-14T07:59:00Z', NOW)).toBe('Idag')
    expect(recencyGroup('2026-09-07T10:00:00Z', NOW)).toBe('Denna vecka')
    expect(recencyGroup('2026-09-06T10:00:00Z', NOW)).toBe('Denna månad')
    expect(recencyGroup('2026-08-15T10:00:00Z', NOW)).toBe('Denna månad')
    expect(recencyGroup('2026-08-14T10:00:00Z', NOW)).toBe('Äldre')
    expect(recencyGroup(null, NOW)).toBe('Äldre')
    expect(recencyGroup('not a date', NOW)).toBe('Äldre')
  })

  it('keeps the replaced list’s bucket order and leaves out empty buckets', () => {
    const model = assembleChatHome({
      operatorName: 'André', ok: true, now: NOW,
      rows: [row('old', '2026-07-01T10:00:00Z'), row('today', '2026-09-13T07:00:00Z'), row('week', '2026-09-10T10:00:00Z')],
    })
    expect(model.groups.map((g) => [g.label, g.conversations.map((c) => c.id)])).toEqual([
      ['Idag', ['today']],
      ['Denna vecka', ['week']],
      ['Äldre', ['old']],
    ])
    expect(model).toMatchObject({ state: 'ok', total: 3, capped: false, chatBase: '/chat' })
    expect(model.groups[0].conversations[0].href).toBe('/chat/today')
  })

  it('labels today and yesterday with a Stockholm time, older conversations with a date', () => {
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', month: 'short', day: 'numeric' })
      .format(new Date('2026-09-10T10:00:00Z'))
    expect(updatedLabel('2026-09-13T07:05:00Z', 'Idag')).toBe('idag 09:05')
    expect(updatedLabel('2026-09-12T21:30:00Z', 'Igår')).toBe('igår 23:30')
    expect(updatedLabel('2026-09-10T10:00:00Z', 'Denna vecka')).toBe(date)
    expect(updatedLabel(null, 'Äldre')).toBeNull()
  })

  it('says the list stopped at its cap instead of presenting it as everything', () => {
    const rows = Array.from({ length: CHAT_HISTORY_LIMIT }, (_, i) => row(`c${i}`, '2026-09-13T07:00:00Z'))
    const model = assembleChatHome({ operatorName: 'André', ok: true, now: NOW, rows })
    expect(model.capped).toBe(true)
    expect(historyCountLabel(model.total, model.capped)).toBe(`${CHAT_HISTORY_LIMIT} senaste`)
    expect(historyCountLabel(3, false)).toBe('3')
  })

  it('an unreadable list is an error state, never an empty list', () => {
    expect(assembleChatHome({ operatorName: 'André', ok: false, now: NOW, rows: [] })).toMatchObject({
      state: 'error', total: 0, groups: [], capped: false,
    })
  })

  it('reads the project name from either embed shape, and names a missing title honestly', () => {
    expect(projectNameOf({ name: 'The Prompt', slug: 'the-prompt' })).toBe('The Prompt')
    expect(projectNameOf([{ name: 'The Prompt' }])).toBe('The Prompt')
    expect(projectNameOf(null)).toBeNull()
    expect(projectNameOf([])).toBeNull()
    const model = assembleChatHome({ operatorName: '', ok: true, now: NOW, rows: [row('x', null, { title: '' }), { title: 'no id' }] })
    expect(model.total).toBe(1)
    expect(model.groups[0].conversations[0]).toMatchObject({ title: 'Namnlös konversation', updatedLabel: null })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7 · Reads
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas chat · reads', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  type Call = { table: string; ops: string[] }
  const USER = { id: 'u-1', email: 'andre@example.com', user_metadata: {} as Record<string, unknown> }
  const NOW = new Date('2026-09-13T08:00:00Z')

  const TABLES = (): Record<string, any[]> => ({
    conversations: [
      { id: 'k-mine', user_id: 'u-1', title: 'Min fråga', project_id: null, updated_at: '2026-09-13T07:00:00Z', projects: null },
      { id: 'k-proj', user_id: 'u-1', title: 'Projektfråga', project_id: 'p-1', updated_at: '2026-09-10T07:00:00Z', projects: { name: 'The Prompt', slug: 'the-prompt' } },
      { id: 'k-theirs', user_id: 'u-2', title: 'SECRET-CONVERSATION', project_id: 'p-2', updated_at: '2026-09-13T07:30:00Z', projects: { name: 'SECRET-PROJECT', slug: 'secret' } },
    ],
    conversation_messages: [
      { conversation_id: 'k-mine', role: 'user', content: 'Hej', tool_data: null, created_at: '2026-09-13T07:00:00Z' },
      { conversation_id: 'k-theirs', role: 'user', content: 'CONFIDENTIAL', tool_data: null, created_at: '2026-09-13T07:30:00Z' },
    ],
    projects: [{ id: 'p-2', name: 'SECRET-PROJECT', slug: 'secret' }],
  })

  /** Chainable, thenable, and it applies the filters it records. */
  function fakeAdmin(tables: Record<string, any[]>, fail: (table: string) => boolean) {
    const calls: Call[] = []
    const from = (table: string) => {
      const call: Call = { table, ops: [] }
      calls.push(call)
      let rows = [...(tables[table] ?? [])]
      let single = false
      const q: any = {
        select: (cols: string) => { call.ops.push(`select:${cols}`); return q },
        eq: (col: string, value: unknown) => { call.ops.push(`eq:${col}=${value}`); rows = rows.filter((r) => r[col] === value); return q },
        order: (col: string, o?: { ascending?: boolean }) => { call.ops.push(`order:${col}:${o?.ascending === false ? 'desc' : 'asc'}`); return q },
        limit: (n: number) => { call.ops.push(`limit:${n}`); rows = rows.slice(0, n); return q },
        maybeSingle: () => { call.ops.push('maybeSingle'); single = true; return q },
        then: (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) =>
          Promise.resolve(fail(table) ? { data: null, error: { message: 'boom' } } : { data: single ? rows[0] ?? null : rows, error: null }).then(ok, err),
      }
      return q
    }
    return { db: { from }, calls }
  }

  const mount = async (o: { user?: typeof USER | null; fail?: (table: string) => boolean } = {}) => {
    const fake = fakeAdmin(TABLES(), o.fail ?? (() => false))
    const user = o.user === undefined ? USER : o.user
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => fake.db }))
    const mod = await import('@/lib/os/chat')
    return { mod, calls: fake.calls }
  }

  it('home · no session is null, and nothing is read', async () => {
    const { mod, calls } = await mount({ user: null })
    expect(await mod.loadChatHome(NOW)).toBeNull()
    expect(calls).toEqual([])
  })

  it('home · one read: the session’s conversations, newest first, capped as before', async () => {
    const { mod, calls } = await mount()
    await mod.loadChatHome(NOW)
    expect(calls).toEqual([{
      table: 'conversations',
      ops: ['select:id, title, project_id, updated_at, projects(name, slug)', 'eq:user_id=u-1', 'order:updated_at:desc', `limit:${CHAT_HISTORY_LIMIT}`],
    }])
  })

  it('home · another operator’s conversation is never listed', async () => {
    const { mod } = await mount()
    const model = await mod.loadChatHome(NOW)
    expect(model!.groups.flatMap((g) => g.conversations.map((c) => c.id)).sort()).toEqual(['k-mine', 'k-proj'])
    expect(JSON.stringify(model)).not.toMatch(/SECRET|k-theirs/)
  })

  it('home · the greeting uses the operator name the replaced page derived', async () => {
    const { mod } = await mount()
    expect((await mod.loadChatHome(NOW))!.operatorName).toBe(deriveOperatorName(undefined, USER.email))
  })

  it('home · a failed read is an error state, not an empty history', async () => {
    const { mod } = await mount({ fail: (t) => t === 'conversations' })
    expect(await mod.loadChatHome(NOW)).toMatchObject({ state: 'error', total: 0 })
  })

  it('conversation · no session is null, and nothing is read', async () => {
    const { mod, calls } = await mount({ user: null })
    expect(await mod.loadChatConversation('k-mine')).toBeNull()
    expect(calls).toEqual([])
  })

  it('conversation · a foreign id is not found, and its messages are never read', async () => {
    const { mod, calls } = await mount()
    expect(await mod.loadChatConversation('k-theirs')).toBe('not_found')
    expect(calls.map((c) => c.table)).toEqual(['conversations'])
    expect(calls[0].ops).toEqual(['select:id, title, project_id, projects(name, slug)', 'eq:id=k-theirs', 'eq:user_id=u-1', 'maybeSingle'])
  })

  it('conversation · a foreign id and a missing id are the same answer', async () => {
    const { mod } = await mount()
    expect(await mod.loadChatConversation('k-theirs')).toEqual(await mod.loadChatConversation('does-not-exist'))
  })

  it('conversation · an owned conversation reads its own messages, oldest first', async () => {
    const { mod, calls } = await mount()
    const proj = await mod.loadChatConversation('k-proj')
    expect(calls.map((c) => c.table)).toEqual(['conversations', 'conversation_messages'])
    expect(calls[1].ops).toEqual(['select:role, content, tool_data, created_at', 'eq:conversation_id=k-proj', 'order:created_at:asc'])
    expect(proj).toMatchObject({ id: 'k-proj', title: 'Projektfråga', projectName: 'The Prompt', state: 'ok', saved: [], chatBase: '/chat' })
    const mine = (await mod.loadChatConversation('k-mine')) as ChatConversationModel
    expect(mine.saved.map((m) => m.content)).toEqual(['Hej'])
    expect(JSON.stringify(mine)).not.toContain('CONFIDENTIAL')
  })

  it('conversation · unreadable messages are an error state, never an empty conversation', async () => {
    const { mod } = await mount({ fail: (t) => t === 'conversation_messages' })
    expect(await mod.loadChatConversation('k-mine')).toMatchObject({ state: 'error', saved: [] })
  })

  it('reads only — nothing in the loader can write', () => {
    expect(codeOnly(read('lib/os/chat.ts'))).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8 · Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas chat · rendering', () => {
  const NOW = new Date('2026-09-13T08:00:00Z')
  const conversation = (o: Partial<ChatConversationModel> = {}): ChatConversationModel => ({
    id: 'k-mine', title: 'Hur har The Prompt gått idag?', projectName: null, state: 'ok', saved: SAVED, chatBase: '/chat', ...o,
  })
  const renderConversation = (model: ChatConversationModel, asking = false) =>
    renderToStaticMarkup(React.createElement(AtlasChatConversation, { model, asking }))
  const renderHome = (model: ChatHomeModel) => renderToStaticMarkup(React.createElement(AtlasChatHome, { model }))
  const renderEntry = (entry: TranscriptEntry) =>
    renderToStaticMarkup(React.createElement('ol', null, React.createElement(ChatEntry, { entry })))
  const count = (html: string, needle: string) => html.split(needle).length - 1

  it('conversation · shows the stored exchange — text, a rendered table, the links — and no tool row', () => {
    const html = renderConversation(conversation())
    expect(count(html, 'data-kind="user"')).toBe(1)
    expect(count(html, 'data-kind="assistant"')).toBe(2)
    expect(count(html, 'data-kind="links"')).toBe(1)
    expect(count(html, 'data-kind="tool"')).toBe(0)
    expect(html).toContain('<table>')
    expect(html).toMatch(/<a[^>]*href="\/approvals"/)
    expect(html).not.toContain('SECRET-TOOL-ROW')
  })

  it('conversation · the header names the conversation and its project, and claims no capability', () => {
    const text = textOf(renderConversation(conversation({ projectName: 'The Prompt' })))
    expect(text).toContain('Hur har The Prompt gått idag?')
    expect(text).toContain('Alla konversationer')
    expect(text).toContain('Ny konversation')
    expect(renderConversation(conversation())).toMatch(/<a[^>]*href="\/chat"/)
    expect(text).not.toMatch(/Kör workflows|hantera AI-agenter/)
  })

  it('conversation · no greeting speaks for Atlas, and no routing badge, memory or agent state is shown', () => {
    const text = textOf(renderConversation(conversation({ saved: [] })))
    for (const forbidden of [/Executive Assistant/, /Jag har koll på/, /FAST PATH/, /EXECUTIVE/, /\bminne\b/i, /agentstatus/i, /\bonline\b/i]) {
      expect(text).not.toMatch(forbidden)
    }
  })

  it('conversation · an empty conversation offers the four starters', () => {
    const html = renderConversation(conversation({ saved: [] }))
    expect(html).toContain('data-intro')
    for (const starter of CONVERSATION_STARTERS) expect(textOf(html)).toContain(starter)
    expect(html).not.toMatch(/<ol[^>]*aria-label="Konversation"/)
  })

  it('conversation · a launcher’s question does not flash the empty state first', () => {
    expect(renderConversation(conversation({ saved: [] }), true)).not.toContain('data-intro')
  })

  it('conversation · the composer is live, with the disclaimer, and there is no stop control', () => {
    const html = renderConversation(conversation())
    expect(html).toMatch(/<textarea[^>]*id="atlas-chat-composer"/)
    expect(html).not.toMatch(/<textarea[^>]*disabled/)
    expect(textOf(html)).toContain(DISCLAIMER)
    expect(textOf(html)).not.toMatch(/Stoppa|Avbryt svaret/)
  })

  it('conversation · an unreadable history blocks continuing instead of looking empty', () => {
    const html = renderConversation(conversation({ state: 'error', saved: [] }))
    expect(textOf(html)).toContain(TRANSCRIPT_UNREADABLE)
    expect(html).toMatch(/<textarea[^>]*disabled/)
    expect(html).not.toContain('data-intro')
  })

  it('entries · a failed tool step says it failed, with the route’s reason', () => {
    const html = renderEntry({ kind: 'tool', tool: 'trigger_workflow', input: {}, result: { error: 'Workflow hittades inte.' }, resolved: true })
    expect(html).toContain('data-outcome="failed"')
    expect(textOf(html)).toContain('Kör workflow misslyckades')
    expect(textOf(html)).toContain('Workflow hittades inte.')
    expect(textOf(html)).not.toMatch(/\bklar\b/)
  })

  it('entries · a queued run is named queued, and a publish awaiting confirmation did not run', () => {
    const queued = textOf(renderEntry({ kind: 'tool', tool: 'trigger_workflow', input: {}, result: { run_id: '0123456789abcdef', status: 'queued' }, resolved: true }))
    expect(queued).toContain('Kör workflow klar')
    expect(queued).toContain('körning 01234567 · köad')
    const confirm = renderEntry({ kind: 'tool', tool: 'run_media_step', input: {}, result: { needs_confirmation: true, step: 'publish', message: 'Bekräfta.' }, resolved: true })
    expect(confirm).toContain('data-outcome="needs_confirmation"')
    expect(textOf(confirm)).toContain('kräver bekräftelse')
  })

  it('entries · a running step has no data to show yet', () => {
    const html = renderEntry({ kind: 'tool', tool: 'get_records', input: {}, result: undefined, resolved: false })
    expect(html).toContain('data-outcome="running"')
    expect(textOf(html)).toContain('pågår')
    expect(html).not.toContain('<details')
  })

  it('entries · links are links, errors are alerts, information is status', () => {
    expect(renderEntry({ kind: 'links', links: LINKS })).toMatch(/<a[^>]*href="\/approvals"/)
    const error = renderEntry({ kind: 'notice', tone: 'error', text: 'Atlas kunde inte svara.' })
    expect(error).toContain('role="alert"')
    expect(textOf(error)).toContain('Fel: Atlas kunde inte svara.')
    expect(renderEntry({ kind: 'notice', tone: 'info', text: ALREADY_HERE_NOTICE })).toContain('role="status"')
  })

  it('home · the question first, the replaced page’s six starters, then the operator’s own conversations', () => {
    const model = assembleChatHome({
      operatorName: 'André', ok: true, now: NOW,
      rows: [
        { id: 'k-1', title: 'Veckoplan', updated_at: '2026-09-13T07:05:00Z', projects: { name: 'The Prompt' } },
        { id: 'k-2', title: 'Flaskhalsar', updated_at: '2026-09-01T07:05:00Z', projects: null },
      ],
    })
    const html = renderHome(model)
    const text = textOf(html)
    expect(text).toContain('Vad kan jag hjälpa dig med, André?')
    expect(EXECUTIVE_PROMPTS).toHaveLength(6)
    for (const prompt of EXECUTIVE_PROMPTS) expect(text).toContain(prompt.label)
    expect(text.indexOf('Idag')).toBeLessThan(text.indexOf('Denna månad'))
    expect(html).toMatch(/<a[^>]*href="\/chat\/k-1"/)
    expect(text).toContain('The Prompt · idag 09:05')
    expect(html).toContain('aria-label="Radera Veckoplan"')
  })

  it('home · the count is honest about the cap', () => {
    const rows = Array.from({ length: CHAT_HISTORY_LIMIT }, (_, i) => ({ id: `c${i}`, title: `T${i}`, updated_at: '2026-09-13T07:00:00Z' }))
    expect(textOf(renderHome(assembleChatHome({ operatorName: 'André', ok: true, now: NOW, rows })))).toContain(`${CHAT_HISTORY_LIMIT} senaste`)
  })

  it('home · an unreadable list says so, and is never "no conversations"', () => {
    const text = textOf(renderHome(assembleChatHome({ operatorName: 'André', ok: false, now: NOW, rows: [] })))
    expect(text).toContain(HISTORY_UNREADABLE)
    expect(text).not.toContain(EMPTY_HISTORY)
  })

  it('home · an operator with no conversations is told exactly that', () => {
    const text = textOf(renderHome(assembleChatHome({ operatorName: 'André', ok: true, now: NOW, rows: [] })))
    expect(text).toContain(EMPTY_HISTORY)
    expect(text).not.toContain(HISTORY_UNREADABLE)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9 · Wiring to the unchanged endpoints
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas chat · wiring to the unchanged endpoints', () => {
  const CLIENT = codeOnly(read('components/platform/vnext/AtlasChatConversation.tsx'))
  const LAUNCHER = codeOnly(read('components/platform/vnext/AtlasChatLauncher.tsx'))
  const HISTORY = codeOnly(read('components/platform/vnext/AtlasChatHistory.tsx'))
  const SURFACE = [
    'components/platform/vnext/AtlasChatConversation.tsx',
    'components/platform/vnext/AtlasChatLauncher.tsx',
    'components/platform/vnext/AtlasChatHistory.tsx',
    'components/platform/vnext/AtlasChatHome.tsx',
    'lib/os/chat.ts',
    'lib/os/chat-shared.ts',
    'app/(platform)/chat/page.tsx',
    'app/(platform)/chat/[id]/page.tsx',
  ].map((p) => codeOnly(read(p)))

  it('posts to /api/chat through buildChatRequestBody, with the two fields the replaced page sent', () => {
    expect(CLIENT).toMatch(/fetch\('\/api\/chat', \{\s*method: 'POST',/)
    expect(CLIENT).toMatch(/body: JSON\.stringify\(buildChatRequestBody\(\{\s*messages: history\.current,\s*conversation_id: model\.id,\s*\}\)\)/)
    expect(CLIENT).not.toMatch(/\bvoice\b|\bmode\s*:/)
    expect(read('components/platform/ChatClient.tsx')).toMatch(/buildChatRequestBody\(\{\s*messages: apiMessages\.current,\s*conversation_id: conversationId,\s*\}\)/)
  })

  it('calls no endpoint but the conversation routes it always used', () => {
    const urls = new Set(SURFACE.flatMap((src) => [...src.matchAll(/fetch\(\s*([`'])([^`']+)\1/g)].map((m) => m[2])))
    expect([...urls].sort()).toEqual(['/api/chat', '/api/conversations', '/api/conversations/${id}'])
  })

  it('touches no voice, TTS, memory flag or tool execution path', () => {
    for (const src of SURFACE) {
      expect(src).not.toMatch(/\/api\/chat\/tts|speechSynthesis|getUserMedia|readMemoryFlags|executeTool|useAtlas\(/)
    }
  })

  it('has no stop control, because the route does not observe one', () => {
    expect(CLIENT).not.toMatch(/AbortController|\.abort\(|\bsignal\s*:/)
  })

  it('sends a launcher’s question once, into an empty conversation, after removing it from the address', () => {
    expect(CLIENT).toMatch(/if \(autoSent\.current\) return\s*autoSent\.current = true/)
    expect(CLIENT).toMatch(/model\.saved\.length === 0 && !blocked \? readSendParam\(window\.location\.search\) : null/)
    const replaceAt = CLIENT.indexOf("window.history.replaceState({}, '', window.location.pathname)")
    const sendAt = CLIENT.indexOf('void send(question)')
    expect(replaceAt).toBeGreaterThan(-1)
    expect(sendAt).toBeGreaterThan(replaceAt)
  })

  it('navigates, refreshes and logs where the replaced page did', () => {
    expect(CLIENT).toMatch(/if \(effect\.type === 'navigate'\) router\.push\(effect\.href\)/)
    expect(CLIENT).toMatch(/if \(history\.current\.filter\(\(m\) => m\.role === 'user'\)\.length === 1\) \{\s*router\.refresh\(\)/)
    expect(CLIENT).toMatch(/console\.log\(`\[chat-mode\] \$\{effect\.reqType\} · första token \$\{effect\.firstTokenMs\}ms · totalt \$\{effect\.serverTotalMs\}ms`\)/)
    expect(read('components/platform/ChatClient.tsx')).toMatch(/console\.log\(`\[chat-mode\] \$\{event\.reqType\} · första token \$\{event\.firstTokenMs\}ms · totalt \$\{event\.serverTotalMs\}ms`\)/)
  })

  it('appends the reply to the history only on done, as before', () => {
    const doneAt = CLIENT.indexOf("if (effect.type === 'done') {")
    const appendAt = CLIENT.indexOf("history.current = [...history.current, { role: 'assistant', content: effect.fullText }]")
    expect(doneAt).toBeGreaterThan(-1)
    expect(appendAt).toBeGreaterThan(doneAt)
    expect(CLIENT.split("role: 'assistant'").length - 1).toBe(1)
    // An empty reply (tool calls only) appends nothing, exactly as before.
    expect(CLIENT).toMatch(/if \(effect\.fullText\) \{\s*history\.current = \[\.\.\.history\.current, \{ role: 'assistant', content: effect\.fullText \}\]/)
  })

  it('a stream that ends without done or error is reported as unfinished, not as an answer', () => {
    expect(CLIENT).toMatch(/if \(event\.event === 'done' \|\| event\.event === 'error'\) settled = true/)
    expect(CLIENT).toMatch(/if \(!settled\) fail\(INCOMPLETE_NOTICE\)/)
  })

  it('new conversations are created exactly as before', () => {
    expect(CLIENT).toMatch(/fetch\('\/api\/conversations', \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application\/json' \},\s*body: JSON\.stringify\(\{\}\),/)
    expect(LAUNCHER).toMatch(/body: JSON\.stringify\(\{ project_id: null \}\)/)
    expect(LAUNCHER).toMatch(/router\.push\(`\$\{chatBase\}\/\$\{conv\.id\}\?send=\$\{encodeURIComponent\(prompt\)\}`\)/)
    expect(LAUNCHER).toMatch(/import \{ EXECUTIVE_PROMPTS \} from '@\/app\/\(platform\)\/chat\/ExecutiveAssistant'/)
  })

  it('a delete asks first, and refreshes only when the route said yes', () => {
    expect(HISTORY).toMatch(/fetch\(`\/api\/conversations\/\$\{id\}`, \{ method: 'DELETE' \}\)/)
    const refusedAt = HISTORY.indexOf('if (!res.ok)')
    const refreshAt = HISTORY.indexOf('router.refresh()')
    expect(refusedAt).toBeGreaterThan(-1)
    expect(refreshAt).toBeGreaterThan(refusedAt)
    expect(HISTORY).toMatch(/onClick=\{\(\) => \{ setFailed\(null\); setConfirming\(conversation\.id\) \}\}/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10 · Generation branch and the legacy bodies
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas chat · generation branch', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  type Loaded = React.ReactElement<{ children: React.ReactElement<Record<string, unknown>> }>
  const callChild = (el: Loaded) => {
    const child = el.props.children
    return (child.type as (p: unknown) => Promise<React.ReactElement<Record<string, unknown>>>)(child.props)
  }

  const withCookie = (cookie: string | null) =>
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: (n: string) => (cookie && n === 'omnira_ui' ? { value: cookie } : undefined) }),
    }))

  const loaders = (o: { home?: unknown; conversation?: unknown } = {}) => {
    const calls = { home: 0, conversation: [] as string[] }
    vi.doMock('@/lib/os/chat', () => ({
      loadChatHome: async () => { calls.home += 1; return o.home ?? null },
      loadChatConversation: async (id: string) => { calls.conversation.push(id); return o.conversation ?? null },
    }))
    vi.doMock('@/app/(platform)/chat/ChatLegacy', () => ({
      ChatLegacy: () => React.createElement('div', null, 'LEGACY CHAT'),
    }))
    vi.doMock('@/app/(platform)/chat/[id]/ConversationLegacy', () => ({
      ConversationLegacy: (p: { params: unknown }) =>
        React.createElement('div', { 'data-params-promise': String(p.params instanceof Promise) }, 'LEGACY CONVERSATION'),
    }))
    return calls
  }

  const props = (id: string, search: Record<string, string> = {}) => ({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(search),
  })

  it('/chat · legacy renders the moved body and never reaches the vNext loader', async () => {
    withCookie('legacy')
    const calls = loaders()
    const mod = await import('@/app/(platform)/chat/page')
    expect(renderToStaticMarkup((await mod.default()) as React.ReactElement)).toContain('LEGACY CHAT')
    expect(calls.home).toBe(0)
  })

  it('/chat · vNext is the default, and a missing session redirects to /login', async () => {
    withCookie(null)
    loaders()
    const mod = await import('@/app/(platform)/chat/page')
    const el = (await mod.default()) as Loaded
    expect(el.type).toBe(React.Suspense)
    await expect(callChild(el)).rejects.toThrow('REDIRECT:/login')
  })

  it('/chat · vNext renders the home from the loaded model', async () => {
    withCookie(null)
    const home = assembleChatHome({ operatorName: 'André', ok: true, now: new Date('2026-09-13T08:00:00Z'), rows: [] })
    loaders({ home })
    const mod = await import('@/app/(platform)/chat/page')
    expect((await callChild((await mod.default()) as Loaded)).props.model).toBe(home)
  })

  it('/chat/[id] · legacy renders the moved body with the route’s params, and never reaches the loader', async () => {
    withCookie('legacy')
    const calls = loaders()
    const mod = await import('@/app/(platform)/chat/[id]/page')
    const html = renderToStaticMarkup((await mod.default(props('k-mine'))) as React.ReactElement)
    expect(html).toContain('LEGACY CONVERSATION')
    expect(html).toContain('data-params-promise="true"')
    expect(calls.conversation).toEqual([])
  })

  it('/chat/[id] · a foreign or missing conversation is the same neutral redirect to /chat', async () => {
    withCookie(null)
    loaders({ conversation: 'not_found' })
    const mod = await import('@/app/(platform)/chat/[id]/page')
    await expect(callChild((await mod.default(props('k-theirs'))) as Loaded)).rejects.toThrow('REDIRECT:/chat')
  })

  it('/chat/[id] · a missing session redirects to /login', async () => {
    withCookie(null)
    loaders({ conversation: null })
    const mod = await import('@/app/(platform)/chat/[id]/page')
    await expect(callChild((await mod.default(props('k-mine'))) as Loaded)).rejects.toThrow('REDIRECT:/login')
  })

  it('/chat/[id] · an owned conversation renders, keyed by conversation, knowing a question is on its way', async () => {
    withCookie(null)
    const model: ChatConversationModel = { id: 'k-mine', title: 'T', projectName: null, state: 'ok', saved: [], chatBase: '/chat' }
    const calls = loaders({ conversation: model })
    const mod = await import('@/app/(platform)/chat/[id]/page')
    const el = (await mod.default(props('k-mine', { send: 'Vad behöver min uppmärksamhet idag?' }))) as Loaded
    expect(el.type).toBe(React.Suspense)
    expect(el.key).toBe('k-mine')
    expect(el.props.children.props).toEqual({ id: 'k-mine', asking: true })
    expect((await callChild(el)).props).toEqual({ model, asking: true })
    expect(calls.conversation).toEqual(['k-mine'])
  })

  it('/chat/[id] · a blank or absent ?send= is not a question', async () => {
    withCookie(null)
    loaders()
    const mod = await import('@/app/(platform)/chat/[id]/page')
    const searches: Record<string, string>[] = [{}, { send: '' }, { send: '   ' }]
    for (const search of searches) {
      const el = (await mod.default(props('k-mine', search))) as Loaded
      expect(el.props.children.props.asking).toBe(false)
    }
  })
})

describe('atlas chat · the legacy bodies are moved verbatim', () => {
  const FIRST_IMPORT = "import { createClient } from '@/lib/supabase/server'"
  const body = (rel: string) => {
    const s = read(rel)
    expect(s.indexOf(FIRST_IMPORT), rel).toBeGreaterThan(-1)
    return s.slice(s.indexOf(FIRST_IMPORT))
  }

  it('ChatLegacy is the previous /chat page, byte for byte after its doc comment', () => {
    expect(sha(body('app/(platform)/chat/ChatLegacy.tsx'))).toBe('05ae94a76e8a160633cb89205f43e8e414bfa7cda1dcd6c9ce21e84322b1a462')
  })

  it('ConversationLegacy is the previous /chat/[id] page, byte for byte after its doc comment', () => {
    expect(sha(body('app/(platform)/chat/[id]/ConversationLegacy.tsx'))).toBe('d4e5cef5cfb0be68e51bd396ecc888c841b313082cdd71d2ae4ae8100f3753e9')
  })

  it('the legacy bodies keep their guards and their components, and export by name', () => {
    const index = read('app/(platform)/chat/ChatLegacy.tsx')
    expect(index).toMatch(/\.eq\('user_id', user\.id\)/)
    expect(index).toMatch(/\.in\('id', scopeProjectFilter\(await getAllowedProjectIds\(db, user\.id\)\)\)/)
    expect(index).toMatch(/<ExecutiveAssistant projects=\{projects \?\? \[\]\} operatorName=\{operatorName\} \/>/)
    expect(index).toMatch(/<ConversationList conversations=\{conversations as any\} \/>/)
    expect(index).toMatch(/export async function ChatLegacy\(\)/)
    expect(index).not.toMatch(/export default|export const dynamic/)
    const conv = read('app/(platform)/chat/[id]/ConversationLegacy.tsx')
    expect(conv).toMatch(/if \(!conv\) redirect\('\/chat'\)/)
    expect(conv).toMatch(/<ChatClient\s/)
    expect(conv).toMatch(/export async function ConversationLegacy\(\{ params \}: Props\)/)
    expect(conv).not.toMatch(/export default|export const dynamic/)
  })

  it('the legacy client components are unchanged', () => {
    expect(sha(read('components/platform/ChatClient.tsx'))).toBe('aea6d87a7d8abf66f62f760a664710ac569aa0633a2c99d2d17f399a2d182a0a')
    expect(sha(read('app/(platform)/chat/ConversationList.tsx'))).toBe('d55634161de2dcd39120568bf8331d2ed6d579b57628f6971c11f5375aea1003')
    expect(sha(read('app/(platform)/chat/ExecutiveAssistant.tsx'))).toBe('ee8384ebb86bc395e94876856566ef848f5ba23d0c3a411975656728578b66e0')
  })

  it('both pages branch before they construct a loader', () => {
    const index = codeOnly(read('app/(platform)/chat/page.tsx'))
    expect(index).toMatch(/if \(!isVNext\(generation\)\) return <ChatLegacy \/>/)
    expect(index.indexOf('loadChatHome(')).toBeGreaterThan(index.indexOf('<ChatLegacy />'))
    const detail = codeOnly(read('app/(platform)/chat/[id]/page.tsx'))
    expect(detail).toMatch(/if \(!isVNext\(generation\)\) return <ConversationLegacy params=\{params\} \/>/)
    expect(detail.indexOf('loadChatConversation(')).toBeGreaterThan(detail.indexOf('<ConversationLegacy params={params} />'))
    expect(detail).toMatch(/if \(model === 'not_found'\) redirect\('\/chat'\)/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11 · Layout rules that are load-bearing
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas chat · layout rules that are load-bearing', () => {
  const CSS = read('components/platform/vnext/AtlasChat.module.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const block = (selector: string) => {
    const m = CSS.match(new RegExp(`(?:^|\\n)${selector.replace(/\./g, '\\.')} \\{([^}]*)\\}`))
    return m ? m[1] : ''
  }

  it('no ancestor of the dock is a scroll container, so it sticks to the shell’s scroller', () => {
    for (const selector of ['.field', '.conversation']) {
      const rules = block(selector)
      expect(rules.length, selector).toBeGreaterThan(0)
      expect(rules, selector).not.toMatch(/overflow(-x|-y)?:\s*(hidden|auto|scroll)/)
    }
    expect(block('.field')).toMatch(/overflow-x: clip;/)
    expect(block('.dock')).toMatch(/position: sticky;/)
  })

  it('the dock clears the fixed chrome — above the peek on narrow screens, measured against the canvas on desktop', () => {
    expect(block('.field')).toMatch(/container-type: inline-size;/)
    expect(CSS).toMatch(/@media \(max-width: 1023px\) \{[\s\S]*?\.dock \{ bottom: calc\(4\.5rem \+ env\(safe-area-inset-bottom, 0px\)\); \}/)
    expect(CSS).toMatch(/@media \(min-width: 1024px\) \{\s*\.dock \{[\s\S]*?100cqw/)
  })

  it('text never drops below the meta contrast floor', () => {
    const alphas = [...CSS.matchAll(/(?:^|[;{\s])color: rgb\(var\(--foreground-rgb\) \/ ([0-9.]+)\)/g)].map((m) => Number(m[1]))
    expect(alphas.length).toBeGreaterThan(10)
    for (const alpha of alphas) expect(alpha).toBeGreaterThanOrEqual(0.6)
  })
})
