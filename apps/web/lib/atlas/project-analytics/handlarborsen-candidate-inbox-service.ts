import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import {
  HANDLARBORSEN_PROJECT_ID, HANDLARBORSEN_PROJECT_SLUG,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {
  candidateMemoryEnabled, loadCandidateMemory, loadOrganizationCandidateMemory,
  candidateDigest, type CandidateMemoryLoad,
} from './handlarborsen-competitor-memory-service'
import { officialHost } from './handlarborsen-competitor-discovery-core'

const TABLE = 'handlarborsen_candidate_inbox'
const RPC = 'handlarborsen_set_candidate_inbox_read_v1'
const MAX_NOTICES = 30
export type InboxAudience = 'owner' | 'collaborator'
export type InboxRow = Readonly<{
  host: string
  name: string
  officialUrl: string
  firstSeenAt: string
  createdAt: string
  readAt: string | null
  unread: boolean
}>
type InboxFailure = { status: 'disabled' | 'unauthorized' | 'forbidden' | 'unavailable' }
export type CompetitorInboxLoad = InboxFailure | {
  status: 'ok'
  notifications: readonly InboxRow[]
  unreadCount: number
}
export type CompetitorInboxReceipt = InboxFailure | { status: 'invalid' | 'not_found' }
  | { status: 'updated' | 'unchanged'; read: boolean }
export type InboxCommand = { host: string; read: boolean }

type Db = ReturnType<typeof createAdminClient>
type Auth = { ok: true; db: Db; recipientId: string } | {
  ok: false; status: InboxFailure['status']
}
interface Dependencies {
  env: NodeJS.ProcessEnv
  session: typeof createClient
  admin: typeof createAdminClient
  scope: typeof resolveOrganizationReadScope
  loadCandidates: (mode: InboxAudience) => Promise<CandidateMemoryLoad>
  now: () => Date
}
const live: Dependencies = {
  env: process.env, session: createClient, admin: createAdminClient,
  scope: resolveOrganizationReadScope,
  loadCandidates: mode => mode === 'owner' ? loadCandidateMemory() : loadOrganizationCandidateMemory(),
  now: () => new Date(),
}

export function competitorInboxEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HANDLARBORSEN_CANDIDATE_INBOX_ENABLED === 'true' && candidateMemoryEnabled(env)
}
export function safeInboxCommand(input: unknown): InboxCommand | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (Object.keys(value).length !== 2 || !Object.hasOwn(value, 'host')
    || !Object.hasOwn(value, 'read') || typeof value.host !== 'string'
    || officialHost('https://' + value.host + '/') !== value.host
    || typeof value.read !== 'boolean') return null
  return { host: value.host, read: value.read }
}

function safeDate(value: unknown, now: Date): string | null {
  if (typeof value !== 'string') return null
  const stamp = Date.parse(value)
  return Number.isFinite(stamp) && stamp <= now.getTime() + 300_000
    ? new Date(stamp).toISOString() : null
}

/** No notice can claim delivery to a recipient/candidate without valid stored evidence. */
export function parseInboxRows(
  raw: unknown, memory: CandidateMemoryLoad, recipientId: string, now: Date,
): CompetitorInboxLoad {
  if (memory.status !== 'ok' || !Array.isArray(raw) || raw.length > MAX_NOTICES
    || !Number.isFinite(now.getTime())) return { status: 'unavailable' }
  const candidates = new Map(memory.candidates.map(row => [row.host,row]))
  const seen = new Set<string>()
  const notifications: InboxRow[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') return { status: 'unavailable' }
    const record = row as Record<string, unknown>
    if (record.project_id !== HANDLARBORSEN_PROJECT_ID
      || record.recipient_id !== recipientId
      || typeof record.candidate_host !== 'string' || seen.has(record.candidate_host))
      return { status: 'unavailable' }
    const source = candidates.get(record.candidate_host)
    const createdAt = safeDate(record.created_at,now)
    const readAt = record.read_at === null ? null : safeDate(record.read_at,now)
    if (!source || !createdAt
      || (record.read_at !== null && (!readAt || readAt < createdAt))
      || record.evidence_digest !== candidateDigest(source))
      return { status: 'unavailable' }
    seen.add(record.candidate_host)
    notifications.push({
      host: source.host, name: source.name, officialUrl: source.officialUrl,
      firstSeenAt: source.firstSeenAt, createdAt, readAt,
      unread: readAt === null,
    })
  }
  notifications.sort((a,b) => b.createdAt.localeCompare(a.createdAt) || a.host.localeCompare(b.host))
  return {
    status: 'ok', notifications,
    unreadCount: notifications.filter(row => row.unread).length,
  }
}

/** Only the session identity & live organization membership can read or acknowledge. */
export function createCompetitorInboxService(deps: Dependencies = live) {
  async function authorize(mode: InboxAudience): Promise<Auth> {
    if (!competitorInboxEnabled(deps.env)) return { ok: false, status: 'disabled' }
    if (mode !== 'owner' && mode !== 'collaborator')
      return { ok: false, status: 'forbidden' }
    try {
      const session = await deps.session()
      const { data: { user }, error: authError } = await session.auth.getUser()
      if (authError || !user) return { ok: false, status: 'unauthorized' }
      const db = deps.admin()
      const scope = await deps.scope(session,db,user.id)
      if (!scope.role.active || scope.role.role !== mode
        || !scope.projectIds.includes(HANDLARBORSEN_PROJECT_ID))
        return { ok: false, status: 'forbidden' }
      const { data: project, error } = await db.from('projects')
        .select('id,slug,name,owner_id')
        .eq('id',HANDLARBORSEN_PROJECT_ID).eq('slug',HANDLARBORSEN_PROJECT_SLUG)
        .maybeSingle()
      if (error || !project || !isHandlarborsenProject(project)
        || (mode === 'owner' && project.owner_id !== user.id))
        return { ok: false, status: 'forbidden' }
      return { ok: true, db, recipientId: user.id }
    } catch { return { ok: false, status: 'unavailable' } }
  }

  return {
    async load(mode: InboxAudience): Promise<CompetitorInboxLoad> {
      const auth = await authorize(mode)
      if (!auth.ok) return { status: auth.status }
      try {
        const memory = await deps.loadCandidates(mode)
        if (memory.status !== 'ok') return { status: 'unavailable' }
        const { data, error } = await (auth.db as any).from(TABLE)
          .select('project_id,candidate_host,recipient_id,evidence_digest,created_at,read_at')
          .eq('project_id',HANDLARBORSEN_PROJECT_ID)
          .eq('recipient_id',auth.recipientId)
          .order('created_at',{ascending:false})
          .limit(MAX_NOTICES+1)
        if (error) return { status: 'unavailable' }
        return parseInboxRows(data,memory,auth.recipientId,deps.now())
      } catch { return { status: 'unavailable' } }
    },
    async setRead(mode: InboxAudience, payload: unknown): Promise<CompetitorInboxReceipt> {
      const cmd = safeInboxCommand(payload)
      if (!cmd) return { status: 'invalid' }
      const auth = await authorize(mode)
      if (!auth.ok) return { status: auth.status }
      try {
        const { data, error } = await (auth.db as any).rpc(RPC, {
          p_project_id: HANDLARBORSEN_PROJECT_ID, p_host: cmd.host,
          p_recipient_id: auth.recipientId, p_read: cmd.read,
        })
        if (error || !Array.isArray(data) || data.length !== 1)
          return { status: 'unavailable' }
        const row = data[0] as Record<string,unknown>
        if (row.outcome === 'forbidden') return { status: 'forbidden' }
        if (row.outcome === 'invalid') return { status: 'invalid' }
        if (row.outcome === 'not_found') return { status: 'not_found' }
        if (row.outcome !== 'updated' && row.outcome !== 'unchanged')
          return { status: 'unavailable' }
        if (cmd.read && !safeDate(row.current_read_at,deps.now()))
          return { status: 'unavailable' }
        if (!cmd.read && row.current_read_at !== null) return { status: 'unavailable' }
        return { status: row.outcome, read: cmd.read }
      } catch { return { status: 'unavailable' } }
    },
  }
}

export const loadCompetitorInbox = (audience: InboxAudience) =>
  createCompetitorInboxService().load(audience)
export const markCompetitorInboxRead = (audience: InboxAudience, payload: unknown) =>
  createCompetitorInboxService().setRead(audience,payload)
