'use client'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { acceptDraft, prepareFeedback, type BuildDraft } from '@/lib/website-build/client-state'
import { buildFetch, useBuildSession } from '@/lib/website-build/use-build-session'
import type { BuildSessionView, PreviewRevision, WebsiteArtifact } from '@/lib/website-build/types'
import { BuildConversation } from './BuildConversation'
import { BuildControls } from './BuildControls'
import { BuildPreview } from './BuildPreview'
import styles from './BuildWorkspace.module.css'
import { useAtlas } from '@/lib/atlas/runtime'
const statusLabels = { queued: 'I kö', interpreting: 'Tolkar feedback', building: 'Bygger', validating: 'Kontrollerar', ready: 'Preview klar', awaiting_decision: 'Behöver besked', pausing: 'Pausar', paused: 'Pausad', cancelling: 'Avbryter', cancelled: 'Avbruten', failed: 'Bygget misslyckades' }
const emptyDraft: BuildDraft = { text: '', inputSource: 'text', pending: null }
export function BuildWorkspace({ initialSession, projectSlug, userId, brief }: { initialSession: BuildSessionView; projectSlug: string; userId: string; brief?: string }) {
  const atlas = useAtlas(), atlasRef = useRef(atlas)
  atlasRef.current = atlas
  const capture = useRef<(() => void) | null>(null), speaking = useRef(false)
  const [capturing, setCapturing] = useState(false), [voiceError, setVoiceError] = useState('')
  const { session, connection, submitFeedback, requestControl } = useBuildSession(initialSession, initialSession)
  const [draft, setDraft] = useState<BuildDraft>(emptyDraft), [hydrated, setHydrated] = useState(false)
  const [sending, setSending] = useState(false), [error, setError] = useState('')
  const [selected, setSelected] = useState(session.activePreviewRevisionId)
  const [loaded, setLoaded] = useState<{ artifact: WebsiteArtifact; revision: PreviewRevision } | null>(null)
  const [previewError, setPreviewError] = useState(''), [pageKey, setPageKey] = useState('index')
  const [mobile, setMobile] = useState(false), [tab, setTab] = useState<'atlas' | 'preview'>('atlas'), [split, setSplit] = useState(38)
  const active = useRef(session.activePreviewRevisionId), cache = useRef(new Map<string, WebsiteArtifact>())
  const root = useRef<HTMLDivElement>(null), mounted = useRef(true), draftRef = useRef(draft)
  const storageKey = `atlas-build:${userId}:${session.projectId}:${session.sessionId}`
  useEffect(() => () => { capture.current?.(); if (speaking.current) atlasRef.current.stopAudio() }, [session.sessionId])
  useEffect(() => { if (atlas.captureError) setCapturing(false) }, [atlas.captureError])
  draftRef.current = draft
  useEffect(() => {
    mounted.current = true
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (saved && typeof saved.text === 'string' && saved.text.length <= 4000 && ['text', 'voice'].includes(saved.inputSource)) setDraft(saved) } catch { /* storage unavailable: retain in-memory composer */ }
    setHydrated(true)
    return () => { mounted.current = false }
  }, [storageKey])
  useEffect(() => { if (hydrated) try { localStorage.setItem(storageKey, JSON.stringify(draft)) } catch { /* no storage permission */ } }, [draft, hydrated, storageKey])
  useEffect(() => { const previous = active.current; setSelected(current => !current || current === previous ? session.activePreviewRevisionId : current); active.current = session.activePreviewRevisionId }, [session.activePreviewRevisionId])
  useEffect(() => {
    const revision = session.revisions.find(item => item.id === selected)
    if (!revision) return
    const abort = new AbortController(); setPreviewError('')
    const load = async () => {
      try {
        const artifact = cache.current.get(revision.id) ?? await buildFetch<WebsiteArtifact>(`/api/website-builds/${session.sessionId}/revisions/${revision.id}?projectId=${session.projectId}`, undefined, abort.signal)
        if (abort.signal.aborted) return
        if (artifact.sha256 !== revision.sha256) throw new Error('Previewn kunde inte verifieras.')
        cache.current.set(revision.id, artifact); setLoaded({ artifact, revision }); setPageKey(key => artifact.pages.some(page => page.key === key) ? key : artifact.pages[0].key)
      } catch (error) { if (!abort.signal.aborted) setPreviewError((error as Error).message) }
    }
    void load(); return () => abort.abort()
  }, [selected, session.revisions, session.sessionId, session.projectId])
  const send = async () => {
    if (sending || (!draftRef.current.text.trim() && !draftRef.current.pending)) return
    const prepared = prepareFeedback(draftRef.current, loaded?.revision.id ?? null, crypto.randomUUID())
    setDraft(prepared); draftRef.current = prepared; setSending(true); setError('')
    try { await submitFeedback(prepared.pending!); if (mounted.current) setDraft(current => acceptDraft(current)) }
    catch (error) { if (mounted.current) setError((error as Error).message) } finally { if (mounted.current) setSending(false) }
  }
  const listen = () => {
    setVoiceError(''); setCapturing(true)
    capture.current?.()
    capture.current = atlas.captureUtterance(text => { if (mounted.current) { setDraft(current => ({ ...current, text, inputSource: 'voice' })); setCapturing(false) } })
  }
  const voiceControls = <>
    <button type="button" onClick={() => { if (capturing) { capture.current?.(); setCapturing(false) } else listen() }}>{capturing ? 'Stoppa mikrofon' : 'Prata med Atlas'}</button>
    <button type="button" disabled={!session.feedback.some(item => item.interpretation)} onClick={() => {
      const text = [...session.feedback].reverse().find(item => item.interpretation)?.interpretation
      if (text) { speaking.current = true; setVoiceError(''); void atlas.speakText(text).catch(error => { if (mounted.current) setVoiceError((error as Error).message) }).finally(() => { speaking.current = false }) }
    }}>Läs upp Atlas svar</button>
    <button type="button" onClick={() => atlas.stopAudio()}>Stoppa uppläsning</button>
    {(atlas.captureError || voiceError) && <p role="alert">{atlas.captureError || voiceError}</p>}
  </>
  return <div className={styles.workspace} ref={root} style={{ '--atlas-split': `${split}%` } as CSSProperties}>
    <header className={styles.header}>
      <div><a href={`/projects/${encodeURIComponent(projectSlug)}`}>← Projektet</a><h1>Bygg med Atlas</h1><p role="status"><strong>{statusLabels[session.status]}</strong> · {session.stage}</p></div>
      <BuildControls session={session} requestControl={requestControl} />
      {connection === 'reconnecting' && <p role="alert">Anslutningen återställs. Senast sparade preview och utkast finns kvar.</p>}
    </header>
    <div className={styles.tabs} role="tablist" aria-label="Byggvy"><button role="tab" aria-selected={tab === 'atlas'} onClick={() => setTab('atlas')}>Atlas</button><button role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>Preview</button></div>
    <div className={styles.split}>
      <div className={styles.chatPane} data-mobile-hidden={tab !== 'atlas'}><BuildConversation session={session} brief={brief} draft={draft} setDraft={setDraft} send={() => void send()} sending={sending} error={error} voiceControls={voiceControls} /></div>
      <div className={styles.divider} role="separator" aria-label="Bredd på Atlas-panelen" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={70} aria-valuenow={split} tabIndex={0} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setSplit(value => event.key === 'Home' ? 25 : event.key === 'End' ? 70 : Math.max(25, Math.min(70, value + (event.key === 'ArrowRight' ? 2 : -2)))) } }} onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const bounds = root.current!.getBoundingClientRect(); setSplit(Math.max(25, Math.min(70, 100 * (event.clientX - bounds.left) / bounds.width))) }} onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} />
      <section className={styles.previewPane} data-mobile-hidden={tab !== 'preview'} aria-label="Preview">
        <div className={styles.toolbar}>
          <label>Version <select aria-label="Version" value={selected ?? ''} onChange={event => setSelected(event.target.value)}><option value="" disabled>Ingen ännu</option>{session.revisions.map(revision => <option key={revision.id} value={revision.id}>Version {revision.number}</option>)}</select></label>
          {loaded && <><label>Sida <select aria-label="Sida" value={pageKey} onChange={event => setPageKey(event.target.value)}>{loaded.artifact.pages.map(page => <option key={page.key} value={page.key}>{page.title}</option>)}</select></label><button onClick={() => setMobile(value => !value)}>{mobile ? 'Desktopbredd' : 'Mobilbredd'}</button><a href={`/api/website-builds/${session.sessionId}/revisions/${loaded.revision.id}/export?projectId=${session.projectId}`}>Ladda ner ZIP</a></>}
        </div>
        <p className={styles.version}>{loaded ? `Visar version ${loaded.revision.number} · ${new Date(loaded.revision.createdAt).toLocaleString('sv-SE')}` : 'Första previewn visas när en version är validerad.'}{loaded && selected !== loaded.revision.id ? ' · Hämtar vald version…' : ''}</p>
        {previewError && <p role="alert">{previewError} Senast fungerande preview visas.</p>}
        <div className={styles.canvas}>{loaded ? <BuildPreview artifact={loaded.artifact} revision={loaded.revision} pageKey={pageKey} onPageChange={setPageKey} mobile={mobile} /> : <div className={styles.empty}>Din idé blir en hemsida här.<br />Du kan fortsätta prata med Atlas under tiden.</div>}</div>
        {loaded?.artifact.integrationNeeds.map((need, index) => <p key={index} className={styles.version}>{need === 'form_delivery' ? 'Formuläret behöver en ansluten mottagare innan meddelanden kan skickas.' : need}</p>)}
        <p className={styles.version}>Statiskt webbpaket. Publicering och externa integrationer hanteras separat.</p>
      </section>
    </div>
  </div>
}
