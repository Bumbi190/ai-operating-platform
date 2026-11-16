'use client'
import { useState, type FormEvent } from 'react'

type Result = { status: string; reason?: string; sourceCount?: number;
  promptBytes?: number; upperGrossUsdBeforeCredits?: number }
const labels: Record<string, string> = {
  not_isolated_preview: 'Endast den isolerade AWS Preview-grenen är tillåten.',
  origin_denied: 'Begäran måste komma från samma Preview-sida.',
  operator_or_project_access_denied: 'Inloggad plattformoperatör och projektägarskap krävs.',
  invalid_project: 'Ange rätt projekt-UUID från Omnira.',
  hard_spend_gate_required: 'Omniras hårda kostnadsspärr är inte aktiverad i Preview.',
  script_not_bounded: 'Manuset saknas eller är för långt (max 4096 byte).',
  source_excerpt_count_invalid: 'Två källor och deras utdrag krävs.',
  source_excerpt_invalid: 'Ange giltiga HTTPS-källor och korta utdrag.',
  source_duplicate: 'Källorna ska vara olika.',
  output_not_bounded: 'Max tokens måste vara 1–256.',
  input_not_bounded: 'Det samlade underlaget är för långt.',
}
const field = { border: '1px solid #466080', background: '#172a49', color: '#fff',
  borderRadius: 8, padding: 10, width: '100%', boxSizing: 'border-box' } as const
const label = { display: 'block', fontWeight: 600, marginTop: 15, marginBottom: 7 } as const

export default function BedrockReviewPage() {
  const [projectId, setProjectId] = useState('')
  const [script, setScript] = useState('')
  const [url1, setUrl1] = useState('')
  const [excerpt1, setExcerpt1] = useState('')
  const [url2, setUrl2] = useState('')
  const [excerpt2, setExcerpt2] = useState('')
  const [tokens, setTokens] = useState('64')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setResult(null)
    try {
      const response = await fetch('/api/bedrock-review-preflight', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId.trim(), script,
          sources: [
            { url: url1.trim(), excerpt: excerpt1 },
            { url: url2.trim(), excerpt: excerpt2 },
          ],
          maxOutputTokens: Number(tokens),
        }),
      })
      setResult((await response.json()) as Result)
    } catch { setResult({ status: 'refused', reason: 'network_unavailable' }) }
    finally { setBusy(false) }
  }
  return (
    <main style={{ maxWidth: 730, margin: '5vh auto', padding: 26, borderRadius: 16,
      background: '#10213a', color: '#e8f3ff', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontSize: 12, letterSpacing: 2, color: '#79d4fa' }}>OMNIRA / THE PROMPT · PREVIEW</p>
      <h1 style={{ fontSize: 26 }}>Manuell nyhetsgranskning – förhandskontroll</h1>
      <p>Fyll i ett manus och två källutdrag. Kontrollera att projektet har rätt behörighet och att underlaget ryms inom våra säkra gränser.</p>
      <p style={{ color: '#b7eda9', fontWeight: 700 }}>
        Ingen text skickas till AWS, ingen AI-modell körs, ingen kostnad reserveras och inget publiceras.
      </p>
      <form onSubmit={check}>
        <label htmlFor="review-project" style={label}>Projekt-ID (UUID)</label>
        <input id="review-project" required value={projectId}
          onChange={e => { setProjectId(e.target.value); setResult(null) }}
          placeholder="Projekt-ID från Omnira" style={field}/>
        <label htmlFor="review-script" style={label}>Nyhetsmanus</label>
        <textarea id="review-script" rows={5} required value={script}
          onChange={e => { setScript(e.target.value); setResult(null) }}
          style={field}/>
        <h2 style={{ fontSize: 19, marginTop: 22 }}>Källor och utdrag</h2>
        <p style={{ fontSize: 13, color: '#b1c6db' }}>Källadresserna hämtas inte automatiskt. Ange korta utdrag du själv har kontrollerat.</p>
        <label htmlFor="review-url1" style={label}>Källa 1 – HTTPS-adress</label>
        <input id="review-url1" type="url" required value={url1}
          onChange={e => { setUrl1(e.target.value); setResult(null) }}
          placeholder="https://..." style={field}/>
        <label htmlFor="review-excerpt1" style={label}>Källa 1 – utdrag</label>
        <textarea id="review-excerpt1" rows={3} required value={excerpt1}
          onChange={e => { setExcerpt1(e.target.value); setResult(null) }} style={field}/>
        <label htmlFor="review-url2" style={label}>Källa 2 – HTTPS-adress</label>
        <input id="review-url2" type="url" required value={url2}
          onChange={e => { setUrl2(e.target.value); setResult(null) }}
          placeholder="https://..." style={field}/>
        <label htmlFor="review-excerpt2" style={label}>Källa 2 – utdrag</label>
        <textarea id="review-excerpt2" rows={3} required value={excerpt2}
          onChange={e => { setExcerpt2(e.target.value); setResult(null) }} style={field}/>
        <label htmlFor="review-tokens" style={label}>Max svarslängd i tokens (1–256)</label>
        <input id="review-tokens" type="number" required min={1} max={256}
          value={tokens} onChange={e => { setTokens(e.target.value); setResult(null) }}
          style={{ ...field, maxWidth: 160 }}/>
        <div style={{ marginTop: 24 }}>
          <button type="submit" disabled={busy} style={{ background: '#80dbfa', color: '#0c2340',
            padding: '12px 18px', borderRadius: 9, fontWeight: 700, border: 'none',
            cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Kontrollerar…' : 'Kontrollera utan AI-anrop'}
          </button>
        </div>
      </form>
      <section aria-live="polite" role="status" style={{ marginTop: 24 }}>
        {result && (result.status === 'preflight_passed' ? (
          <div style={{ borderTop: '1px solid #557290', paddingTop: 12 }}>
            <h2 style={{ fontSize: 19, color: '#a3f0a7' }}>Förhandskontrollen godkänd</h2>
            <p>Behörighet verifierad. {result.sourceCount} källor och {result.promptBytes} byte granskningsunderlag.</p>
            <p>Konservativt bruttopristak: cirka {(result.upperGrossUsdBeforeCredits ?? 0).toFixed(6)} USD före AWS-krediter.</p>
            <p><strong>AI-anrop: Nej · Budgetreservation: Nej · Publicering: Nej</strong></p>
          </div>
        ) : result.status === 'preflight_blocked' ? (
          <div style={{ borderTop: '1px solid #557290', paddingTop: 12 }}>
            <h2 style={{ fontSize: 19, color: '#ffd39a' }}>Underlaget godkänt – betald körning blockerad</h2>
            <p>Din behörighet och underlagets format har validerats: {result.sourceCount} källor, {result.promptBytes} byte.</p>
            <p>Konservativt bruttotak: cirka {(result.upperGrossUsdBeforeCredits ?? 0).toFixed(6)} USD. Inga pengar har reserverats.</p>
            <p><strong>Hård Omnira-budgetspärr saknas i denna Preview. Vi aktiverar inte modellen förrän den har granskats separat.</strong></p>
            <p>AI-anrop: Nej · Publicering: Nej</p>
          </div>
        ) : (
          <p style={{ color: '#ffb9ac' }}>Förhandskontrollen stoppades: {labels[result.reason ?? ''] ?? result.reason ?? 'okänt fel'}. Ingen modell kördes.</p>
        ))}
      </section>
      <p style={{ fontSize: 12, color: '#a7bdd2', marginTop: 26 }}>
        Detta verifierar inte nyhetsfakta, krediternas faktiska avräkning eller rätt att publicera.
        Endast tillfällig Preview.
      </p>
    </main>
  )
}
