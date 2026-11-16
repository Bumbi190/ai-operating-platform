'use client'

import { useState } from 'react'

type PilotResult = {
  status: string
  oidcRoleAssumed?: boolean
  bedrockInvoked?: boolean
}

export default function BedrockPilotCheckPage() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PilotResult | null>(null)

  async function runCheck() {
    setBusy(true)
    setResult(null)
    try {
      const response = await fetch('/api/bedrock-pilot-check', {
        method: 'POST',
        cache: 'no-store',
      })
      const data = (await response.json()) as PilotResult
      setResult(data)
    } catch {
      setResult({ status: 'network_or_access_error' })
    } finally {
      setBusy(false)
    }
  }

  const verified = result?.status === 'verified' && result.oidcRoleAssumed === true
  return (
    <main style={{ maxWidth: 680, margin: '7vh auto', padding: 28, fontFamily: 'system-ui, sans-serif', color: '#e9f4ff', background: '#101d34', borderRadius: 18 }}>
      <p style={{ color: '#88d5ee', letterSpacing: 2, fontSize: 12 }}>OMNIRA · ISOLERAT AWS-TEST</p>
      <h1 style={{ fontSize: 28, marginTop: 12 }}>Vercel → AWS OIDC</h1>
      <p style={{ color: '#a7efa0' }}>Pilotresultat 2026-11-16: Nova Micro svarade ”Hej” (15 indatatokens, 3 utdatatokens). Det betalda engångstestet är nu avaktiverat i denna Preview.</p>
      <p>Den kvarvarande kontrollen verifierar endast att Preview-miljön kan anta IAM-rollen Omnira-Bedrock-Test via tillfälliga AWS-behörigheter.</p>
      <p><strong>Inget Bedrock-modellanrop utförs, och inga befintliga AWS-nycklar ändras.</strong></p>
      <button
        type="button"
        disabled={busy}
        onClick={runCheck}
        style={{ marginTop: 20, padding: '13px 20px', borderRadius: 10, cursor: busy ? 'wait' : 'pointer', color: '#041225', background: '#61d6fa', border: 'none', fontWeight: 700 }}
      >
        {busy ? 'Kontrollerar…' : 'Verifiera AWS-anslutningen'}
      </button>
      <div role="status" aria-live="polite" style={{ marginTop: 20 }}>
        {result && (
          <p>
            {verified ? 'Godkänt: Vercel OIDC → AWS STS fungerar. Ingen modell har anropats.' : 'Inte verifierat ännu: ' + result.status + '. Inga ändringar i produktion.'}
          </p>
        )}
      </div>
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 28 }}>Tillfällig pilotsida · Endast feat/omnira-bedrock-pilot-20261116 · Ska tas bort efter test.</p>
    </main>
  )
}
