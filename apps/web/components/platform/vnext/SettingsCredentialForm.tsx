'use client'

/**
 * Inställningar — replace one channel's publishing credential.
 *
 * WRITE-ONLY. The token exists in this component only while it is being typed.
 * The field is emptied the moment the request leaves, whatever the answer; the
 * value is never stored in the browser, never echoed back, never logged, and the
 * field opts out of autocomplete and spellcheck. No answer the route gives can
 * carry a token.
 *
 * ONE PATH. It posts to the existing `POST /api/media/token`, which owns the
 * platform-operator gate, the ownership gate, the fail-closed audit event, the
 * exchange and the store. This component adds no authority and no second write.
 * It is only rendered when the loader's capability says this session would pass
 * the route's checks — and the route checks again. A refusal is shown as a
 * refusal and an audit incident as an incident, never as success.
 */

import { useCallback, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  CHANNEL_LABELS,
  CREDENTIAL_ENDPOINT,
  MIN_TOKEN_LENGTH,
  SEND_FAILED_MESSAGE,
  replacementOutcome,
  type ReplaceableChannelId,
  type ReplacementOutcome,
} from '@/lib/os/settings-shared'
import styles from './SettingsSurface.module.css'

type FormState = { kind: 'idle' } | { kind: 'working' } | ReplacementOutcome

export function SettingsCredentialForm({ platform }: { platform: ReplaceableChannelId }) {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [days, setDays] = useState(platform === 'instagram' ? '60' : '')
  const [state, setState] = useState<FormState>({ kind: 'idle' })
  const label = CHANNEL_LABELS[platform]
  const working = state.kind === 'working'
  const ready = token.trim().length >= MIN_TOKEN_LENGTH && !working

  const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = token.trim()
    if (value.length < MIN_TOKEN_LENGTH || working) return
    const body: Record<string, unknown> = { platform, token: value }
    if (platform === 'instagram') {
      const n = Number(days)
      if (Number.isFinite(n) && n > 0) body.expires_days = n
    }
    // Gone from the field before the answer arrives — the answer cannot bring it back.
    setToken('')
    setState({ kind: 'working' })
    try {
      const res = await fetch(CREDENTIAL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json().catch(() => null)
      setState(replacementOutcome(res.status, payload))
    } catch {
      setState({ kind: 'failed', message: SEND_FAILED_MESSAGE, operationId: null, facebook: null })
    } finally {
      router.refresh()
    }
  }, [token, days, platform, working, router])

  const fieldId = `settings-token-${platform}`
  const daysId = `settings-days-${platform}`
  const outcome = state.kind === 'idle' || state.kind === 'working' ? null : state

  return (
    <form className={styles.replace} data-credential="true" onSubmit={submit} aria-label={`Ersätt ${label}-token`}>
      <label className={styles.fieldLabel} htmlFor={fieldId}>Nytt {label}-token</label>
      <textarea
        id={fieldId}
        name={`token-${platform}`}
        className={styles.tokenInput}
        value={token}
        onChange={(e) => setToken(e.target.value)}
        rows={3}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="Klistra in hela tokenet"
        disabled={working}
      />

      {platform === 'instagram' ? (
        <div className={styles.inlineField}>
          <label className={styles.fieldLabel} htmlFor={daysId}>Giltigt antal dagar</label>
          <input
            id={daysId}
            className={styles.daysInput}
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={working}
          />
        </div>
      ) : (
        <p className={styles.hint}>
          Tokenet växlas till ett långlivat sid-token och read_insights kontrolleras innan det sparas.
        </p>
      )}

      <div className={styles.formActions}>
        <button type="submit" className={styles.primary} disabled={!ready}>
          {working ? 'Ersätter …' : 'Ersätt token'}
        </button>
        <span className={styles.hint}>Fältet töms när tokenet skickas. Det visas aldrig igen.</span>
      </div>

      <div className={styles.outcome} role="status" aria-live="polite" data-kind={outcome?.kind ?? 'none'}>
        {working ? <span>Skickar till plattformen …</span> : null}
        {outcome ? (
          <>
            <span className={styles.outcomeMessage}>{outcome.message}</span>
            {outcome.facebook ? (
              <span className={styles.outcomeMeta}>
                Långlivat: {outcome.facebook.exchanged ? 'ja' : 'nej'} · Sid-token: {outcome.facebook.pageResolved ? 'ja' : 'nej'} · read_insights: {outcome.facebook.readInsightsOk ? 'ja' : 'nej'}
              </span>
            ) : null}
            {outcome.operationId ? (
              <span className={styles.outcomeMeta}>Revisionshändelse <code className={styles.code}>{outcome.operationId}</code></span>
            ) : null}
          </>
        ) : null}
      </div>
    </form>
  )
}
