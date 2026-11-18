/** Browser approves a visit; the pinned foreground companion remains its only publisher. */
import type { OfficePairing, OfficeSelection, OfficeState } from './connection'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
type Fetcher = typeof fetch
type Data = Record<string, unknown>

async function request(fetcher: Fetcher, url: string, options: RequestInit, signal?: AbortSignal): Promise<Data> {
  const controller = new AbortController(), abort = () => controller.abort()
  if (signal?.aborted) abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 5000)
  try {
    const response = await fetcher(url, { ...options, signal: controller.signal, cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' })
    if (!response.ok) throw new Error('Office visit unavailable')
    const text = await response.text()
    if (text.length > 32768) throw new Error('Office response too large')
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Office response invalid')
    return value as Data
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
}

function local(fetcher: Fetcher, pair: OfficePairing, path: string, data?: unknown, signal?: AbortSignal) {
  return request(fetcher, `http://127.0.0.1:${pair.port}${path}`, {
    method: data === undefined ? 'GET' : 'POST', credentials: 'omit', keepalive: data !== undefined,
    headers: { Authorization: 'Bearer ' + pair.key, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  }, signal)
}

function status(data: Data) {
  if (data.protocol !== 2 || !Array.isArray(data.avatars) || data.avatars.length !== 1 || data.avatars[0] !== 'office-familje-pling'
      || typeof data.visitId !== 'string' || !UUID.test(data.visitId)
      || typeof data.secretDigest !== 'string' || !/^[0-9a-f]{64}$/.test(data.secretDigest)) throw new Error('Office visit unavailable')
  if (data.workflowProtocol !== undefined && data.workflowProtocol !== 1) throw new Error('Unsupported workflow protocol')
  if (data.activityProtocol !== undefined && data.activityProtocol !== 1) throw new Error('Unsupported activity protocol')
  return { visitId: data.visitId, secretDigest: data.secretDigest, avatars: data.avatars as string[], activityAvailable: data.activityProtocol === 1, workflowAvailable: data.workflowProtocol === 1 }
}

export async function probeOfficeVisitCapabilities(pair: OfficePairing, fetcher: Fetcher = fetch, signal?: AbortSignal) {
  const data = status(await local(fetcher, pair, '/status', undefined, signal))
  return { avatars: data.avatars, activityAvailable: data.activityAvailable, ...(data.workflowAvailable ? { workflowAvailable: true } : {}) }
}
export async function probeOfficeVisit(pair: OfficePairing, fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<string[]> {
  return status(await local(fetcher, pair, '/status', undefined, signal)).avatars
}

export class OfficeVisitConnection {
  private readonly pair: OfficePairing
  private readonly fetcher: Fetcher
  private readonly onState: (state: OfficeState) => void
  private controller: AbortController | null = null
  private visitId: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private generation = 0
  private confirmed = false
  private readonly activity: boolean
  private readonly workflow: boolean

  constructor(pair: OfficePairing, options: { fetcher?: Fetcher; onState?: (state: OfficeState) => void; activity?: boolean; workflow?: boolean } = {}) {
    if (!Number.isInteger(pair.port) || pair.port < 1024 || pair.port > 65535 || !/^[A-Za-z0-9_-]{43}$/.test(pair.key)) throw new Error('Invalid Office pairing')
    this.pair = { ...pair }; this.fetcher = options.fetcher ?? fetch; this.onState = options.onState ?? (() => {})
    this.activity = options.activity === true
    this.workflow = options.workflow === true
    if (this.activity && this.workflow) throw new Error('Choose one explicit Office read scope')
  }
  get canDetach() { return this.confirmed }
  private async revoke(id: string) {
    await Promise.allSettled([
      local(this.fetcher, this.pair, '/disconnect', { protocol: 2, visitId: id }),
      request(this.fetcher, '/api/atlas/office/visits/revoke', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitId: id }) }),
    ])
  }
  private clear() {
    this.controller?.abort(); this.controller = null
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }
  private acknowledged(data: Data, selection: OfficeSelection) {
    const view = data.presence as Data | null
    if (this.workflow) {
      const now = Date.now() / 1000
      return data.protocol === 2 && data.visitId === this.visitId && data.acknowledged === true
        && data.workflowProtocol === 1 && data.readScope === 'workflow_state_v1'
        && view?.schema === 'omnira.office.workflow-presence.v1' && view.scope === 'workflow_state_v1'
        && view.visit_id === this.visitId && view.avatar_id === selection.avatarId
        && view.project_id === selection.projectId && view.agent_id === selection.agentId
        && view.identity === 'verified' && view.data_state === 'fresh'
        && view.execution === 'not_verified' && view.work_verified === false
        && Number.isSafeInteger(view.revision) && (view.revision as number) > 0
        && typeof view.observed_at_unix === 'number' && Number.isFinite(view.observed_at_unix)
        && typeof view.expires_at_unix === 'number' && Number.isFinite(view.expires_at_unix)
        && view.observed_at_unix <= now && now < view.expires_at_unix
        && view.expires_at_unix <= view.observed_at_unix + 20
        && ['busy', 'idle', 'unknown'].includes(view.workflow_state as string)
        && ['complete', 'incomplete'].includes(view.coverage as string)
        && (view.workflow_state !== 'idle' || view.coverage === 'complete')
        && view.workflow_state_known === (view.workflow_state !== 'unknown')
        && view.workflow_busy === (view.workflow_state !== 'idle')
    }
    return data.protocol === 2 && data.visitId === this.visitId && data.acknowledged === true
      && view?.schema === (this.activity ? 'omnira.office.private-presence.v2' : 'omnira.office.private-presence.v1') && view.avatar_id === selection.avatarId
      && (!this.activity || (data.activityProtocol === 1 && data.readScope === 'step_activity_v1'))
      && view.identity === 'verified' && view.data_state === 'fresh' && view.execution === 'not_verified' && view.work_verified === false
      && typeof view.expires_at_unix === 'number' && Number.isFinite(view.expires_at_unix)
      && view.expires_at_unix > Date.now() / 1000 && view.expires_at_unix <= Date.now() / 1000 + 22
      && typeof data.expiresAt === 'string' && Date.parse(data.expiresAt) > Date.now()
      && typeof data.leaseUntil === 'string' && Date.parse(data.leaseUntil) > Date.now()
  }
  async start(selection: OfficeSelection): Promise<void> {
    if (selection.avatarId !== 'office-familje-pling' || !UUID.test(selection.projectId) || !UUID.test(selection.agentId) || this.controller || this.visitId) throw new Error('Choose one explicit Office identity')
    const generation = ++this.generation, controller = new AbortController()
    this.controller = controller; this.confirmed = false
    this.onState({ phase: 'connecting', message: 'Ansluter det valda kontorsbesöket…' })
    const current = () => generation === this.generation && !controller.signal.aborted
    let id: string | null = null
    try {
      const challenge = status(await local(this.fetcher, this.pair, '/status', undefined, controller.signal))
      if (!current()) return
      id = challenge.visitId; this.visitId = id
      if (this.workflow && !challenge.workflowAvailable) throw new Error('Compatible native workflow receiver required')
      if (this.activity && !challenge.activityAvailable) throw new Error('Compatible native activity receiver required')
      const scope = this.workflow ? { readScope: 'workflow_state_v1', nativeWorkflowProtocol: '1' } : this.activity ? { readScope: 'step_activity_v1', nativeActivityProtocol: '1' } : {}
      const grant = await request(this.fetcher, '/api/atlas/office/visits' + (this.workflow ? '/workflow' : this.activity ? '/activity' : ''), {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitId: id, secretDigest: challenge.secretDigest, ...selection, ...scope }),
      }, controller.signal)
      if (!current()) { await this.revoke(id); return }
      if (grant.visitId !== id || Object.entries(selection).some(([key, value]) => grant[key] !== value)) throw new Error('Visit scope mismatch')
      if (this.workflow ? grant.readScope !== 'workflow_state_v1' || grant.nativeWorkflowProtocol !== 1 : this.activity ? grant.readScope !== 'step_activity_v1' || grant.nativeActivityProtocol !== 1 : grant.readScope !== undefined) throw new Error('Visit read scope mismatch')
      const localScope = this.workflow ? { readScope: 'workflow_state_v1' } : this.activity ? { readScope: 'step_activity_v1' } : {}
      const attached = await local(this.fetcher, this.pair, '/attach', { protocol: 2, stage: 'prepare', visitId: id, ...selection, ...localScope }, controller.signal)
      if (!current()) return
      if (attached.protocol !== 2 || attached.visitId !== id) throw new Error('Visit attach unavailable')
      const deadline = Date.now() + 12000
      while (current()) {
        const data = await local(this.fetcher, this.pair, '/status', undefined, controller.signal)
        if (!current()) return
        if (this.acknowledged(data, selection)) {
          // Browser has actually read native acknowledgement. Only now permit
          // autonomous renewal, using the same fixed attach route and exact scope.
          const committed = await local(this.fetcher, this.pair, '/attach', { protocol: 2, stage: 'confirm', visitId: id, ...selection, ...localScope }, controller.signal)
          if (!current()) { await this.revoke(id); return }
          if (committed.protocol !== 2 || committed.committed !== true || committed.visitId !== id
              || (this.workflow && (committed.readScope !== 'workflow_state_v1' || committed.workflowProtocol !== 1))) throw new Error('Visit confirmation unavailable')
          this.confirmed = true
          this.onState({ phase: 'fresh', message: this.workflow ? 'Office är anslutet – du kan stänga sidan. Pling följer vald agents workflowstatus.' : 'Office är anslutet – du kan stänga sidan. Arbetsstatus okänd.' })
          this.timer = setTimeout(() => { void this.refresh(selection, controller, generation) }, 8000)
          return
        }
        if (Date.now() >= deadline) throw new Error('Native acknowledgement unavailable')
        await new Promise<void>(resolve => setTimeout(resolve, 250))
      }
    } catch {
      if (current() && this.confirmed) this.detach(true)
      else if (current()) await this.stop(true)
      else if (id) await this.revoke(id)
    }
  }
  private async refresh(selection: OfficeSelection, controller: AbortController, generation: number) {
    try {
      const data = await local(this.fetcher, this.pair, '/status', undefined, controller.signal)
      if (generation !== this.generation || controller.signal.aborted) return
      if (!this.acknowledged(data, selection)) { this.detach(true); return }
      this.timer = setTimeout(() => { void this.refresh(selection, controller, generation) }, 8000)
    } catch { if (generation === this.generation && !controller.signal.aborted) this.detach(true) }
  }
  /** Hide/unmount is safe only after the companion itself has accepted the frame. */
  detach(unavailable = false): void {
    if (!this.confirmed) { void this.stop(); return }
    ++this.generation; this.clear()
    this.onState({ phase: 'detached', message: unavailable
      ? 'Status kan inte läsas här. Office sköter besöket; Koppla från avslutar anslutningen.'
      : 'Office sköter anslutningen under besöket. Den avslutas när Office stängs.' })
  }
  async stop(failed = false): Promise<void> {
    ++this.generation; this.clear(); this.confirmed = false
    const id = this.visitId; this.visitId = null
    this.onState({ phase: failed ? 'unavailable' : 'stopped', message: failed ? 'Kontorsbesöket kunde inte verifieras · arbetsstatus okänd' : 'Frånkopplad · arbetsstatus okänd' })
    if (id) await this.revoke(id)
  }
}
