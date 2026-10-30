'use client'
import * as React from 'react'
import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import type { InboxAudience } from '@/lib/atlas/project-analytics/handlarborsen-candidate-inbox-service'
import {
  createInboxSummaryResource, INBOX_RECEIPT_EVENT, type InboxSummaryState,
} from '@/lib/atlas/project-analytics/handlarborsen-inbox-summary-client'

export const AtlasInboxContext = createContext<{
  state: InboxSummaryState; audience: InboxAudience; refresh: (force?: boolean) => void
} | null>(null)

/** Server passes only a display scope hint. Every GET still reauthorizes the session. */
export function AtlasInboxProvider({ audience, children }: {
  audience: InboxAudience | null; children: React.ReactNode
}) {
  if (!audience) return <AtlasInboxContext.Provider value={null}>{children}</AtlasInboxContext.Provider>
  // Key clears all former personal state synchronously when the audience changes.
  return <ActiveProvider key={audience} audience={audience}>{children}</ActiveProvider>
}
function ActiveProvider({ audience, children }: {
  audience: InboxAudience; children: React.ReactNode
}) {
  const [state,setState] = useState<InboxSummaryState>({status:'loading'})
  const resource = useRef<ReturnType<typeof createInboxSummaryResource> | null>(null)
  const refresh = useCallback((force=false) => { void resource.current?.refresh(force) },[])
  useEffect(() => {
    const current = createInboxSummaryResource(audience,setState)
    resource.current = current
    const onFocus = () => { if (document.visibilityState === 'visible') void current.refresh() }
    const onReceipt = () => { void current.refresh(true) }
    void current.refresh()
    window.addEventListener('focus',onFocus)
    document.addEventListener('visibilitychange',onFocus)
    window.addEventListener(INBOX_RECEIPT_EVENT,onReceipt)
    return () => {
      current.dispose()
      resource.current = null
      window.removeEventListener('focus',onFocus)
      document.removeEventListener('visibilitychange',onFocus)
      window.removeEventListener(INBOX_RECEIPT_EVENT,onReceipt)
    }
  },[audience])
  return <AtlasInboxContext.Provider value={{state,audience,refresh}}>{children}</AtlasInboxContext.Provider>
}
