'use client'
import { useEffect, useRef, useState, type FormEvent } from 'react'

type Preflight = { status: string; reason?: string; sourceCount?: number;
  promptBytes?: number; upperGrossUsdBeforeCredits?: number }
type SavedOption = { id: string; title: string; status: string;
  generatedAt: string | null; hasPrimarySource: boolean }
type SavedDetail = { id: string; projectId: string; title: string;
  script: string; status: string; primaryUrl: string | null;
  primarySourceName: string | null; aiNewsSummary: string | null;
  sourceExcerpt: null; secondSourceAvailable: false; sourcesVerified: false }
type LibraryResponse = { ok: boolean; reason?: string; projectId?: string;
  projectName?: string; items?: SavedOption[]; item?: SavedDetail }

const reasonText: Record<string, string> = {
  not_isolated_preview: 'Sidan fungerar endast i vår tillfälliga AWS Preview-gren.',
  origin_denied: 'Förfrågan måste komma från samma Preview-sida.',
  operator_required: 'Du måste vara inloggad som Omniras plattformoperatör.',
  project_access_denied: 'Du saknar behörighet till projektet.',
  prompt_not_owned: 'The Prompt finns inte bland de projekt som ditt konto äger.',
  operator_or_project_denied: 'Din operatörs- eller projektbehörighet kunde inte verifieras.',
  operator_or_project_access_denied: 'Inloggad plattformoperatör och ägarskap krävs.',
  invalid_project: 'Projekt-ID från databasen kunde inte verifieras.',
  hard_spend_gate_required: 'Omniras hårda budgetspärr är inte aktiverad för Preview.',
  script_not_bounded: 'Manuset saknas eller är längre än 4096 byte.',
  source_excerpt_count_invalid: 'Två källor med riktiga utdrag krävs.',
  source_excerpt_invalid: 'Ange giltiga HTTPS-länkar och egna kontrollerade utdrag.',
  source_duplicate: 'Källorna måste vara olika.',
  output_not_bounded: 'Svarslängden måste vara 1–256 tokens.',
  input_not_bounded: 'Granskningsunderlaget är för stort.',
  sources_unavailable: 'De sparade nyhetskällorna kunde inte läsas.',
  scripts_unavailable: 'De sparade manusen kunde inte läsas.',
  project_unavailable: 'Projektet kunde inte läsas just nu.',
  script_not_found: 'Manuset kunde inte hittas i The Prompt.',
}
const field = { border: '1px solid #466080', background: '#172a49', color: '#fff',
  borderRadius: 8, padding: 10, width: '100%', boxSizing: 'border-box' } as const
const label = { display: 'block', fontWeight: 600, marginTop: 15, marginBottom: 7 } as const
const muted = { fontSize: 13, color: '#bed0e3' } as const

async function readSaved(kind: 'list' | 'detail', scriptId?: string): Promise<LibraryResponse> {
  const res = await fetch('/api/bedrock-review-library', {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(kind === 'detail' ? { kind, scriptId } : { kind }),
  })
  return (await res.json()) as LibraryResponse
}

export default function BedrockReviewPage() {
  const [projectId, setProjectId] = useState('')
  const [projectName, setProjectName] = useState('')
  const [options, setOptions] = useState<SavedOption[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const [loadedTitle, setLoadedTitle] = useState('')
  const [summary, setSummary] = useState<string | null>(null)
  const [script, setScript] = useState('')
  const [url1, setUrl1] = useState('')
  const [excerpt1, setExcerpt1] = useState('')
  const [url2, setUrl2] = useState('')
  const [excerpt2, setExcerpt2] = useState('')
  const [tokens, setTokens] = useState('64')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Preflight | null>(null)
  const chosenSeq = useRef(0)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const data = await readSaved('list')
        if (!live) return
        if (!data.ok || !data.projectId || !Array.isArray(data.items)) {
          setLibraryError(reasonText[data.reason ?? ''] ?? data.reason ?? 'Biblioteket är inte tillgängligt.')
          return
        }
        setProjectId(data.projectId)
        setProjectName(data.projectName ?? 'The Prompt')
        setOptions(data.items)
      } catch {
        if (live) setLibraryError('Kunde inte läsa de sparade manusen.')
      } finally {
        if (live) setLoadingList(false)
      }
    })()
    return () => { live = false }
  }, [])

  async function choose(id: string) {
    const seq = ++chosenSeq.current
    setSelected(id)
    setResult(null)
    setLibraryError('')
    // Clear old data before starting a different selection, preventing mixed sources.
    setScript(''); setLoadedTitle(''); setSummary(null)
    setUrl1(''); setExcerpt1(''); setUrl2(''); setExcerpt2('')
    if (!id) return
    setLoadingDetail(true)
    try {
      const data = await readSaved('detail', id)
      if (seq !== chosenSeq.current) return
      if (!data.ok || !data.item || data.projectId !== projectId ||
          data.item.projectId !== projectId || data.item.id !== id) {
        setLibraryError(reasonText[data.reason ?? ''] ?? data.reason ?? 'Manuset kunde inte laddas.')
        return
      }
      setLoadedTitle(data.item.title)
      setScript(data.item.script)
      setUrl1(data.item.primaryUrl ?? '')
      setSummary(data.item.aiNewsSummary)
      // Neither the primary source's excerpt nor a second independent source
      // is stored as verified text. Never manufacture a quote or secondary URL.
    } catch {
      if (seq === chosenSeq.current) setLibraryError('Manuset kunde inte hämtas.')
    } finally {
      if (seq === chosenSeq.current) setLoadingDetail(false)
    }
  }

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/bedrock-review-preflight', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId, script,
          sources: [{ url: url1.trim(), excerpt: excerpt1 },
            { url: url2.trim(), excerpt: excerpt2 }],
          maxOutputTokens: Number(tokens),
        }),
      })
      setResult((await res.json()) as Preflight)
    } catch { setResult({ status: 'refused', reason: 'network_unavailable' }) }
    finally { setBusy(false) }
  }

  const candidates = options.filter(item => {
    const filter = search.trim().toLowerCase()
    return !filter || item.title.toLowerCase().includes(filter) ||
      item.status.toLowerCase().includes(filter)
  })
  const readyToReview = !!projectId && !!selected && !loadingList && !loadingDetail
  return (
    <main style={{ maxWidth: 730, margin: '5vh auto', padding: 26, borderRadius: 16,
      background: '#10213a', color: '#e8f3ff', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontSize: 12, letterSpacing: 2, color: '#79d4fa' }}>OMNIRA / THE PROMPT · ISOLERAD PREVIEW</p>
      <h1 style={{ fontSize: 26 }}>Manuell nyhetsgranskning – förhandskontroll</h1>
      <p>Välj ett sparat manus så hämtas rätt projekt, manustext och primär källänk automatiskt från The Prompt.</p>
      <p style={{ color: '#b7eda9', fontWeight: 700 }}>
        Ingen text skickas till AWS, ingen AI-modell körs, ingen kostnad reserveras och inget publiceras.
      </p>

      <section style={{ padding: 15, border: '1px solid #405f7b', borderRadius: 10 }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>1. Hämta ett sparat manus</h2>
        {loadingList ? <p>Läser The Prompts sparade manus…</p> : null}
        {libraryError ? <p style={{ color: '#ffb9ac' }} role="alert">{libraryError}</p> : null}
        {projectId ? (
          <>
            <p style={muted}>Verifierat projekt: <strong>{projectName}</strong></p>
            <label style={label} htmlFor="review-search">Sök bland de senaste 60 manusen</label>
            <input id="review-search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Till exempel Google, AI eller skolor" style={field} />
            <label htmlFor="review-saved-script" style={label}>Välj ett manus</label>
            <select id="review-saved-script" style={field} value={selected}
              disabled={loadingDetail} onChange={e => { void choose(e.target.value) }}>
              <option value="">Välj sparat manus…</option>
              {candidates.map(item => (
                <option key={item.id} value={item.id}>
                  {item.title} · {item.generatedAt?.slice(0, 10) ?? 'okänt datum'} · {item.status}
                </option>
              ))}
            </select>
            {loadingDetail ? <p>Hämtar manus och källänk…</p> : null}
            {loadedTitle ? (
              <p style={{ color: '#a9f2a6' }}>
                Hämtat: <strong>{loadedTitle}</strong>. Originalmanus och sparad källänk är inlästa.
              </p>
            ) : null}
            {options.length === 0 ? <p>Inga sparade manus hittades för projektet.</p> : null}
          </>
        ) : null}
      </section>

      <form onSubmit={check}>
        <label htmlFor="review-project" style={label}>Projekt-ID – automatiskt från Omnira</label>
        <input id="review-project" required readOnly value={projectId}
          placeholder="Hämtas efter behörighetskontroll" style={field}/>
        <label htmlFor="review-script" style={label}>Nyhetsmanus – hämtat från det valda manuset</label>
        <textarea id="review-script" rows={5} required value={script}
          onChange={e => { setScript(e.target.value); setResult(null) }}
          placeholder="Välj ett sparat manus ovan" style={field}/>
        <h2 style={{ fontSize: 19, marginTop: 22 }}>2. Kontrollera källutdragen</h2>
        <p style={muted}>Databasen har normalt bara en primär källänk. Den har inga verifierade artikelcitat eller någon säker andra källa. Fyll därför i utdragen från artiklar du faktiskt läst.</p>
        {summary ? (
          <details style={{ marginTop: 10, color: '#bcd2e7' }}>
            <summary>Visa sparad AI-sammanfattning (inte ett verifierat källutdrag)</summary>
            <p>{summary}</p>
          </details>
        ) : null}
        <label htmlFor="review-url1" style={label}>Källa 1 – länk hämtad från nyhetsposten</label>
        <input id="review-url1" type="url" required value={url1}
          onChange={e => { setUrl1(e.target.value); setResult(null) }}
          placeholder="Ingen primärkälla sparad – lägg till en verifierad HTTPS-länk"
          style={field}/>
        <label htmlFor="review-excerpt1" style={label}>Källa 1 – kontrollerat artikelutdrag</label>
        <textarea id="review-excerpt1" rows={3} required value={excerpt1}
          onChange={e => { setExcerpt1(e.target.value); setResult(null) }}
          placeholder="Klistra in ett kort utdrag ur originalartikeln" style={field}/>
        <label htmlFor="review-url2" style={label}>Källa 2 – oberoende HTTPS-länk</label>
        <input id="review-url2" type="url" required value={url2}
          onChange={e => { setUrl2(e.target.value); setResult(null) }}
          placeholder="Här behövs en andra kontrollerad källa"
          style={field}/>
        <label htmlFor="review-excerpt2" style={label}>Källa 2 – kontrollerat artikelutdrag</label>
        <textarea id="review-excerpt2" rows={3} required value={excerpt2}
          onChange={e => { setExcerpt2(e.target.value); setResult(null) }} style={field}/>
        <label htmlFor="review-tokens" style={label}>Max svarslängd i tokens (1–256)</label>
        <input id="review-tokens" type="number" min={1} max={256} required
          value={tokens} onChange={e => { setTokens(e.target.value); setResult(null) }}
          style={{ ...field, maxWidth: 160 }}/>
        <div style={{ marginTop: 24 }}>
          <button type="submit" disabled={busy || !readyToReview} style={{
            background: '#80dbfa', color: '#0c2340', padding: '12px 18px',
            borderRadius: 9, fontWeight: 700, border: 'none',
            cursor: busy ? 'wait' : 'pointer', opacity: readyToReview ? 1 : 0.55,
          }}>
            {busy ? 'Kontrollerar…' : 'Kontrollera utan AI-anrop'}
          </button>
        </div>
      </form>

      <section aria-live="polite" role="status" style={{ marginTop: 24 }}>
        {result && (result.status === 'preflight_passed' ? (
          <div style={{ borderTop: '1px solid #557290', paddingTop: 12 }}>
            <h2 style={{ fontSize: 19, color: '#a3f0a7' }}>Förhandskontroll godkänd</h2>
            <p>Behörighet verifierad. {result.sourceCount} källor och {result.promptBytes} byte granskningsunderlag.</p>
            <p>Bruttokostnadstak: ca {(result.upperGrossUsdBeforeCredits ?? 0).toFixed(6)} USD före krediter.</p>
            <p><strong>AI-anrop: Nej · Budgetreservation: Nej · Publicering: Nej</strong></p>
          </div>
        ) : result.status === 'preflight_blocked' ? (
          <div style={{ borderTop: '1px solid #557290', paddingTop: 12 }}>
            <h2 style={{ color: '#ffd39a', fontSize: 19 }}>Underlaget godkänt – betald körning blockerad</h2>
            <p>Behörighet och format godkända: {result.sourceCount} källor, {result.promptBytes} byte.</p>
            <p>Bruttokostnadstak: ca {(result.upperGrossUsdBeforeCredits ?? 0).toFixed(6)} USD. Ingen reservation gjord.</p>
            <p><strong>Den hårda budgetspärren är inte aktiv. AI-anrop och publicering förblir blockerade.</strong></p>
          </div>
        ) : (
          <p style={{ color: '#ffb9ac' }}>Förhandskontrollen stoppades: {reasonText[result.reason ?? ''] ?? result.reason ?? 'okänt fel'}. Ingen modell kördes.</p>
        ))}
      </section>
      <p style={{ fontSize: 12, color: '#a7bdd2', marginTop: 26 }}>
        Denna sida verifierar inte nyhetsfakta, krediter eller rätt att publicera. De sparade källänkarna är referenser, inte bevis på källans innehåll.
      </p>
    </main>
  )
}
