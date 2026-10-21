import 'server-only'
/**
 * lib/atlas/project-analytics/handlarborsen-chat.ts — Handlarbörsen facts for the REAL chat (P1D.2).
 *
 * `app/api/chat/route.ts` still builds its prompt on the legacy path; the assembler is
 * shadow-only. So the facts are appended there, by this one function, and only when:
 *
 *   1. The user's message names Handlarbörsen — and only Handlarbörsen. The scan reuses
 *      the canonical alias table through `resolveProjectInText` (no second table). It
 *      returns null when two different projects are named, so an ambiguous question
 *      never picks Handlarbörsen by accident.
 *   2. The caller's server-verified allow-list contains the project. This is enforced
 *      downstream by P1D's reader (`assertProjectAllowed` + fixed identity + atlas_mode).
 *
 * The message text is only a CLUE for relevance. It never grants access: the allow-list
 * comes from `getAllowedProjectIds(db, user.id)`, the client `view` is not consulted,
 * and a name in the text for a project the user does not own yields nothing at all.
 *
 * Output is '' (add nothing) for every other question, so no unrelated Atlas turn
 * carries Handlarbörsen data. Never throws.
 */

import { resolveProjectInText } from '@/lib/atlas/status-intent'
import { deriveContextRequest } from '@/lib/atlas/context/request'
import {
  HANDLARBORSEN_PROJECT_ID,
  HANDLARBORSEN_PROJECT_SLUG,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { readHandlarborsenChatContext } from './handlarborsen-marketplace-read'

type AnyDb = any

/** True only when the message names Handlarbörsen and no other project. */
export function namesOnlyHandlarborsen(text: unknown): boolean {
  if (typeof text !== 'string') return false
  return resolveProjectInText(text.normalize('NFC').toLowerCase().trim()) === HANDLARBORSEN_PROJECT_SLUG
}

export async function buildHandlarborsenChatFacts(args: {
  db: AnyDb
  allowedProjectIds: string[]
  text: unknown
  now?: Date
}): Promise<string> {
  try {
    if (!namesOnlyHandlarborsen(args.text)) return ''
    // deriveContextRequest degrades to global scope when the project is outside the
    // allow-list, which the reader then treats as "contribute nothing".
    const req = deriveContextRequest({
      trigger: 'operator',
      allowedProjectIds: args.allowedProjectIds,
      projectId: HANDLARBORSEN_PROJECT_ID,
    })
    return await readHandlarborsenChatContext(
      req,
      { db: args.db, allowedProjectIds: args.allowedProjectIds },
      args.now,
    )
  } catch {
    return ''
  }
}
