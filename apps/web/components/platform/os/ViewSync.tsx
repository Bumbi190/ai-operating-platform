'use client'

/**
 * Atlas View Awareness — page wiring helpers (Sprint 1, Task 3).
 *
 * Server pages render these tiny client components to publish, into the
 * module-level view store (lib/atlas/view-client), WHICH records are on screen
 * (`ViewVisibleSync`) and WHICH the operator has opened/selected
 * (`ViewSelectionSync`). The store is read at chat-request time and surfaces as
 * the `Selected:` / `Visible:` lines of [CURRENT VIEW] (and feeds the
 * View → Record bridge's selected-row pinning).
 *
 * They render nothing. Each clears its slice on unmount so a stale page can
 * never bleed into the next view. Pass plain {domain,id,label} refs.
 */

import { useEffect } from 'react'
import { setViewVisible, setViewSelection } from '@/lib/atlas/view-client'
import type { ViewRecordRef } from '@/lib/atlas/view-context'

/** Publish the rows currently rendered on the page. */
export function ViewVisibleSync({ refs }: { refs: ViewRecordRef[] }) {
  const key = JSON.stringify(refs)
  useEffect(() => {
    setViewVisible(refs)
    return () => setViewVisible([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

/** Publish the record(s) the operator has opened/selected. */
export function ViewSelectionSync({ refs }: { refs: ViewRecordRef[] }) {
  const key = JSON.stringify(refs)
  useEffect(() => {
    setViewSelection(refs)
    return () => setViewSelection([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}
