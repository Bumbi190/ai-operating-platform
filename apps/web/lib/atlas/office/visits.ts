/** Dedicated Office metadata boundary. Never general API-key authentication. */
import { createHash } from 'node:crypto'

export interface VisitOwner { ownerId: string; sessionId: string }
export type VisitRPC = 'office_visit_create' | 'office_visit_presence' | 'office_visit_revoke'
export interface VisitDependencies {
  owner(): Promise<VisitOwner | null>
  rpc(name: VisitRPC, args: Record<string, string | null>): Promise<unknown>
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie' }
const reply = (status: number, data: unknown) => Response.json(data, { status, headers: HEADERS })
class Rejected extends Error {
  readonly status: number
  constructor(status: number) { super('Office unavailable'); this.status = status }
}

function sameOrigin(request: Request) {
  const origin = new URL(request.url).origin
  if (!origin.startsWith('https://') || request.headers.get('origin') !== origin
      || (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')
      || request.headers.has('authorization') || request.headers.has('x-omnira-office-visit')) throw new Rejected(403)
}

function nativeDigest(request: Request): string {
  const secret = request.headers.get('x-omnira-office-visit') ?? ''
  if (request.headers.has('cookie') || request.headers.has('authorization') || request.headers.has('origin')
      || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Rejected(403)
  const bytes = Buffer.from(secret, 'base64url')
  if (bytes.length !== 32 || bytes.toString('base64url') !== secret) throw new Rejected(403)
  return createHash('sha256').update(bytes).digest('hex')
}

/** Flat string-only grammar rejects duplicate/escaped duplicate keys before JSON loses them. */
function flatJSON(text: string): Record<string, string> {
  const token = /"(?:[^"\\\u0000-\u001f]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*"/y
  const values: Record<string, string> = Object.create(null)
  let i = 0
  const ws = () => { while (i < text.length && /[ \t\r\n]/.test(text[i])) i++ }
  const string = () => {
    token.lastIndex = i
    const match = token.exec(text)
    if (!match) throw new Rejected(400)
    i = token.lastIndex
    return JSON.parse(match[0]) as string
  }
  ws(); if (text[i++] !== '{') throw new Rejected(400)
  ws()
  if (text[i] !== '}') while (true) {
    const key = string(); ws()
    if (Object.hasOwn(values, key) || text[i++] !== ':') throw new Rejected(400)
    ws(); values[key] = string(); ws()
    if (text[i] !== ',') break
    i++; ws()
  }
  if (text[i++] !== '}') throw new Rejected(400)
  ws(); if (i !== text.length) throw new Rejected(400)
  return values
}

async function body(request: Request, keys: string[]) {
  if (request.method !== 'POST' || request.headers.get('content-type') !== 'application/json'
      || request.headers.has('content-encoding') || new URL(request.url).search) throw new Rejected(400)
  const size = request.headers.get('content-length')
  if (size !== null && (!/^\d{1,4}$/.test(size) || Number(size) > 2048)) throw new Rejected(400)
  const reader = request.body?.getReader()
  if (!reader) throw new Rejected(400)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const read = async () => {
      const chunks: Uint8Array[] = []; let length = 0
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        length += chunk.value.byteLength
        if (length > 2048) throw new Rejected(400)
        chunks.push(chunk.value)
      }
      const value = flatJSON(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)))
      if (Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) throw new Rejected(400)
      if (!UUID.test(value.visitId ?? '')) throw new Rejected(400)
      return value
    }
    return await Promise.race([read(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Rejected(400)), 5000)
    })])
  } catch (error) {
    if (error instanceof Rejected) throw error
    throw new Rejected(400)
  } finally {
    clearTimeout(timer)
    void reader.cancel().catch(() => {})
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Rejected(403)
  return value as Record<string, unknown>
}

function metadata(value: unknown) {
  const row = record(value)
  for (const key of ['visitId', 'projectId', 'agentId']) if (typeof row[key] !== 'string' || !UUID.test(row[key] as string)) throw new Rejected(503)
  if (row.avatarId !== 'office-familje-pling') throw new Rejected(503)
  const times = ['createdAt', 'expiresAt', 'leaseUntil'].map(key => typeof row[key] === 'string' ? Date.parse(row[key] as string) : NaN)
  const [created, expiry, lease] = times, now = Date.now()
  if (!times.every(Number.isFinite) || created > now + 2000 || expiry <= now || lease <= now
      || expiry - created > 14400000 || expiry <= created || lease > expiry || lease > now + 32000) throw new Rejected(503)
  return { visitId: row.visitId as string, avatarId: row.avatarId, projectId: row.projectId as string, agentId: row.agentId as string,
    createdAt: row.createdAt as string, expiresAt: row.expiresAt as string, leaseUntil: row.leaseUntil as string }
}

function presence(value: unknown) {
  const row = record(value), visit = metadata(row)
  if (typeof row.generatedAt !== 'string' || !Number.isFinite(Date.parse(row.generatedAt))
      || Date.now() - Date.parse(row.generatedAt) >= 20000 || Date.parse(row.generatedAt) > Date.now() + 2000) throw new Rejected(503)
  const name = (key: string, max: number) => {
    if (typeof row[key] !== 'string') throw new Rejected(503)
    const text = (row[key] as string).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
    if (!text) throw new Rejected(503)
    return text
  }
  const project = { id: visit.projectId, slug: name('projectSlug', 64), name: name('projectName', 80) }
  return { ...visit, generatedAt: row.generatedAt,
    binding: { schemaVersion: 1, source: 'AUTHENTICATED_PROJECT_AGENT_MATCH_V036', verifiedIdentity: true,
      verifiedAt: row.generatedAt, character: 'pling', public3dBinding: 'none', project, agent: { id: visit.agentId, name: name('agentName', 80) } },
    snapshot: { schemaVersion: 2, dataSource: 'authorized_organisation_read', generatedAt: row.generatedAt,
      availability: { projects: true, agents: true, stepEvidence: false },
      projects: [{ id: project.id, slug: project.slug, agents: [{ id: visit.agentId, executionEvidence: 'unavailable', stepRequest: null }] }] } }
}

export function createVisitHandlers(deps: VisitDependencies) {
  const guarded = (fn: (request: Request) => Promise<Response>) => async (request: Request) => {
    try { return await fn(request) } catch (error) {
      return reply(error instanceof Rejected ? error.status : 503, { error: 'Office connection unavailable' })
    }
  }
  const owner = async () => { const user = await deps.owner(); if (!user || !UUID.test(user.ownerId) || !UUID.test(user.sessionId)) throw new Rejected(401); return user }
  return {
    create: guarded(async request => {
      sameOrigin(request)
      const user = await owner()
      const data = await body(request, ['visitId', 'secretDigest', 'projectId', 'agentId', 'avatarId'])
      if (!UUID.test(data.projectId) || !UUID.test(data.agentId) || !/^[0-9a-f]{64}$/.test(data.secretDigest)
          || data.avatarId !== 'office-familje-pling') throw new Rejected(400)
      const result = metadata(await deps.rpc('office_visit_create', { p_owner: user.ownerId, p_session: user.sessionId,
        p_visit: data.visitId, p_digest: data.secretDigest, p_project: data.projectId, p_agent: data.agentId, p_avatar: data.avatarId }))
      if (result.visitId !== data.visitId || result.projectId !== data.projectId || result.agentId !== data.agentId) throw new Rejected(503)
      return reply(200, result)
    }),
    presence: guarded(async request => {
      const digest = nativeDigest(request), data = await body(request, ['visitId'])
      const result = presence(await deps.rpc('office_visit_presence', { p_visit: data.visitId, p_digest: digest }))
      if (result.visitId !== data.visitId) throw new Rejected(503)
      return reply(200, result)
    }),
    revoke: guarded(async request => {
      const native = request.headers.has('x-omnira-office-visit')
      let user: VisitOwner | null = null, digest: string | null = null
      if (native) digest = nativeDigest(request)
      else { sameOrigin(request); user = await owner() }
      const data = await body(request, ['visitId'])
      const result = await deps.rpc('office_visit_revoke', { p_visit: data.visitId, p_digest: digest,
        p_owner: user?.ownerId ?? null, p_session: user?.sessionId ?? null })
      if (result !== true) throw new Rejected(403)
      return reply(200, { revoked: true })
    }),
  }
}
