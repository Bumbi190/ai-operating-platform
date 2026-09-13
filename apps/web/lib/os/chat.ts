/**
 * Atlas Chat — the reads behind the vNext chat surface.
 *
 * WHAT THIS ANSWERS, and out of which source:
 *   which conversations the operator has   → `conversations`, by `user_id`
 *   which project a conversation carries   → `conversations.projects(name, slug)`
 *   what was said so far                   → `conversation_messages`, oldest first
 *
 * WHAT IT DOES NOT DO: write, stream or decide. Creating and deleting a
 * conversation go to the existing `/api/conversations` routes, and a message goes
 * to `/api/chat` — unchanged, from the client. This module only reads.
 *
 * OWNERSHIP. Both reads are the replaced pages' own, query for query. A
 * conversation is USER-owned: every conversation read carries `user_id` from the
 * session, never from the request. `conversation_messages` has neither user nor
 * project, so its safety rests entirely on the conversation being proven first —
 * the message read runs only after the owned conversation resolved, and a
 * foreign id is indistinguishable from a missing one. The chat home reads no
 * project list: the replaced page read one for a picker that never reached a
 * conversation, so there is nothing to scope.
 *
 * TIME. The list is grouped by calendar day in Stockholm time. The replaced list
 * counted 24-hour periods in the browser, so a conversation from late last night
 * could be filed under "Idag".
 *
 * A source that cannot be read says so. It is never rendered as an empty history.
 */

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deriveOperatorName } from '@/lib/os/briefing'
import { destinationBasePath } from '@/lib/nav/registry'
import { ATLAS_HOME_TIMEZONE } from '@/lib/atlas/utilities/time'
import {
  RECENCY_GROUPS,
  type ChatConversationModel,
  type ChatConversationSummary,
  type ChatHistoryGroup,
  type ChatHomeModel,
  type RecencyGroup,
  type SavedMessage,
} from '@/lib/os/chat-shared'

/** The history list's cap — the replaced page's own. */
export const CHAT_HISTORY_LIMIT = 50

const DAY_PARTS = new Intl.DateTimeFormat('en-CA', { timeZone: ATLAS_HOME_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: ATLAS_HOME_TIMEZONE, month: 'short', day: 'numeric' })
const TIME = new Intl.DateTimeFormat('sv-SE', { timeZone: ATLAS_HOME_TIMEZONE, hour: '2-digit', minute: '2-digit' })

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)

/** A PostgREST embed can arrive as an object or a one-element array. */
export function projectNameOf(raw: unknown): string | null {
  const project = Array.isArray(raw) ? raw[0] ?? null : raw ?? null
  return project && typeof project === 'object' ? text((project as { name?: unknown }).name) : null
}

function chatBase(): string {
  return destinationBasePath('chat') ?? '/chat'
}

/** The Stockholm calendar day of an instant, as a day number. */
function stockholmDay(d: Date): number {
  const parts = Object.fromEntries(DAY_PARTS.formatToParts(d).map((p) => [p.type, p.value]))
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000
}

function parse(iso: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** The replaced list's buckets, counted in Stockholm calendar days. An unreadable time is "Äldre", as before. */
export function recencyGroup(updatedAt: string | null, now: Date): RecencyGroup {
  const then = parse(updatedAt)
  if (!then) return 'Äldre'
  const days = stockholmDay(now) - stockholmDay(then)
  return days <= 0 ? 'Idag' : days === 1 ? 'Igår' : days < 7 ? 'Denna vecka' : days < 30 ? 'Denna månad' : 'Äldre'
}

/** "kl. 14:32" today and yesterday, "13 sep." before that. */
export function updatedLabel(updatedAt: string | null, group: RecencyGroup): string | null {
  const d = parse(updatedAt)
  if (!d) return null
  if (group === 'Idag') return `idag ${TIME.format(d)}`
  if (group === 'Igår') return `igår ${TIME.format(d)}`
  return DATE.format(d)
}

export interface AssembleChatHomeInput {
  operatorName: string
  ok: boolean
  rows: any[]
  now: Date
}

/** Rows → the grouped history, in the replaced page's bucket order. Pure. */
export function assembleChatHome(input: AssembleChatHomeInput): ChatHomeModel {
  const base = chatBase()
  if (!input.ok) {
    return { state: 'error', operatorName: input.operatorName, groups: [], total: 0, capped: false, chatBase: base }
  }
  const byGroup = new Map<ChatHistoryGroup['label'], ChatConversationSummary[]>()
  let total = 0
  for (const row of input.rows) {
    const id = text(row?.id)
    if (!id) continue
    const updatedAt = text(row?.updated_at)
    const label = recencyGroup(updatedAt, input.now)
    const list = byGroup.get(label) ?? []
    list.push({
      id,
      title: text(row?.title) ?? 'Namnlös konversation',
      projectName: projectNameOf(row?.projects),
      updatedLabel: updatedLabel(updatedAt, label),
      href: `${base}/${id}`,
    })
    byGroup.set(label, list)
    total += 1
  }
  const groups = RECENCY_GROUPS.filter((label) => byGroup.has(label)).map((label) => ({ label, conversations: byGroup.get(label)! }))
  return {
    state: 'ok',
    operatorName: input.operatorName,
    groups,
    total,
    capped: input.rows.length >= CHAT_HISTORY_LIMIT,
    chatBase: base,
  }
}

/** A read that never throws: an error is a state, not an exception. */
async function read(query: unknown): Promise<{ ok: boolean; data: any[] }> {
  try {
    const res = (await query) as { data?: unknown; error?: unknown } | null
    if (!res || res.error) return { ok: false, data: [] }
    return { ok: true, data: Array.isArray(res.data) ? res.data : [] }
  } catch {
    return { ok: false, data: [] }
  }
}

/** The chat home. Null without a session — a redirect, never an empty history. */
export async function loadChatHome(now: Date = new Date()): Promise<ChatHomeModel | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const db = createAdminClient()
  const conversations = await read(
    db.from('conversations')
      .select('id, title, project_id, updated_at, projects(name, slug)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(CHAT_HISTORY_LIMIT),
  )

  const operatorName = deriveOperatorName(
    (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined),
    user.email,
  )

  return assembleChatHome({ operatorName, ok: conversations.ok, rows: conversations.data, now })
}

/**
 * One conversation. Null without a session; 'not_found' for a conversation the
 * session does not own — the same answer as one that does not exist.
 */
export async function loadChatConversation(id: string): Promise<ChatConversationModel | 'not_found' | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const db = createAdminClient()
  const { data: conv } = await db
    .from('conversations')
    .select('id, title, project_id, projects(name, slug)')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!conv) return 'not_found'

  const messages = await read(
    db.from('conversation_messages')
      .select('role, content, tool_data, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true }),
  )

  const row = conv as { title?: unknown; projects?: unknown }
  return {
    id,
    title: text(row.title) ?? 'Konversation',
    projectName: projectNameOf(row.projects),
    state: messages.ok ? 'ok' : 'error',
    saved: messages.ok ? (messages.data as SavedMessage[]) : [],
    chatBase: chatBase(),
  }
}
