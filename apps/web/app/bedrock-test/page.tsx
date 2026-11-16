'use client'

import { useState } from 'react'

type OidcResult = {
  status: string
  oidcRoleAssumed?: boolean
  bedrockInvoked?: boolean
}
type NovaResult = {
  status: string
  modelId?: string
  answer?: string
  inputTokens?: number
  outputTokens?: number
  reason?: string
  diagnostic?: string
}

export default function BedrockPilotCheckPage() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<OidcResult | null>(null)
  const [novaBusy, setNovaBusy] = useState(false)
  const [novaResult, setNovaResult] = useState<NovaResult | null>(null)

  async function runCheck() {
    setBusy(true)
    setResult(null)
    setNovaResult(null)
    try {
      const response = await fetch('/api/bedrock-pilot-check', {
        method: 'POST',
        cache: 'no-store',
      })
      setResult((await response.json()) as OidcResult)
    } catch {
      setResult({ status: 'network_or_access_error' })
    } finally {
      setBusy(false)
    }
  }

  async function runNova() {
    setNovaBusy(true)
    setNovaResult(null)
    try {
      const response = await fetch('/api/bedrock-pilot-converse', {
        method: 'POST',
        cache: 'no-store',
      })
      setNovaResult((await response.json()) as NovaResult)
    } catch {
      setNovaResult({ status: 'network_or_access_error' })
    } finally {
      setNovaBusy(false)
    }
  }

  const verified = result?.status === 'verified' && result.oidcRoleAssumed === true
  const novaSuccess = novaResult?.status === 'nova_micro_replied'
  return (
    <main style={{ maxWidth: 700, margin: '7vh auto', padding: 28, fontFamily: 'system-ui, sans-serif', color: '#e9f4ff', background: '#101d34', borderRadius: 18 }}>
      <p style={{ color: '#88d5ee', letterSpacing: 2, fontSize: 12 }}>OMNIRA · ISOLERAT AWS-TEST</p>
      <h1 style={{ fontSize: 28, marginTop: 12 }}>Vercel → AWS OIDC</h1>
      <p>Kontrollera att Preview-miljön kan anta IAM-rollen Omnira-Bedrock-Test via tillfälliga AWS-behörigheter.</p>
      <p><strong>Det första steget gör inget Bedrock-anrop. Inga befintliga AWS-nycklar ändras.</strong></p>
      <button
        type="button"
        disabled={busy || novaBusy}
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
      <section style={{ borderTop: '1px solid #3f577c', marginTop: 26, paddingTop: 20 }}>
        <h2 style={{ fontSize: 20 }}>Steg 2: minimalt Nova Micro-test</h2>
        <p>Klicka en gång för ett riktigt Bedrock-anrop. Fast testtext, max 48 utdata-tokens, inga andra modeller eller produktionsflöden. Anropet kan kosta en mycket liten summa och dras från krediter om det är berättigat.</p>
        <button
          type="button"
          disabled={!verified || busy || novaBusy || novaResult !== null}
          onClick={runNova}
          style={{ padding: '12px 18px', borderRadius: 10, cursor: !verified || novaBusy ? 'not-allowed' : 'pointer', color: '#041225', background: '#a7efa0', border: 'none', fontWeight: 700, opacity: verified && !novaResult ? 1 : 0.55 }}
        >
          {novaBusy ? 'Anropar Nova Micro…' : 'Kör ett Nova Micro-test'}
        </button>
        <div role="status" aria-live="polite" style={{ marginTop: 15 }}>
          {novaResult && (novaSuccess
            ? <p>Godkänt! <strong>{novaResult.answer}</strong> · indata {novaResult.inputTokens ?? '–'} tokens · utdata {novaResult.outputTokens ?? '–'} tokens.</p>
            : <p>Modelltest inte verifierat: {novaResult.status}{novaResult.reason ? ' (' + novaResult.reason + ')' : ''}{novaResult.diagnostic ? ' – diagnos: ' + novaResult.diagnostic : ''}. Inga produktionsändringar.</p>)}
        </div>
      </section>
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 28 }}>Tillfällig pilotsida · Endast feat/omnira-bedrock-pilot-20261116 · Ska tas bort efter test.</p>
    </main>
  )
}
