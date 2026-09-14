'use client'

/**
 * Inställningar — add or replace ONE project's Instagram or Facebook credential.
 *
 * PROJECT-EXPLICIT. The form belongs to one project's card and states the project the
 * credential will be stored for, on the button that stores it. It sends that project's
 * id. The route re-checks the platform operator and ownership of that project, asks the
 * platform which account the credential belongs to, and stores it only for the
 * project's verified account — or, with "Byt konto", for a new account that belongs to
 * no other project.
 *
 * WRITE-ONLY. The token exists in this component only while it is being typed. The
 * field is emptied the moment the request leaves, whatever the answer; the value is
 * never stored in the browser, never echoed back, never logged, and the field opts out
 * of autocomplete and spellcheck. No answer the route gives can carry a token.
 *
 * ONE PATH. It posts to the existing `POST /api/media/token` and nowhere else. A refusal
 * is shown as a refusal and an audit incident as an incident, never as success.
 */

import { useCallback, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  BINDING_ACTION_LABELS,
  CHANNEL_LABELS,
  CREDENTIAL_ENDPOINT,
  MIN_TOKEN_LENGTH,
  PAGE_ID_PATTERN,
  SEND_FAILED_MESSAGE,
  replacementOutcome,
  type ReplaceableChannelId,
  type ReplacementOutcome,
} from '@/lib/os/settings-shared'
import styles from './SettingsSurface.module.css'

type FormState = { kind: 'idle' } | { kind: 'working' } | ReplacementOutcome

export interface SettingsCredentialFormProps {
  projectId: string
  projectName: string
  platform: ReplaceableChannelId
  /** The project's verified account on the platform, or null when none is bound yet. */
  boundAccount: { id: string; label: string | null } | null
}

export function SettingsCredentialForm({ projectId, projectName, platform, boundAccount }: SettingsCredentialFormProps) {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [days, setDays] = useState(platform === 'instagram' ? '60' : '')
  const [pageId, setPageId] = useState('')
  const [changeAccount, setChangeAccount] = useState(false)
  const [state, setState] = useState<FormState>({ kind: 'idle' })
  const label = CHANNEL_LABELS[platform]
  const working = state.kind === 'working'
  // Facebook names its page only for a first binding or an explicit account change;
  // otherwise the page is the project's bound page.
  const needsPageId = platform === 'facebook' && (!boundAccount || changeAccount)
  const pageIdReady = !needsPageId || PAGE_ID_PATTERN.test(pageId.trim())
  const ready = token.trim().length >= MIN_TOKEN_LENGTH && pageIdReady && !working

  const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = token.trim()
    if (value.length < MIN_TOKEN_LENGTH || !pageIdReady || working) return
    const body: Record<string, unknown> = { project_id: projectId, platform, token: value }
    if (platform === 'instagram') {
      const n = Number(days)
      if (Number.isFinite(n) && n > 0) body.expires_days = n
    }
    if (needsPageId) body.page_id = pageId.trim()
    if (boundAccount && changeAccount) body.change_account = true
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
      setState({ kind: 'failed', message: SEND_FAILED_MESSAGE, operationId: null, facebook: null, account: null })
    } finally {
      router.refresh()
    }
  }, [token, days, pageId, pageIdReady, needsPageId, changeAccount, boundAccount, projectId, platform, working, router])

  const idBase = `settings-${projectId}-${platform}`
  const outcome = state.kind === 'idle' || state.kind === 'working' ? null : state
  const boundName = boundAccount
    ? (boundAccount.label ? (platform === 'instagram' ? `@${boundAccount.label}` : boundAccount.label) : boundAccount.id)
    : null
  const title = boundAccount ? `Ersätt ${label}-credential` : `Lägg till ${label}-konto`

  return (
    <form
      className={styles.replace}
      data-credential="true"
      data-project={projectId}
      onSubmit={submit}
      aria-label={`${title} för ${projectName}`}
    >
      <p className={styles.formTitle}>{title}</p>
      <p className={styles.target}>
        Projekt: <strong>{projectName}</strong>
        {boundAccount && !changeAccount ? <> · credentialn måste tillhöra {boundName}</> : null}
      </p>

      <label className={styles.fieldLabel} htmlFor={`${idBase}-token`}>
        {platform === 'facebook' ? 'Facebook-token (användar- eller sid-token)' : 'Instagram-token'}
      </label>
      <textarea
        id={`${idBase}-token`}
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

      {needsPageId ? (
        <div className={styles.inlineField}>
          <label className={styles.fieldLabel} htmlFor={`${idBase}-page`}>
            {changeAccount ? 'Den nya Facebook-sidans id' : 'Facebook-sidans id'}
          </label>
          <input
            id={`${idBase}-page`}
            className={styles.pageInput}
            inputMode="numeric"
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={working}
          />
        </div>
      ) : null}

      {platform === 'instagram' ? (
        <div className={styles.inlineField}>
          <label className={styles.fieldLabel} htmlFor={`${idBase}-days`}>Giltigt antal dagar</label>
          <input
            id={`${idBase}-days`}
            className={styles.daysInput}
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={working}
          />
        </div>
      ) : (
        <p className={styles.hint}>
          Tokenet växlas till ett långlivat sid-token, och sidan bekräftas hos Meta innan något sparas.
        </p>
      )}

      {boundAccount ? (
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={changeAccount}
            onChange={(e) => setChangeAccount(e.target.checked)}
            disabled={working}
          />
          <span>Byt konto för {projectName}. Det nya kontot får inte tillhöra ett annat projekt, och bytet revisionsloggas.</span>
        </label>
      ) : (
        <p className={styles.hint}>
          {platform === 'instagram'
            ? 'Kontot tas från Instagrams eget svar för tokenet.'
            : 'Sidan bekräftas hos Meta med tokenet.'}{' '}
          Det kopplas till {projectName} och kan inte samtidigt tillhöra ett annat projekt.
        </p>
      )}

      <div className={styles.formActions}>
        <button type="submit" className={styles.primary} disabled={!ready}>
          {working ? 'Sparar …' : `Spara för ${projectName}`}
        </button>
        <span className={styles.hint}>Fältet töms när tokenet skickas. Det visas aldrig igen.</span>
      </div>

      <div className={styles.outcome} role="status" aria-live="polite" data-kind={outcome?.kind ?? 'none'}>
        {working ? <span>Frågar plattformen vilket konto tokenet tillhör …</span> : null}
        {outcome ? (
          <>
            <span className={styles.outcomeMessage}>{outcome.message}</span>
            {outcome.account ? (
              <span className={styles.outcomeMeta}>
                Konto {outcome.account.label ?? outcome.account.id} (<code className={styles.code}>{outcome.account.id}</code>)
                {outcome.account.bindingAction && BINDING_ACTION_LABELS[outcome.account.bindingAction]
                  ? ` · ${BINDING_ACTION_LABELS[outcome.account.bindingAction]}`
                  : ''}
              </span>
            ) : null}
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
