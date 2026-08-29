'use client'

/**
 * The only interactive control in /releases, and deliberately the narrowest one
 * that can exist: it opens an authorization REQUEST, or records a human
 * decision. There is no execute button and no run button, because permission to
 * act and the act itself are separate things in this design (PR2 section G).
 *
 * Both decisions post to the EXISTING executive authorization route. Building a
 * second decision endpoint would be a second place for the authority rules to
 * drift apart, and this route already enforces bounded validity, project scope
 * and the append-only lifecycle.
 *
 * Nothing here decides who may approve. The server derives the principal from
 * the session and checks project ownership; this component only avoids showing
 * controls to someone the server would refuse anyway.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Busy = null | 'request' | 'grant' | 'deny'

/** Default bounded validity offered for a grant. The server requires one. */
const GRANT_WINDOW_DAYS = 7

export function GateActions({
  instanceId,
  authorizationId,
  status,
}: {
  instanceId: string
  authorizationId: string | null
  status: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const disabled = busy !== null || pending

  async function post(url: string, body: unknown, kind: Busy) {
    setBusy(kind)
    setError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        setError(typeof detail?.error === 'string' ? detail.error : `HTTP ${res.status}`)
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError('request failed')
    } finally {
      setBusy(null)
    }
  }

  // A stale, expired, denied or revoked gate needs a NEW request — the old
  // chain is immutable and cannot be revived.
  const needsRequest =
    !authorizationId || ['stale', 'expired', 'denied', 'revoked', 'superseded', 'malformed'].includes(status)

  const expiresAt = new Date(Date.now() + GRANT_WINDOW_DAYS * 86_400_000).toISOString()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {needsRequest ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => post('/api/workflows/gate', { action: 'request_authorization', instanceId }, 'request')}
            className="rounded border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.08] disabled:opacity-40"
          >
            {busy === 'request' ? 'Requesting…' : 'Request authorization'}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => post('/api/atlas/executive/authorization',
                { action: 'grant', authorizationId, expiresAt }, 'grant')}
              className="rounded border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-40"
            >
              {busy === 'grant' ? 'Approving…' : 'Approve'}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => post('/api/atlas/executive/authorization',
                { action: 'deny', authorizationId, reason: 'Denied from the releases view' }, 'deny')}
              className="rounded border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-400/20 disabled:opacity-40"
            >
              {busy === 'deny' ? 'Denying…' : 'Deny'}
            </button>
            <span className="text-[11px] text-white/35">
              Approval is valid for {GRANT_WINDOW_DAYS} days and is recorded as a new,
              immutable ledger event.
            </span>
          </>
        )}
      </div>
      {error && <div className="text-xs text-rose-300">Could not complete: {error}</div>}
    </div>
  )
}
