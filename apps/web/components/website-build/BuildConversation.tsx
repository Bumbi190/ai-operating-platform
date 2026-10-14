'use client'
import type { BuildDraft } from '@/lib/website-build/client-state'
import type { BuildSessionView } from '@/lib/website-build/types'
import styles from './BuildWorkspace.module.css'
const feedbackLabels = { received: 'Mottagen', acknowledged: 'Förstådd', applied: 'Införd', rejected: 'Avvisad', superseded: 'Ersatt' }
export function BuildConversation({ session, brief, draft, setDraft, send, sending, error, voiceControls }: { session: BuildSessionView; brief?: string; draft: BuildDraft; setDraft: (value: BuildDraft | ((current: BuildDraft) => BuildDraft)) => void; send: () => void; sending: boolean; error: string; voiceControls?: React.ReactNode }) {
  return <section className={styles.conversation} aria-label="Samtal med Atlas">
    <h2>Atlas</h2>
    <div className={styles.messages}>
      {brief && <article className={styles.message}><strong>Din idé</strong><p>{brief}</p></article>}
      <article className={styles.message}><strong>Atlas</strong><p>Här kan du ge feedback medan jag bygger. Mottagen betyder sparad. Införd visar vilken version som innehåller ändringen.</p></article>
      {session.feedback.map(item => <article key={item.id} className={styles.message}>
        <strong>Du{item.inputSource === 'voice' ? ' · röst' : ''}</strong><p>{item.text}</p>
        <p className={styles.receipt}>{feedbackLabels[item.status]}{item.appliedRevisionId ? ` · version ${session.revisions.find(revision => revision.id === item.appliedRevisionId)?.number ?? '?'}` : ''}</p>
        {item.interpretation && <p><strong>Atlas:</strong> {item.interpretation}</p>}
      </article>)}
    </div>
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); send() }}>
      <label htmlFor="build-feedback">{draft.inputSource === 'voice' ? 'Redigera rösttranskript' : 'Feedback till Atlas'}</label>
      <textarea id="build-feedback" value={draft.text} maxLength={4000} rows={4} placeholder="Gör rubriken större, lägg till en kontaktsida…" onChange={event => setDraft(current => ({ ...current, text: event.target.value }))} />
      <div className={styles.composerActions}>{voiceControls}<button type="submit" disabled={sending || (!draft.text.trim() && !draft.pending) || session.status === 'cancelled'}>{sending ? 'Sparar…' : draft.pending ? 'Försök skicka igen' : 'Skicka'}</button></div>
      <small>Feedback gäller previewn du ser. Texten kan redigeras under bygget.</small>
      {error && <p role="alert">{error} Ditt utkast finns kvar.</p>}
    </form>
  </section>
}
