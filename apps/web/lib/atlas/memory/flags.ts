/**
 * lib/atlas/memory/flags.ts — the effective state of the three Memory flags.
 *
 * The flags are write-only "sensitive" variables on Vercel, so configuration can
 * say a variable exists but never what it holds. This reports what the running
 * code would actually do, derived through the same predicates the runtime gates
 * on — booleans only. A raw environment string never leaves this function.
 *
 * Internal helper by design: it is not an endpoint. Exposing it belongs on an
 * existing operator-only surface, decided separately.
 */

import { isMemoryEnabled } from './record-event'
import { isRecallEnabled } from './recall-memories'
import { isMemoryInjectEnabled } from '../intelligence/memory-context'

export interface MemoryFlagState {
  /** ATLAS_MEMORY — events are written. */
  memory: boolean
  /** ATLAS_MEMORY_RECALL — recall is computed (shadow while inject is off). */
  recall: boolean
  /** ATLAS_MEMORY_INJECT — recalled memory reaches Executive Intelligence. */
  inject: boolean
}

export function readMemoryFlags(): MemoryFlagState {
  return {
    memory: isMemoryEnabled(),
    recall: isRecallEnabled(),
    inject: isMemoryInjectEnabled(),
  }
}
