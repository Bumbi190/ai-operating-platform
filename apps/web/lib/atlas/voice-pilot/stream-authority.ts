import { createAdminClient } from '@/lib/supabase/admin'
import { resolveExecutionStop } from '@/lib/governance/execution-stop'
import { resolveAtlasVoiceAccess } from './access'

/** Streaming-specific fail-closed observation; does not alter interactive pause policy. */
export function watchAtlasVoiceSession(userId: string, parent: AbortSignal) {
  const controller = new AbortController()
  let disposed = false, timer: ReturnType<typeof setTimeout> | undefined
  let cancelRead: (() => void) | undefined
  function dispose() {
    if (disposed) return
    disposed = true; clearTimeout(timer); parent.removeEventListener('abort', abort)
    cancelRead?.(); cancelRead = undefined
  }
  function abort() { controller.abort(); dispose() }
  function bounded(read: Promise<boolean>): Promise<boolean> {
    return new Promise(resolve => {
      let settled = false
      const finish = (valid: boolean) => {
        if (settled) return
        settled = true; clearTimeout(deadline); cancelRead = undefined; resolve(valid)
      }
      const deadline = setTimeout(() => finish(false), 5000)
      cancelRead = () => finish(false)
      void read.then(finish, () => finish(false))
    })
  }
  async function check(access: boolean) {
    if (disposed) return
    const valid = await bounded((async () => {
      const [decision, identity] = await Promise.all([
        resolveExecutionStop(createAdminClient(), { context: 'OPERATOR_INTERACTIVE' }),
        access ? resolveAtlasVoiceAccess({ expectedUserId: userId, strict: true }) : Promise.resolve({ userId }),
      ])
      // A known pause still permits assistance. An unresolved read does not
      // establish authority for an ongoing, potentially billable audio stream.
      return decision.resolution === 'RESOLVED' && decision.allowed
        && !(identity instanceof Response) && identity.userId === userId
    })())
    if (disposed) return
    if (!valid) { abort(); return }
    // Serial polling: no accumulation when an access service is slow.
    timer = setTimeout(() => { void check(true) }, 2000)
  }
  parent.addEventListener('abort', abort, { once: true })
  if (parent.aborted || !userId) abort()
  const ready = check(false)
  return { signal: controller.signal, ready, dispose }
}
