/**
 * Omnira Trading — supervising more than one session.
 *
 * WHAT THIS IS FOR
 * ────────────────
 * A provider may expose several independently authenticated logical sessions. The
 * design's answer is one R1A runtime per session, and this is the small object
 * that keeps track of which is which.
 *
 * It is a REGISTRY WITH A LIFETIME, not a framework. It does not reconnect,
 * schedule, classify a close, mutate an endpoint, infer a capability, or execute
 * anything — every one of those is owned elsewhere and would be a second
 * authority if duplicated here.
 *
 * IT IS NOT WHERE LIFETIME SAFETY LIVES
 * ─────────────────────────────────────
 * An earlier draft had the supervisor observe each runtime and rotate the
 * protocol lifetime. That made safety depend on remembering to register — a
 * convention, not a structure. The binding moved into `integration.ts`, where it
 * is installed by the same call that builds the session, so an integration that
 * never touches a supervisor is still safe.
 *
 * What remains here is genuinely a registry: which roles exist, connect them in
 * a given sequence, tear them down in an orderly way. Nothing in this file is
 * load-bearing for correctness of protocol state.
 *
 * N IS ALLOWED, N IS NEVER REQUIRED. One role is a perfectly ordinary
 * configuration; nothing here creates a placeholder session to fill a shape.
 *
 * BOOTSTRAP IS COMPOSITION, NOT A FEATURE
 * ───────────────────────────────────────
 * There is deliberately no `bootstrap()` method and no notion of a discovery
 * phase. A caller that needs one connects a session, reads what it needs,
 * disposes it, and registers the next — which works because R1A treats an
 * operator-requested disconnect as EXPECTED and never reconnects after it.
 * Encoding a bootstrap phase here would bake one provider's topology into
 * provider-neutral code, and the sequencing it would buy is three lines at the
 * call site.
 */

import { asId, type Branded } from '../ids'
import type { ProviderError } from '../provider'
import type { ProviderSessionRuntime } from '../provider-runtime'

/**
 * Which logical session this is.
 *
 * OPAQUE AND UN-ENUMERATED, ON PURPOSE. A union of literal role names would
 * canonise one provider's session topology into code that is supposed to outlive
 * any particular provider. The integration layer names its own roles; nothing
 * below it — codec, session, runtime, reason codes, authority — ever sees one.
 */
export type SessionRole = Branded<string, 'SessionRole'>

/** Throws on a malformed name — roles are literals in code, never external data. */
export function sessionRole(name: string): SessionRole {
  return asId<'SessionRole'>(name)
}

export interface SupervisedSession {
  readonly role: SessionRole
  readonly runtime: ProviderSessionRuntime
  /**
   * Release the PROTOCOL-layer resources this role owns — its session, its
   * fan-out subscription. Idempotent.
   *
   * It does not have to stop the link: the supervisor disconnects the runtime
   * first and then calls this, so an implementation may assume the transport is
   * already closed. Leaving that to the caller instead would make an easily
   * forgotten obligation out of "the heartbeat timer is still running".
   */
  dispose(): void
}

export interface SessionSupervisor {
  readonly roles: readonly SessionRole[]
  /** Register a role. Refuses a duplicate rather than replacing it. */
  register(session: SupervisedSession): { readonly ok: true } | { readonly ok: false; readonly refusal: 'DUPLICATE_ROLE' }
  get(role: SessionRole): SupervisedSession | null
  /** Connect the given roles in sequence, stopping at the first failure. */
  connectSequence(sequence: readonly SessionRole[]): Promise<ConnectSequenceOutcome>
  /** Disconnect and release one role. */
  release(role: SessionRole): Promise<void>
  /** Disconnect and release every role. Registration order carries no meaning. */
  disposeAll(): Promise<void>
}

export type ConnectSequenceOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly role: SessionRole
      /** Absent when the role was never registered. */
      readonly error: ProviderError | null
    }

export function createSessionSupervisor(): SessionSupervisor {
  const supervised = new Map<SessionRole, SupervisedSession>()

  return {
    get roles() { return [...supervised.keys()] },

    register(session) {
      /*
       * Refused, not replaced. Replacing would orphan the previous runtime — it
       * would keep its transport and its timers with nobody holding a reference
       * to dispose it.
       */
      if (supervised.has(session.role)) return { ok: false, refusal: 'DUPLICATE_ROLE' }
      supervised.set(session.role, session)
      return { ok: true }
    },

    get(role) { return supervised.get(role) ?? null },

    async connectSequence(sequence) {
      for (const role of sequence) {
        const session = supervised.get(role)
        if (session === undefined) return { ok: false, role, error: null }
        const result = await session.runtime.connect()
        /*
         * Stops at the first failure and reports which role. Continuing would
         * connect later roles into a state the caller believes is complete.
         */
        if (!result.ok) return { ok: false, role, error: result.error }
      }
      return { ok: true }
    },

    async release(role) {
      const session = supervised.get(role)
      if (session === undefined) return
      supervised.delete(role)
      /*
       * Stop the link, then release what sits above it. Not a policy decision:
       * R1A already treats an operator disconnect as EXPECTED and never
       * reconnects after one, so this is orderly teardown and nothing more.
       */
      await session.runtime.disconnect()
      session.dispose()
    },

    async disposeAll() {
      for (const session of [...supervised.values()]) {
        await session.runtime.disconnect()
        session.dispose()
      }
      supervised.clear()
    },
  }
}
