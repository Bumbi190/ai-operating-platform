'use client'

/**
 * Inställningar — "Anslut YouTube" for ONE project.
 *
 * Asks the start route for Google's consent URL for this project and sends the browser
 * there. It sends only the project id and, when the operator explicitly asks for it, a
 * channel change. No credential passes through the browser: Google returns the operator to
 * the callback, which decides the channel from what YouTube says and stores the connection
 * for this project only.
 *
 * ONE PATH. It posts to `POST /api/media/youtube/oauth/start` and nowhere else, and it
 * follows only a consent URL on Google's own origin. A refusal is shown as a refusal.
 */

import { useCallback, useState } from 'react'
import {
  YOUTUBE_CONSENT_ORIGIN,
  YOUTUBE_OAUTH_START_ENDPOINT,
  youtubeStartOutcome,
  type YouTubeStartOutcome,
} from '@/lib/os/settings-shared'
import styles from './SettingsSurface.module.css'

type ConnectState = { kind: 'idle' } | { kind: 'working' } | YouTubeStartOutcome

export type YouTubeConnectMode = 'connect' | 'reconnect' | 'migrate'

const LABELS: Record<YouTubeConnectMode, string> = {
  connect: 'Anslut YouTube',
  reconnect: 'Anslut igen',
  migrate: 'Anslut YouTube till projektet',
}

export function SettingsYouTubeConnect({ projectId, projectName, mode }: { projectId: string; projectName: string; mode: YouTubeConnectMode }) {
  const [state, setState] = useState<ConnectState>({ kind: 'idle' })
  const [changeChannel, setChangeChannel] = useState(false)
  const working = state.kind === 'working'
  const bound = mode !== 'connect'

  const start = useCallback(async () => {
    if (working) return
    setState({ kind: 'working' })
    try {
      const body: Record<string, unknown> = { project_id: projectId }
      if (bound && changeChannel) body.change_account = true
      const res = await fetch(YOUTUBE_OAUTH_START_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json().catch(() => null) as Record<string, unknown> | null
      const consent = res.ok && payload?.ok === true && typeof payload.authorization_url === 'string'
        ? payload.authorization_url
        : null
      if (consent && new URL(consent).origin === YOUTUBE_CONSENT_ORIGIN) {
        window.location.assign(consent)
        return
      }
      setState(youtubeStartOutcome(res.status, payload))
    } catch {
      setState({ kind: 'failed', message: 'Inget svar kom fram. Försök igen.' })
    }
  }, [working, bound, changeChannel, projectId])

  const outcome = state.kind === 'idle' || state.kind === 'working' ? null : state

  return (
    <div className={styles.verify} data-youtube-connect={mode}>
      {bound ? (
        <label className={styles.meta}>
          <input
            type="checkbox"
            checked={changeChannel}
            onChange={(event) => setChangeChannel(event.target.checked)}
            disabled={working}
          />{' '}
          Byt kanal för {projectName}
        </label>
      ) : null}
      <button
        type="button"
        className={styles.secondary}
        onClick={start}
        disabled={working}
        aria-label={`${bound && changeChannel ? 'Byt YouTube-kanal' : LABELS[mode]} för ${projectName}`}
      >
        {working ? 'Öppnar Google …' : bound && changeChannel ? 'Byt kanal' : LABELS[mode]}
      </button>
      <span className={styles.outcome} role="status" aria-live="polite" data-kind={outcome?.kind ?? 'none'}>
        {outcome ? outcome.message : null}
      </span>
    </div>
  )
}
