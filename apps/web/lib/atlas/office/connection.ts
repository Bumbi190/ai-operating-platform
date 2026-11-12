/** Read-only, opt-in browser transport. No sessions, keys or source DTOs are persisted. */
export interface OfficePairing { port: number; key: string }
export interface OfficeSelection { avatarId: string; projectId: string; agentId: string }
export interface OfficeState {
  phase: 'connecting' | 'fresh' | 'unavailable' | 'stopped'
  message: string
}
type Fetcher = typeof fetch
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const AVATAR = /^[a-z0-9][a-z0-9_-]{2,63}$/
const KEY = /^[A-Za-z0-9_-]{43}$/
const UNAVAILABLE = 'Anslutningen behöver uppdateras · arbetsstatus okänd'

function validPairing(value: OfficePairing): boolean {
  return Number.isInteger(value.port) && value.port >= 1024 && value.port <= 65535 && KEY.test(value.key)
}

/** Scrub even malformed or duplicated parameters before attempting any connection. */
export function consumeOfficePairing(
  location: Pick<Location, 'hash' | 'pathname' | 'search'>,
  history: Pick<History, 'state' | 'replaceState'>,
): OfficePairing | null {
  const hash = location.hash
  history.replaceState(history.state, '', location.pathname + location.search)
  const values = new URLSearchParams(hash.replace(/^#/, ''))
  if (values.size !== 2 || values.getAll('officePort').length !== 1 || values.getAll('officeKey').length !== 1) return null
  const port = values.get('officePort') ?? ''
  const pair = { port: Number(port), key: values.get('officeKey') ?? '' }
  return /^[1-9][0-9]{3,4}$/.test(port) && validPairing(pair) ? pair : null
}

async function request(
  fetcher: Fetcher, url: string, options: RequestInit, parent?: AbortSignal,
): Promise<Record<string, unknown>> {
  const abort = new AbortController()
  const cancel = () => abort.abort()
  if (parent?.aborted) abort.abort()
  parent?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(cancel, 5000)
  try {
    const response = await fetcher(url, {
      ...options, cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: abort.signal,
    })
    if (!response.ok) throw new Error('Office read unavailable')
    const text = await response.text()
    if (text.length > 280000) throw new Error('Office response too large')
    const result: unknown = JSON.parse(text)
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid Office response')
    return result as Record<string, unknown>
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', cancel)
  }
}

function localRequest(pair: OfficePairing, method: 'GET' | 'POST', data?: unknown): RequestInit {
  return {
    method, credentials: 'omit', headers: { Authorization: 'Bearer ' + pair.key, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid source record')
  return value as Record<string, unknown>
}

/** Reduce the authenticated portfolio to the ONE explicitly selected identity. */
function selectedFrame(binding: Record<string, unknown>, snapshot: Record<string, unknown>, selection: OfficeSelection) {
  const project = record(binding.project), agent = record(binding.agent), availability = record(snapshot.availability)
  if (project.id !== selection.projectId || agent.id !== selection.agentId) throw new Error('Identity mismatch')
  if (!Array.isArray(snapshot.projects) || snapshot.projects.length > 25) throw new Error('Invalid project list')
  const projects = snapshot.projects.map(record).filter(item => item.id === selection.projectId)
  if (projects.length !== 1 || projects[0].slug !== project.slug) throw new Error('Ambiguous project')
  if (!Array.isArray(projects[0].agents) || projects[0].agents.length > 30) throw new Error('Invalid agent list')
  const agents = projects[0].agents.map(record).filter(item => item.id === selection.agentId)
  if (agents.length !== 1) throw new Error('Ambiguous agent')
  const name = (value: unknown) => {
    if (typeof value !== 'string') throw new Error('Invalid registered name')
    return Array.from(value).slice(0, 80).join('')
  }
  const step = availability.stepEvidence === true && agents[0].stepRequest
    ? record(agents[0].stepRequest) : null
  return {
    binding: {
      schemaVersion: binding.schemaVersion, source: binding.source, verifiedIdentity: binding.verifiedIdentity,
      verifiedAt: binding.verifiedAt, character: binding.character, public3dBinding: binding.public3dBinding,
      project: { id: project.id, slug: project.slug, name: name(project.name) },
      agent: { id: agent.id, name: name(agent.name) },
    },
    snapshot: {
      schemaVersion: snapshot.schemaVersion, dataSource: snapshot.dataSource, generatedAt: snapshot.generatedAt,
      availability: { projects: availability.projects, agents: availability.agents, stepEvidence: availability.stepEvidence },
      projects: [{ id: project.id, slug: project.slug, agents: [{
        id: agent.id, executionEvidence: agents[0].executionEvidence,
        stepRequest: step ? { kind: step.kind, runId: step.runId, stepOrder: step.stepOrder, observedAt: step.observedAt } : null,
      }] }],
    },
  }
}

export async function probeOfficeRelay(pair: OfficePairing, fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<string[]> {
  if (!validPairing(pair)) throw new Error('Invalid pairing')
  const result = await request(fetcher, `http://127.0.0.1:${pair.port}/status`, localRequest(pair, 'GET'), signal)
  const avatars = result.avatars
  if (result.protocol !== 1 || !Array.isArray(avatars) || !avatars.length || avatars.length > 20
      || avatars.some(a => typeof a !== 'string' || !AVATAR.test(a)) || new Set(avatars).size !== avatars.length) {
    throw new Error('Invalid relay status')
  }
  return avatars as string[]
}

export class OfficeConnection {
  private readonly pair: OfficePairing
  private readonly fetcher: Fetcher
  private readonly onState: (state: OfficeState) => void
  private controller: AbortController | null = null
  private connectionId: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private expiryTimer: ReturnType<typeof setTimeout> | null = null
  private generation = 0

  constructor(pair: OfficePairing, options: { fetcher?: Fetcher; onState?: (state: OfficeState) => void } = {}) {
    if (!validPairing(pair)) throw new Error('Invalid pairing')
    this.pair = { ...pair }
    this.fetcher = options.fetcher ?? fetch
    this.onState = options.onState ?? (() => {})
  }

  private local(path: string, data: unknown, parent?: AbortSignal) {
    return request(this.fetcher, `http://127.0.0.1:${this.pair.port}${path}`, localRequest(this.pair, 'POST', data), parent)
  }

  private async disconnect(id: string | null) {
    if (!id) return
    try { await this.local('/disconnect', { protocol: 1, connectionId: id }) } catch { /* Source deadlines still expire in Office. */ }
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    if (this.expiryTimer !== null) clearTimeout(this.expiryTimer)
    this.expiryTimer = null
  }

  async start(selection: OfficeSelection): Promise<void> {
    if (!UUID.test(selection.projectId) || !UUID.test(selection.agentId) || !AVATAR.test(selection.avatarId)) {
      throw new Error('Choose an explicit registered project and agent')
    }
    if (this.controller !== null) throw new Error('Stop the existing connection first')
    const generation = ++this.generation
    const controller = new AbortController()
    this.controller = controller
    this.onState({ phase: 'connecting', message: 'Kontrollerar vald agent…' })
    try {
      const bound = await this.local('/bind', { protocol: 1, ...selection }, controller.signal)
      if (bound.protocol !== 1 || typeof bound.connectionId !== 'string' || !/^[A-Za-z0-9_-]{24}$/.test(bound.connectionId)) {
        throw new Error('Invalid binding response')
      }
      if (this.generation !== generation || controller.signal.aborted) {
        await this.disconnect(bound.connectionId)
        return
      }
      this.connectionId = bound.connectionId
      await this.refresh(selection, controller, generation)
    } catch {
      await this.fail(controller, generation)
    }
  }

  private async refresh(selection: OfficeSelection, controller: AbortController, generation: number): Promise<void> {
    if (controller.signal.aborted || generation !== this.generation) return
    try {
      // One shared snapshot per refresh, not one model call per decorative robot.
      const [binding, snapshot] = await Promise.all([
        request(this.fetcher, `/api/atlas/campus/agents/${selection.agentId}?projectId=${selection.projectId}`,
          { method: 'GET', credentials: 'same-origin' }, controller.signal),
        request(this.fetcher, '/api/atlas/campus/snapshot',
          { method: 'GET', credentials: 'same-origin' }, controller.signal),
      ])
      if (controller.signal.aborted || generation !== this.generation) return
      const result = await this.local('/snapshot', {
        protocol: 1, connectionId: this.connectionId, ...selectedFrame(binding, snapshot, selection),
      }, controller.signal)
      if (controller.signal.aborted || generation !== this.generation) return
      const presence = result.presence as Record<string, unknown> | undefined
      if (result.protocol !== 1 || !presence || presence.schema !== 'omnira.office.private-presence.v1'
          || presence.avatar_id !== selection.avatarId || presence.identity !== 'verified' || presence.data_state !== 'fresh'
          || presence.execution !== 'not_verified' || presence.work_verified !== false
          || typeof presence.expires_at_unix !== 'number' || !Number.isFinite(presence.expires_at_unix)
          || presence.expires_at_unix <= Date.now() / 1000 || presence.expires_at_unix > Date.now() / 1000 + 22) {
        throw new Error('Unverified presence')
      }
      this.clearTimer()
      this.expiryTimer = setTimeout(() => { void this.fail(controller, generation) },
        Math.max(0, presence.expires_at_unix * 1000 - Date.now()))
      this.onState({ phase: 'fresh', message: 'Identitet verifierad · arbetsstatus okänd' })
      this.timer = setTimeout(() => { void this.refresh(selection, controller, generation) }, 8000)
    } catch {
      await this.fail(controller, generation)
    }
  }

  private async fail(controller: AbortController, generation: number) {
    if (this.generation !== generation || controller.signal.aborted) return
    controller.abort()
    this.controller = null
    this.clearTimer()
    const id = this.connectionId
    this.connectionId = null
    this.onState({ phase: 'unavailable', message: UNAVAILABLE })
    await this.disconnect(id)
  }

  async stop(): Promise<void> {
    ++this.generation
    this.controller?.abort()
    this.controller = null
    this.clearTimer()
    const id = this.connectionId
    this.connectionId = null
    this.onState({ phase: 'stopped', message: 'Frånkopplad · arbetsstatus okänd' })
    await this.disconnect(id)
  }
}
