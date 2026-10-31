'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type PendingState = {
  state: 'ok'
  pendingCount: number
  approvalIds: string[]
  mayHaveMore: boolean
}

const REMINDER_KEY = 'omnira:nova:hb-reply-notified:v1'
const DISMISS_KEY = 'omnira:nova:hb-reply-dismissed:v2'
const REVIEW_URL = '/approvals?project=handlarborsen'
const POLL_MS = 60_000

function isPendingState(input: unknown): input is PendingState {
  if (!input || typeof input !== 'object') return false
  const value = input as Record<string, unknown>
  return value.state === 'ok' && typeof value.pendingCount === 'number'
    && Number.isSafeInteger(value.pendingCount) && value.pendingCount >= 0
    && Array.isArray(value.approvalIds)
    && value.approvalIds.length === value.pendingCount && value.approvalIds.length <= 50
    && value.approvalIds.every(id => typeof id === 'string' && /^[a-f\d-]{36}$/i.test(id))
    && typeof value.mayHaveMore === 'boolean'
}

function readSeen(): Set<string> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(REMINDER_KEY) || '[]')
    return new Set(Array.isArray(raw)
      ? raw.filter((value: unknown) => typeof value === 'string').slice(-200)
      : [])
  } catch { return new Set() }
}

function saveSeen(seen: Set<string>) {
  try { window.localStorage.setItem(REMINDER_KEY, JSON.stringify([...seen].slice(-200))) }
  catch { /* Browser storage is optional; in-app reminder remains. */ }
}

function readDismissed(): string[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(DISMISS_KEY) || '[]')
    return Array.isArray(raw)
      ? raw.filter((id: unknown): id is string => typeof id === 'string' && /^[a-f\d-]{36}$/i.test(id)).slice(-200)
      : []
  } catch { return [] }
}

function saveDismissed(ids: string[]) {
  try { window.localStorage.setItem(DISMISS_KEY, JSON.stringify(ids.slice(-200))) }
  catch { /* Storage may be blocked; keep the current view dismissible. */ }
}

/**
 * Only the approved owner sees this UI (server layout gates mounting it).
 * One small, dismissible in-app reminder. An optional browser notification is
 * emitted ONCE per newly eligible approval only after browser permission.
 * No email, push subscription, outbound contact or hidden message text.
 */
export function NovaReplyReviewReminder() {
  const [pending, setPending] = useState<PendingState | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [permission, setPermission] = useState<'unsupported' | NotificationPermission>('unsupported')
  const seenInSession = useRef<Set<string>>(new Set())

  useEffect(() => {
    setPermission(typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission : 'unsupported')
    setDismissed(readDismissed())

    const controller = new AbortController()
    const refresh = async () => {
      try {
        const response = await fetch('/api/sales/replies/review-notices', {
          cache: 'no-store', signal: controller.signal,
        })
        if (!response.ok) throw Error('review_unavailable')
        const result: unknown = await response.json()
        if (!controller.signal.aborted) setPending(isPendingState(result) ? result : null)
      } catch {
        if (!controller.signal.aborted) setPending(null) // unknown is not zero
      }
    }
    void refresh()
    const interval = setInterval(() => { void refresh() }, POLL_MS)
    return () => { controller.abort(); clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (!pending || pending.pendingCount === 0 || permission !== 'granted') return
    const seen = readSeen()
    const newIds = pending.approvalIds.filter(id => !dismissed.includes(id) && !seen.has(id) && !seenInSession.current.has(id))
    if (!newIds.length) return
    try {
      // No personal data or private message subject in OS/browser notifications.
      const notification = new Notification('Nova · Handlarbörsen', {
        body: `${pending.pendingCount} ${pending.pendingCount === 1 ? 'svarsförslag väntar' : 'svarsförslag väntar'} på din granskning. Inget mejl skickas automatiskt.`,
        tag: 'omnira-hb-review',
      })
      notification.onclick = () => {
        window.focus()
        window.location.assign(REVIEW_URL)
        notification.close()
      }
      for (const id of newIds) { seen.add(id); seenInSession.current.add(id) }
      saveSeen(seen)
    } catch {
      // Native notifications are optional, especially on mobile browsers.
      // Preserve the visible in-app reminder when the notification API fails.
    }
  }, [pending, permission, dismissed])

  if (!pending || pending.pendingCount === 0) return null
  if (pending.approvalIds.every(id => dismissed.includes(id))) return null

  const close = () => {
    // Dismiss each approval, not the whole queue fingerprint. If A disappears
    // while B remains, B must not reappear as a supposedly new reminder.
    const next = [...new Set([...dismissed, ...pending.approvalIds])].slice(-200)
    setDismissed(next)
    saveDismissed(next)
  }
  const requestNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    try { setPermission(await Notification.requestPermission()) }
    catch { setPermission('denied') }
  }

  return (
    <aside aria-live="polite"
      className="fixed bottom-20 left-3 right-3 z-[75] rounded-2xl border border-sky-400/35 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur md:bottom-6 md:left-auto md:right-6 md:w-[340px]"
      aria-label="Påminnelse från Nova om svarsgranskning">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-sky-200">Nova · Handlarbörsen</p>
          <p className="mt-1 text-sm leading-5">
            {pending.mayHaveMore ? 'Minst ' : ''}
            {pending.pendingCount} {pending.pendingCount === 1 ? 'svarsförslag väntar' : 'svarsförslag väntar'} på din granskning.
          </p>
          <p className="mt-1 text-xs text-slate-400">Ett i taget. Godkännande skickar inget mejl.</p>
        </div>
        <button type="button" onClick={close} aria-label="Dölj Novas påminnelse"
          className="rounded-lg px-2 py-1 text-slate-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
          ×
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={REVIEW_URL}
          className="rounded-lg bg-sky-400/20 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-400/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
          Granska förslag
        </Link>
        {permission === 'default' && (
          <button type="button" onClick={() => { void requestNotifications() }}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-300 hover:bg-white/10">
            Slå på webbläsarnotiser
          </button>
        )}
      </div>
    </aside>
  )
}
