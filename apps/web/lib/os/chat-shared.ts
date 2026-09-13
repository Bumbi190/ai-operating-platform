/**
 * Atlas Chat — the client-safe half of the contract.
 *
 * Vocabulary, the stream protocol and the pure transcript logic the vNext chat
 * surface runs on. `lib/os/chat.ts` is `server-only` because it reads the
 * database, so everything a component needs at runtime lives here.
 *
 * WHAT MUST NEVER MOVE HERE: database access, session handling, anything of
 * `/api/chat` itself. This file speaks the route's protocol; it does not own it.
 *
 * THE CHAT TRUTH MODEL. Each rule was read from `/api/chat`, the conversation
 * routes and production data (2026-09-13), not assumed:
 *
 *   HISTORY IS WHAT WAS PERSISTED, FILTERED AS BEFORE. The route saves the
 *   operator's message, every assistant text (including the text written beside
 *   a tool call), a `links` row for `present_links` and a `tool` row for every
 *   tool call. The page this replaces rehydrated user and assistant text and the
 *   `links` rows, and showed no `tool` row — the route documents those rows as
 *   cross-turn memory, not display. vNext keeps exactly that filter. Production:
 *   875 messages, 104 tool rows, 13 links rows.
 *
 *   THE API HISTORY IS TEXT ONLY, BUILT EXACTLY AS BEFORE. Persisted user and
 *   assistant text on load, the operator's text on send, the reply's full
 *   streamed text on `done`. No tool block ever enters it: a later static turn
 *   is sent `tools: []`, and a tool block in the history would be a protocol
 *   error. The request body is `buildChatRequestBody({ messages, conversation_id })`
 *   — the same helper, the same two fields.
 *
 *   THE STREAM CARRIES EIGHT EVENTS — `timing`, `text`, `tool_call`,
 *   `tool_result`, `links`, `navigate`, `done`, `error` — as `data: {json}` lines.
 *   The route ends every normal reply with `done` and every failure with
 *   `error`, so a stream that ends with neither did not finish. The route does
 *   not observe a client abort, so there is no stop control: closing the stream
 *   would not stop Atlas, and a button saying it did would lie.
 *
 *   A TOOL STEP SHOWS ITS STORED OUTCOME. A result carrying `error` failed — the
 *   route's own rule — `needs_confirmation` means nothing ran yet, and anything
 *   else finished. The page this replaces showed "klar" for all three.
 *
 *   EACH SEGMENT OF A REPLY IS SHOWN ONCE. The page this replaces re-rendered
 *   the whole accumulated reply after every tool call, so text written before a
 *   tool call appeared twice. The persisted rows never had that duplication.
 *   vNext shows each segment once and still hands the route the same history.
 *
 *   NO INVENTED STATE. Chat has no agent status, memory indicator or capability
 *   list to read, so it shows none — not in a greeting, a subtitle or a badge.
 *   The replaced page's routing badge is gone too: it called a static
 *   conversation "EXECUTIVE". The route's timing line is still logged, as before.
 */

import type { ResolvedLink } from '@/lib/nav/registry'

// ─────────────────────────────────────────────────────────────────────────────
// Rows and models
// ─────────────────────────────────────────────────────────────────────────────

/** Whether a section's source could be read. `error` is never rendered as empty. */
export type SectionState = 'ok' | 'error'

/** A `conversation_messages` row, as the conversation page reads it. */
export interface SavedMessage {
  role: string
  content: string | null
  tool_data: unknown
  created_at: string | null
}

/** The API history — text only, the shape `/api/chat` has always been sent. */
export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export type ToolEntry = { kind: 'tool'; tool: string; input: unknown; result: unknown; resolved: boolean }

export type TranscriptEntry =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | ToolEntry
  | { kind: 'links'; links: ResolvedLink[] }
  | { kind: 'notice'; tone: 'info' | 'error'; text: string }

export const RECENCY_GROUPS = ['Idag', 'Igår', 'Denna vecka', 'Denna månad', 'Äldre'] as const
export type RecencyGroup = (typeof RECENCY_GROUPS)[number]

export interface ChatConversationSummary {
  id: string
  title: string
  projectName: string | null
  updatedLabel: string | null
  href: string
}

export interface ChatHistoryGroup {
  label: RecencyGroup
  conversations: ChatConversationSummary[]
}

export interface ChatHomeModel {
  state: SectionState
  operatorName: string
  groups: ChatHistoryGroup[]
  total: number
  /** The list stopped at its cap, so `total` is the newest conversations, not all of them. */
  capped: boolean
  chatBase: string
}

export interface ChatConversationModel {
  id: string
  title: string
  projectName: string | null
  state: SectionState
  saved: SavedMessage[]
  chatBase: string
}

// ─────────────────────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persisted rows → what the transcript shows: user and assistant text, and the
 * assistant `links` rows as chips. The page this replaces used this exact filter.
 */
export function hydrateTranscript(saved: SavedMessage[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = []
  for (const m of saved) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    const td = m.tool_data as { kind?: string; links?: ResolvedLink[] } | null
    if (m.role === 'assistant' && td?.kind === 'links' && Array.isArray(td.links)) {
      entries.push({ kind: 'links', links: td.links })
      continue
    }
    if (!m.content) continue
    entries.push(m.role === 'user' ? { kind: 'user', text: m.content } : { kind: 'assistant', text: m.content })
  }
  return entries
}

/** Persisted rows → the text-only history the route receives. Unchanged from before. */
export function textHistory(saved: SavedMessage[]): HistoryMessage[] {
  return saved
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && !!m.content)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))
}

/** The question a launcher handed over through `?send=`. */
export function readSendParam(search: string): string | null {
  return new URLSearchParams(search).get('send')
}

// ─────────────────────────────────────────────────────────────────────────────
// The stream
// ─────────────────────────────────────────────────────────────────────────────

export interface StreamEvent {
  event: string
  [key: string]: unknown
}

/** Buffered stream text → its complete lines and the unfinished tail. */
export function splitStreamBuffer(buffer: string): { lines: string[]; rest: string } {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  return { lines, rest }
}

/** One `data: {json}` line → its event, or null for anything else. Malformed JSON is ignored, as before. */
export function parseStreamLine(line: string): StreamEvent | null {
  if (!line.startsWith('data: ')) return null
  try {
    const parsed = JSON.parse(line.slice(6)) as unknown
    return parsed && typeof parsed === 'object' && typeof (parsed as { event?: unknown }).event === 'string'
      ? (parsed as StreamEvent)
      : null
  } catch {
    return null
  }
}

export interface ReplyState {
  entries: TranscriptEntry[]
  /** Everything Atlas wrote in this reply, across tool calls — what the history receives on `done`. */
  fullText: string
  /** Whether the last entry is the reply's open text segment. */
  segmentOpen: boolean
}

export type ReplyEffect =
  | { type: 'none' }
  | { type: 'navigate'; href: string }
  | { type: 'done'; fullText: string }
  | { type: 'timing'; reqType: unknown; firstTokenMs: unknown; serverTotalMs: unknown }

const NONE: ReplyEffect = { type: 'none' }

export const ALREADY_HERE_NOTICE = 'Du är redan på den här vyn.'

export function startReply(entries: TranscriptEntry[]): ReplyState {
  return { entries, fullText: '', segmentOpen: false }
}

/**
 * One stream event → the next transcript, plus what the component must do.
 * Pure: the component performs the navigation, the history append and the
 * refresh, exactly where the page this replaces performed them.
 */
export function applyStreamEvent(
  state: ReplyState,
  event: StreamEvent,
  pathname: string,
): { state: ReplyState; effect: ReplyEffect } {
  switch (event.event) {
    case 'text': {
      const delta = typeof event.text === 'string' ? event.text : ''
      if (!delta) return { state, effect: NONE }
      const entries = [...state.entries]
      const last = entries[entries.length - 1]
      if (state.segmentOpen && last?.kind === 'assistant') {
        entries[entries.length - 1] = { kind: 'assistant', text: last.text + delta }
      } else {
        entries.push({ kind: 'assistant', text: delta })
      }
      return { state: { entries, fullText: state.fullText + delta, segmentOpen: true }, effect: NONE }
    }

    case 'tool_call': {
      const tool = typeof event.tool === 'string' ? event.tool : ''
      const entry: ToolEntry = { kind: 'tool', tool, input: event.input, result: undefined, resolved: false }
      return { state: { ...state, entries: [...state.entries, entry], segmentOpen: false }, effect: NONE }
    }

    case 'tool_result': {
      const entries = [...state.entries]
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i]
        if (entry.kind === 'tool' && entry.tool === event.tool && !entry.resolved) {
          entries[i] = { ...entry, result: event.result, resolved: true }
          return { state: { ...state, entries }, effect: NONE }
        }
      }
      return { state, effect: NONE }
    }

    case 'links': {
      if (!Array.isArray(event.links) || event.links.length === 0) return { state, effect: NONE }
      return {
        state: { ...state, entries: [...state.entries, { kind: 'links', links: event.links as ResolvedLink[] }], segmentOpen: false },
        effect: NONE,
      }
    }

    case 'navigate': {
      if (typeof event.href !== 'string' || !event.href) return { state, effect: NONE }
      const href = event.href
      if (href.split('?')[0] === pathname) {
        // Already here — a push would be a silent no-op, so the operator gets a
        // real affordance instead, as before.
        const link: ResolvedLink = {
          id: (event.id as ResolvedLink['id']) ?? 'atlas',
          label: typeof event.label === 'string' ? event.label : 'Öppna vyn',
          href,
        }
        return {
          state: {
            ...state,
            entries: [...state.entries, { kind: 'notice', tone: 'info', text: ALREADY_HERE_NOTICE }, { kind: 'links', links: [link] }],
            segmentOpen: false,
          },
          effect: NONE,
        }
      }
      return { state, effect: { type: 'navigate', href } }
    }

    case 'done':
      return { state: { ...state, segmentOpen: false }, effect: { type: 'done', fullText: state.fullText } }

    case 'timing':
      return {
        state,
        effect: { type: 'timing', reqType: event.reqType, firstTokenMs: event.firstTokenMs, serverTotalMs: event.serverTotalMs },
      }

    case 'error': {
      const text = typeof event.message === 'string' && event.message.trim() ? event.message : ATLAS_FAILED_NOTICE
      return {
        state: { ...state, entries: [...state.entries, { kind: 'notice', tone: 'error', text }], segmentOpen: false },
        effect: NONE,
      }
    }

    default:
      return { state, effect: NONE }
  }
}

/** A refused or failed response before the stream started, in the operator's words. */
export function failedResponseNotice(status: number, payload: unknown): string {
  if (status === 401) return SESSION_EXPIRED_NOTICE
  const said =
    payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
      ? (payload as { error: string }).error.trim()
      : ''
  return said || ATLAS_FAILED_NOTICE
}

/**
 * Whether to show that Atlas has not answered yet: while a reply is pending and
 * nothing of it is on screen to watch — no text streaming, no tool step running.
 */
export function awaitingAtlas(entries: TranscriptEntry[], pending: boolean): boolean {
  if (!pending) return false
  const last = entries[entries.length - 1]
  if (!last) return true
  if (last.kind === 'assistant') return false
  if (last.kind === 'tool' && !last.resolved) return false
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool steps
// ─────────────────────────────────────────────────────────────────────────────

/** One label per tool `/api/chat` offers — the names are the route's, the words are the surface's. */
export const TOOL_LABELS: Record<string, string> = {
  get_current_time: 'Kontrollerar tiden',
  list_workflows: 'Listar workflows',
  trigger_workflow: 'Kör workflow',
  get_run_status: 'Hämtar körningsstatus',
  run_media_step: 'Kör mediesteg',
  ask_manager: 'Frågar Manager Agent',
  delegate: 'Delegerar mål',
  get_dream_findings: 'Hämtar Dream-fynd',
  delegate_dream_finding: 'Delegerar Dream-fynd',
  resolve_dream_finding: 'Stänger Dream-fynd',
  present_links: 'Tar fram genvägar',
  navigate: 'Öppnar vy',
  get_records: 'Hämtar poster',
  validate_workflow: 'Validerar workflow',
  save_workflow: 'Sparar workflow',
}

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool
}

export type ToolOutcome = 'running' | 'done' | 'failed' | 'needs_confirmation' | 'no_result'

export const TOOL_OUTCOME_LABELS: Record<ToolOutcome, string> = {
  running: 'pågår',
  done: 'klar',
  failed: 'misslyckades',
  needs_confirmation: 'kräver bekräftelse',
  no_result: 'inget resultat',
}

/** A tool step's stored outcome. `error` in the result is a failure — the route's own rule. */
export function toolOutcome(entry: ToolEntry): ToolOutcome {
  if (!entry.resolved) return 'running'
  const r = entry.result
  if (r === undefined || r === null) return 'no_result'
  if (typeof r === 'object') {
    const o = r as Record<string, unknown>
    if (o.needs_confirmation === true) return 'needs_confirmation'
    if ('error' in o) return 'failed'
    if (o.ok === false) return 'failed'
  }
  return 'done'
}

/** The failure text a tool result carried, if any. */
export function toolError(entry: ToolEntry): string | null {
  const r = entry.result as { error?: unknown } | null | undefined
  return r && typeof r === 'object' && typeof r.error === 'string' && r.error.trim() ? r.error : null
}

/** A queued run, as `trigger_workflow` reports it. */
export function runSummary(entry: ToolEntry): string | null {
  if (entry.tool !== 'trigger_workflow' || toolOutcome(entry) !== 'done') return null
  const r = entry.result as { run_id?: unknown; status?: unknown }
  if (typeof r.run_id !== 'string') return null
  const status = typeof r.status === 'string' ? (r.status === 'queued' ? 'köad' : r.status) : 'status okänd'
  return `körning ${r.run_id.slice(0, 8)} · ${status}`
}

export const TOOL_PREVIEW_LIMIT = 600

/** The raw result for the disclosure — truncated, never expanded into more than it is. */
export function toolDataPreview(result: unknown): string | null {
  if (result === undefined) return null
  let json: string
  try {
    json = JSON.stringify(result, null, 2) ?? ''
  } catch {
    return null
  }
  if (!json) return null
  return json.length > TOOL_PREVIEW_LIMIT ? `${json.slice(0, TOOL_PREVIEW_LIMIT)}…` : json
}

// ─────────────────────────────────────────────────────────────────────────────
// History list
// ─────────────────────────────────────────────────────────────────────────────

/** "12" — or "50 senaste" when the list stopped at its cap and there may be more. */
export function historyCountLabel(total: number, capped: boolean): string {
  return capped ? `${total} senaste` : String(total)
}

// ─────────────────────────────────────────────────────────────────────────────
// Words
// ─────────────────────────────────────────────────────────────────────────────

/** The four starters the replaced page offered in an empty conversation — same words. */
export const CONVERSATION_STARTERS = [
  'Vad behöver min uppmärksamhet idag?',
  'Visa verksamheternas resultat',
  'Vad bör vi fokusera på härnäst?',
  'Granska väntande godkännanden',
] as const

export const HOME_LEDE = 'Ställ en fråga om dina verksamheter. Samtalen sparas här och går att fortsätta.'
export const LAUNCHER_PLACEHOLDER = 'Fråga Atlas…'
export const COMPOSER_PLACEHOLDER = 'Skriv till Atlas…'
export const COMPOSER_HINT = 'Enter skickar · Skift + Enter ger ny rad'
export const DISCLAIMER = 'AI kan göra misstag. Verifiera viktig information.'
export const INTRO_TITLE = 'Börja samtalet'
export const EMPTY_CONVERSATION = 'Skriv till Atlas nedan, eller börja med en av frågorna.'
export const AWAITING_ATLAS = 'Väntar på Atlas…'
export const EMPTY_HISTORY = 'Inga tidigare konversationer.'

export const ATLAS_FAILED_NOTICE = 'Atlas kunde inte svara.'
export const SESSION_EXPIRED_NOTICE = 'Sessionen har gått ut. Logga in igen.'
export const CONNECTION_FAILED_NOTICE = 'Anslutning misslyckades'
export const INTERRUPTED_NOTICE = 'Anslutningen bröts. Svaret kan vara ofullständigt.'
export const INCOMPLETE_NOTICE = 'Svaret avslutades inte som väntat och kan vara ofullständigt.'
export const CREATE_FAILED_NOTICE = 'Konversationen kunde inte skapas. Försök igen.'
export const DELETE_CONFIRM = 'Radera konversationen? Den går inte att återställa.'
export const DELETE_FAILED = 'Konversationen kunde inte raderas.'
export const HISTORY_UNREADABLE =
  'Konversationerna kunde inte läsas. Listan är inte tom — den gick inte att läsa.'
export const TRANSCRIPT_UNREADABLE =
  'Samtalet hittills kunde inte läsas, så det går inte att fortsätta härifrån just nu — Atlas skulle annars svara utan sammanhanget. Ladda om sidan för att försöka igen.'
