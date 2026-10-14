'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { reduceBuildSnapshot } from './client-state'
import type { BuildFeedback, BuildRef, BuildSessionView, FeedbackInput } from './types'
export async function buildFetch<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Byggtjänsten kunde inte svara.')
  return data as T
}
export function useBuildSession(ref: BuildRef, initial: BuildSessionView) {
  const [session, setSession] = useState(initial)
  const [connection, setConnection] = useState<'online' | 'reconnecting'>('online')
  const alive = useRef(true)
  const endpoint = `/api/website-builds/${ref.sessionId}`
  const apply = useCallback((incoming: BuildSessionView) => { if (alive.current) { setSession(current => reduceBuildSnapshot(current, incoming)); setConnection('online') } }, [])
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { apply(await buildFetch<BuildSessionView>(endpoint + '?projectId=' + ref.projectId, undefined, signal)) }
    catch (error) { if (!signal?.aborted && alive.current) setConnection('reconnecting'); if (!signal) throw error }
  }, [endpoint, ref.projectId, apply])
  useEffect(() => {
    alive.current = true
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>
    const poll = async () => { await refresh(controller.signal); if (!controller.signal.aborted) timer = setTimeout(poll, 3000) }
    void poll()
    return () => { alive.current = false; controller.abort(); clearTimeout(timer) }
  }, [refresh])
  const submitFeedback = async (input: FeedbackInput): Promise<BuildFeedback> => {
    const receipt = await buildFetch<BuildFeedback>(endpoint + '/feedback', { ...input, projectId: ref.projectId })
    // A persisted receipt stands even when the next read fails.
    try { await refresh() } catch { /* reconnection state communicates the failed read */ }
    return receipt
  }
  const requestControl = async (action: 'pause' | 'resume' | 'cancel', idempotencyKey: string) => apply(await buildFetch<BuildSessionView>(endpoint + '/control', { projectId: ref.projectId, action, idempotencyKey }))
  return { session, connection, submitFeedback, requestControl, refresh }
}
