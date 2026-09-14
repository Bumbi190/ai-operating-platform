'use client'

/**
 * Inställningar — "Verifiera nu" for one project's bound social account.
 *
 * Asks the verification route to have the platform confirm, right now, that the
 * project's credential still belongs to the project's bound account. It sends only the
 * project id and the platform: no credential passes through the browser at all. The
 * route re-checks the platform operator and ownership of the project; a confirmation
 * records the name the platform gave (for Facebook, the page's name).
 */

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CHANNEL_LABELS,
  VERIFY_ENDPOINT,
  verificationOutcome,
  type ChannelId,
  type VerificationOutcome,
} from '@/lib/os/settings-shared'
import styles from './SettingsSurface.module.css'

type VerifyState = { kind: 'idle' } | { kind: 'working' } | VerificationOutcome

export function SettingsVerifyButton({ projectId, projectName, platform }: { projectId: string; projectName: string; platform: ChannelId }) {
  const router = useRouter()
  const [state, setState] = useState<VerifyState>({ kind: 'idle' })
  const working = state.kind === 'working'

  const verify = useCallback(async () => {
    if (working) return
    setState({ kind: 'working' })
    try {
      const res = await fetch(VERIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, platform }),
      })
      const payload = await res.json().catch(() => null)
      setState(verificationOutcome(res.status, payload))
    } catch {
      setState({ kind: 'failed', message: 'Inget svar kom fram. Försök igen.' })
    } finally {
      router.refresh()
    }
  }, [working, projectId, platform, router])

  const outcome = state.kind === 'idle' || state.kind === 'working' ? null : state

  return (
    <div className={styles.verify}>
      <button
        type="button"
        className={styles.secondary}
        onClick={verify}
        disabled={working}
        aria-label={`Verifiera ${CHANNEL_LABELS[platform]}-kontot för ${projectName} nu`}
      >
        {working ? 'Verifierar …' : 'Verifiera nu'}
      </button>
      <span className={styles.outcome} role="status" aria-live="polite" data-kind={outcome?.kind ?? 'none'}>
        {outcome ? outcome.message : null}
      </span>
    </div>
  )
}
