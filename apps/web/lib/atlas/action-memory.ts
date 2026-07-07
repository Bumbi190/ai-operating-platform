/**
 * Atlas Actions — episodic action memory (Phase 1).
 *
 * recordAction() appends one row to the `atlas_actions` ledger the moment a real
 * action succeeds; buildActionMemory() injects the recent ledger into Atlas's
 * system prompt so it can answer "what did you just do?" from memory instead of
 * re-fetching domain tables (the Step-5 gap).
 *
 * Phase 1 records ONLY dream_delegation + workflow_run. Writes are non-blocking
 * and project-isolated; reads reuse the shipped isolation boundary
 * (scopeProjectFilter). Inserts/reads use an `as any` cast at the DB boundary so
 * a new table needs no database.types regeneration (matches existing code style).
 */

import { scopeProjectFilter } from './isolation'

type AnyDb = any

export type AtlasActionType = 'dream_delegation' | 'workflow_run'

export interface RecordActionInput {
  projectId?: string | null
  conversationId?: string | null
  actionType: AtlasActionType
  toolName: string
  targetKind?: string | null
  targetId?: string | null
  summary: string
  detail?: Record<string, unknown> | null
  status?: string | null
}

/**
 * Append one action to the ledger. Non-blocking by contract: never throws, so a
 * recording failure can never break the chat turn. Call as `void recordAction(...)`.
 */
export async function recordAction(db: AnyDb, input: RecordActionInput): Promise<void> {
  try {
    await (db.from('atlas_actions') as any).insert({
      project_id: input.projectId ?? null,
      conversation_id: input.conversationId ?? null,
      actor: 'Atlas',
      action_type: input.actionType,
      tool_name: input.toolName,
      target_kind: input.targetKind ?? null,
      target_id: input.targetId ?? null,
      summary: input.summary,
      detail: input.detail ?? null,
      status: input.status ?? null,
    })
  } catch {
    /* non-critical: never block the turn on action recording */
  }
}

interface ActionRow {
  action_type: string
  summary: string
  target_id: string | null
  status: string | null
  created_at: string
}

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const min = Math.round(ms / 60000)
  if (min < 1) return 'nyss'
  if (min < 60) return `${min} min sedan`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h sedan`
  return `${Math.round(h / 24)} d sedan`
}

/** Pure render of the [SENASTE ÅTGÄRDER] block from ledger rows. */
export function renderActionMemory(rows: ActionRow[]): string {
  if (!rows.length) return ''
  const lines = [
    `\n\n[SENASTE ÅTGÄRDER — vad du FAKTISKT har utfört (åtgärdslogg). Svara på "vad gjorde du / vilka delegerade du nyss" HÄRIFRÅN, med id:n — hämta INTE om i onödan. Re-fetcha bara om operatören frågar om AKTUELL status som kan ha ändrats sedan dess.]`,
  ]
  for (const r of rows) {
    const t = ageLabel(r.created_at)
    lines.push(`- [${r.action_type}] ${r.summary}${r.status ? ` · status=${r.status}` : ''}${t ? ` · ${t}` : ''}`)
  }
  return lines.join('\n')
}

export interface ActionMemory {
  /** The rendered [SENASTE ÅTGÄRDER] block (or '' when empty). */
  text: string
  /** True if the recent ledger contains a delegation — used to corroborate
   *  truthful recall so the delegation honesty guard doesn't fire on it. */
  hasRecentDelegation: boolean
}

const DELEGATION_TYPES = new Set(['dream_delegation', 'manager_delegation'])

/**
 * Read the recent action ledger (PROJECT-scoped, NOT conversation-scoped, so
 * "what did you do?" works across chats/sessions) and render it. Isolation via
 * scopeProjectFilter (empty allow-list → impossible id → zero rows). Also reports
 * whether a delegation is present so the route can suppress a false-claim
 * correction on truthful recall. Returns empty/false on no data or error.
 */
export async function buildActionMemory(
  db: AnyDb,
  allowedProjectIds: string[],
): Promise<ActionMemory> {
  try {
    const { data } = await (db.from('atlas_actions') as any)
      .select('action_type, summary, target_id, status, created_at')
      .in('project_id', scopeProjectFilter(allowedProjectIds))
      .order('created_at', { ascending: false })
      .limit(10)
    const rows = (data ?? []) as ActionRow[]
    const hasRecentDelegation = rows.some(r => DELEGATION_TYPES.has(r.action_type))
    return { text: renderActionMemory(rows), hasRecentDelegation }
  } catch {
    return { text: '', hasRecentDelegation: false }
  }
}
