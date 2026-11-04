'use client'
import { useState } from 'react'
type Proposal = {
  projectId: string; enabled: boolean; target: { versionHash: string }
  payload: { appHost: string; posthogProjectId: number; limit: number }
}
export default function PosthogReview({ proposal }: { proposal: Proposal }) {
  const [authorizationId, setAuthorizationId] = useState<string | null>(null)
  const [granted, setGranted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [dashboards, setDashboards] = useState<Array<{ id: number; name: string }> | null>(null)
  async function post(url: string, body: unknown) {
    const response = await fetch(url, { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error('Begäran nekades eller kunde inte slutföras. Ladda om sidan och kontrollera ditt godkännande.')
    return result
  }
  async function act(kind: 'request' | 'grant' | 'read') {
    setBusy(true); setMessage('')
    try {
      if (kind === 'request') {
        const result = await post('/api/analytics/posthog/authorization', {
          projectId: proposal.projectId, expectedVersionHash: proposal.target.versionHash,
        })
        setAuthorizationId(result.authorizationId); setGranted(false)
        setMessage('Begäran skapad. Granska omfattningen och godkänn nedan.')
      } else if (kind === 'grant') {
        await post('/api/atlas/executive/authorization', {
          action: 'grant', authorizationId, expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        })
        setGranted(true); setMessage('Godkännandet gäller i fem minuter. Du kan nu hämta dashboardlistan.')
      } else {
        const result = await post('/api/analytics/posthog/dashboards', {
          projectId: proposal.projectId, authorizationId, expectedVersionHash: proposal.target.versionHash,
        })
        setDashboards(result.dashboards); setMessage('Läsningen lyckades och registrerades i läsloggen.')
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Begäran misslyckades.') }
    finally { setBusy(false) }
  }
  return <section className="space-y-5">
    <h1 className="text-2xl font-semibold">Handlarbörsen · PostHog</h1>
    <p>Den här första anslutningen visar dashboardnamn och ID. Besöksstatistik och trattanalys ingår ännu inte.</p>
    <div className="rounded-lg border p-4 space-y-2">
      <h2 className="font-semibold">Granska läsningen</h2>
      <p>PostHog-projekt: {proposal.payload.posthogProjectId} · {proposal.payload.appHost}</p>
      <p>Högst {proposal.payload.limit} dashboardnamn och ID. Inga ändringar görs i PostHog.</p>
      <p>Godkännandet gäller i fem minuter. Högst tre anrop per minut och tjugo per dag delas inom projektet.</p>
    </div>
    {!proposal.enabled && <p>Funktionen är avstängd på servern.</p>}
    <div className="flex flex-wrap gap-3">
      {!authorizationId && <button className="rounded border px-4 py-2" disabled={busy || !proposal.enabled} onClick={() => act('request')}>Förbered godkännande</button>}
      {authorizationId && !granted && <button className="rounded border px-4 py-2" disabled={busy} onClick={() => act('grant')}>Godkänn denna läsning i 5 minuter</button>}
      {granted && <button className="rounded border px-4 py-2" disabled={busy} onClick={() => act('read')}>Hämta dashboardlista</button>}
    </div>
    <p role="status" aria-live="polite">{busy ? 'Arbetar…' : message}</p>
    {dashboards && <div><h2 className="font-semibold">Dashboards</h2>
      {dashboards.length ? <ul className="list-disc pl-5">{dashboards.map(item => <li key={item.id}>{item.name} · {item.id}</li>)}</ul> : <p>Inga dashboards hittades.</p>}
    </div>}
  </section>
}
