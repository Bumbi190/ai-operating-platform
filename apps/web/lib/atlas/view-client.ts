'use client'

/**
 * Atlas View Awareness — client side.
 *
 * Builds the view envelope attached to every /api/chat request and a single
 * `buildChatRequestBody` helper used by BOTH ChatClient and VoiceAssistant, so
 * the two surfaces can never drift in what they report about the current view.
 *
 * Selection / visible records are an opt-in store that pages populate as the
 * feature rolls out per-page; until a page wires them, the envelope still
 * carries route + project + filters (the high-value part). Read at request time
 * (not render time) so the envelope always reflects the current location.
 */

import type { ClientViewEnvelope, ViewRecordRef } from './view-context'

// Module-level stores — pages call the setters; harmless no-ops if unused.
let _selection: ViewRecordRef[] = []
let _visible: ViewRecordRef[] = []

/** Pages call this when the operator selects/opens record(s). Pass [] to clear. */
export function setViewSelection(refs: ViewRecordRef[]): void {
  _selection = Array.isArray(refs) ? refs.slice(0, 10) : []
}

/** Pages call this with the records currently rendered on screen. Pass [] to clear. */
export function setViewVisible(refs: ViewRecordRef[]): void {
  _visible = Array.isArray(refs) ? refs.slice(0, 12) : []
}

/** Snapshot the current view at request time (route/query from the live location). */
export function getCurrentViewEnvelope(): ClientViewEnvelope {
  if (typeof window === 'undefined') return {}
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    selection: _selection,
    visible: _visible,
    ts: Date.now(),
  }
}

/**
 * Attach the current view envelope to a chat request body. Used by both chat
 * surfaces so they report the view identically. The server ignores `view`
 * unless the ATLAS_VIEW_AWARENESS flag is on, so this is always safe to send.
 */
export function buildChatRequestBody<T extends Record<string, unknown>>(
  base: T,
): T & { view: ClientViewEnvelope } {
  return { ...base, view: getCurrentViewEnvelope() }
}
