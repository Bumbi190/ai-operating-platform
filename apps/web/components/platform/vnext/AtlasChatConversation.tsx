'use client'

/**
 * Atlas Chat — one conversation.
 *
 * The working surface. It speaks `/api/chat` exactly as the page it replaces
 * did, and every rule that makes that true lives in `lib/os/chat-shared.ts`,
 * where it is tested without a browser:
 *
 *   the request   `buildChatRequestBody({ messages, conversation_id })` — the
 *                 same helper, the same two fields, no voice, no mode.
 *   the history   text only: persisted user and assistant text on load, the
 *                 operator's words on send, the reply's full text on `done`.
 *   the stream    the route's eight events, applied by `applyStreamEvent`.
 *   `?send=`      a launcher's question is sent once, into an empty
 *                 conversation only, after the parameter is removed.
 *   `navigate`    another view → `router.push`; this view → a notice and a link.
 *   `done`        `router.refresh()` after the first exchange, so the title the
 *                 route just wrote reaches the page and the sidebar.
 *
 * What it adds is presentation, and one refusal: a conversation whose history
 * could not be read cannot be continued from here. The route would receive an
 * empty history — and would title the conversation after the new message as if
 * it were the first.
 *
 * There is no stop control. `/api/chat` does not observe a client abort, so
 * closing the stream would leave Atlas running while the page claimed otherwise.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, ArrowRight, ArrowUp, Loader2, Plus } from 'lucide-react'
import { buildChatRequestBody } from '@/lib/atlas/view-client'
import {
  AWAITING_ATLAS,
  COMPOSER_HINT,
  COMPOSER_PLACEHOLDER,
  CONNECTION_FAILED_NOTICE,
  CONVERSATION_STARTERS,
  CREATE_FAILED_NOTICE,
  DISCLAIMER,
  EMPTY_CONVERSATION,
  INCOMPLETE_NOTICE,
  INTERRUPTED_NOTICE,
  INTRO_TITLE,
  TOOL_OUTCOME_LABELS,
  TRANSCRIPT_UNREADABLE,
  applyStreamEvent,
  awaitingAtlas,
  failedResponseNotice,
  hydrateTranscript,
  parseStreamLine,
  readSendParam,
  runSummary,
  splitStreamBuffer,
  startReply,
  textHistory,
  toolDataPreview,
  toolError,
  toolLabel,
  toolOutcome,
  type ChatConversationModel,
  type HistoryMessage,
  type ReplyState,
  type ToolEntry,
  type TranscriptEntry,
} from '@/lib/os/chat-shared'
import styles from './AtlasChat.module.css'
import type {PlanView} from '@/lib/website-build/planning/types'
import type {BuildSessionView} from '@/lib/website-build/types'
import {useOptionalAtlas} from '@/lib/atlas/runtime'
import {useAtlasConversation} from '@/lib/atlas/conversation/provider'
import {useComposerDraft} from '@/lib/atlas/conversation/use-composer-draft'
import {AtlasConversationComposer} from './AtlasConversationComposer'

interface Props {
  model: ChatConversationModel
  plan?:PlanView|null
  initialSession?:BuildSessionView|null
  embedded?:boolean
  mode?:'conversation'|'studio'
  readOnly?:boolean
  canSend?:boolean
  initialTurn?:{token:string;text:string;inputSource:'text'|'voice'}|null
  children?:React.ReactNode
  /**
   * A launcher handed over a question in `?send=`. Read on the server only so
   * the empty state does not flash before the question is sent; the question
   * itself is still read from the address, once, as before.
   */
  asking?: boolean
}

function motionAllowed(): boolean {
  return document.documentElement.getAttribute('data-motion') === 'full'
}

export function AtlasChatConversation({ model, asking = false,plan=null,initialSession=null,embedded=false,children,mode='conversation',readOnly=false,canSend=true,initialTurn=null }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const historyUnreadable = model.state === 'error'
  const blocked = historyUnreadable || readOnly

  const {controller,snapshot}=useAtlasConversation()
  useEffect(()=>{controller.activateConversation({id:model.id,saved:model.saved,state:model.state,projectId:model.projectId,plan,session:initialSession,studio:mode==='studio'})},[controller,model,plan,initialSession,mode])
  const entries=snapshot.id===model.id?snapshot.entries:hydrateTranscript(model.saved)
  const atlas=useOptionalAtlas()
  const draftKey='atlas-chat-draft:'+ (model.operatorId??'session')+':'+model.id
  const draft=useComposerDraft({draftKey,capture:atlas?cb=>atlas.captureUtterance(cb):null,captureError:atlas?.captureError})
  const input=draft.text,inputSource=draft.inputSource
  const pending=snapshot.id===model.id&&snapshot.pending
  const [launchChecked, setLaunchChecked] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createFailed, setCreateFailed] = useState(false)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)
  const shownRef = useRef(0)

  // Follow the conversation only while the operator is at its end.
  useEffect(() => {
    const end = endRef.current
    if (!end || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => { followRef.current = entry.isIntersecting },
      { rootMargin: '0px 0px 320px 0px' },
    )
    observer.observe(end)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!followRef.current) return
    const first = shownRef.current === 0
    const grew = entries.length !== shownRef.current
    shownRef.current = entries.length
    endRef.current?.scrollIntoView({ block: 'end', behavior: !first && grew && motionAllowed() ? 'smooth' : 'auto' })
  }, [entries, pending])

  const send = useCallback(async (raw:string,source:'text'|'voice'=inputSource) => {
    const text=raw.trim()
    if(!text||controller.snapshot().pending||blocked||!canSend)return
    if(inputRef.current){inputRef.current.style.height='';inputRef.current.style.overflowY=''}
    followRef.current=true
    const result=await controller.sendTurn({conversationId:model.id,text,inputSource:source,onEvent:event=>{
      const step=applyStreamEvent(startReply([]),event,pathname)
      if(step.effect.type==='navigate')router.push(step.effect.href)
      if(step.effect.type==='timing')console.log(`[chat-mode] ${step.effect.reqType} · första token ${step.effect.firstTokenMs}ms · totalt ${step.effect.serverTotalMs}ms`)
      if(event.event==='done'&&controller.snapshot().history.filter(m=>m.role==='user').length===1)router.refresh()
    }})
    if(result.ok)draft.clear()
    if(window.matchMedia?.('(pointer: fine)').matches)inputRef.current?.focus()
  },[blocked,controller,model.id,pathname,router,inputSource,canSend,draft.clear])
  useEffect(()=>{if(snapshot.id===model.id&&snapshot.speechDraft!==null){draft.setText(snapshot.speechDraft,'voice');controller.clearSpeechDraft();inputRef.current?.focus()}},[snapshot.id,snapshot.speechDraft,model.id])

  const firstTurnSent=useRef<string|null>(null)
  useEffect(()=>{if(initialTurn&&firstTurnSent.current!==initialTurn.token&&canSend&&!blocked){firstTurnSent.current=initialTurn.token;void send(initialTurn.text,initialTurn.inputSource)}},[initialTurn,canSend,blocked,send])

  // A launcher's question (`?send=`): sent once, into an empty conversation only,
  // after the parameter is removed from the address — as before.
  const autoSent = useRef(false)
  useEffect(() => {
    if (autoSent.current) return
    autoSent.current = true
    const question = model.saved.length === 0 && !blocked ? readSendParam(window.location.search) : null
    if (question) {
      window.history.replaceState({}, '', window.location.pathname)
      void send(question)
    }
    setLaunchChecked(true)
  }, [blocked, model.saved.length, send])

  async function startNew() {
    if (creating) return
    setCreating(true)
    setCreateFailed(false)
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const conv = (await res.json().catch(() => null)) as { id?: string } | null
      if (conv?.id) {
        router.push(`${model.chatBase}/${conv.id}`)
        return
      }
    } catch {
      // Reported below.
    }
    setCreateFailed(true)
    setCreating(false)
  }

  const waiting = awaitingAtlas(entries, pending)
  const showIntro = !blocked && !plan && !initialSession && entries.length === 0 && !pending && (launchChecked || !asking)

  return (
    <div className={(embedded?`${styles.field} ${styles.embedded}`:styles.field)+(mode==='studio'?' '+styles.studio:'')}>
      <div className={styles.conversation} data-state={model.state}>
        <header className={styles.convHeader} hidden={mode==='studio'}>
          <Link href={model.chatBase} className={styles.back}>
            <ArrowLeft aria-hidden />
            Alla konversationer
          </Link>
          <div className={styles.convIdentity}>
            <h1 className={styles.convTitle}>{model.title}</h1>
            {model.projectName && <p className={styles.convMeta}>{model.projectName}</p>}
          </div>
          <button type="button" className={styles.newConversation} onClick={() => void startNew()} disabled={creating}>
            {creating ? <Loader2 className={styles.spin} aria-hidden /> : <Plus aria-hidden />}
            Ny konversation
          </button>
          {createFailed && <p className={styles.formError} role="status">{CREATE_FAILED_NOTICE}</p>}
        </header>

        <div className={embedded?styles.embeddedScroll:styles.plainBody} data-embedded-scroll={embedded||undefined}>
        {children}
        {historyUnreadable ? (
          <p className={styles.blocked} role="note">{TRANSCRIPT_UNREADABLE}</p>
        ) : (
          <>
            {showIntro && (
              <section className={styles.intro} aria-labelledby="atlas-chat-intro" data-intro>
                <h2 id="atlas-chat-intro" className={styles.introTitle}>{mode==='studio'?'Bygg vidare tillsammans med Atlas':INTRO_TITLE}</h2>
                <p className={styles.introText}>{mode==='studio'?'Beskriv önskemålen och planera innan Atlas bygger.':EMPTY_CONVERSATION}</p>
                <ul className={styles.starters} aria-label="Förslag">
                  {(mode==='studio'?['Beskriv din hemsida','Förbättra en befintlig sida','Använd en referens']:CONVERSATION_STARTERS).map((starter) => (
                    <li key={starter}>
                      <button type="button" className={styles.starter} onClick={() => mode==='studio'?draft.setText(starter):void send(starter)}>
                        {starter}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {entries.length > 0 && (
              <ol className={styles.transcript} aria-label="Konversation" aria-busy={pending}>
                {entries.map((entry, index) => <ChatEntry key={index} entry={entry} />)}
              </ol>
            )}

            {waiting && (
              <p className={styles.pending} role="status">
                <span className={styles.pendingDots} aria-hidden><span /><span /><span /></span>
                {AWAITING_ATLAS}
              </p>
            )}
          </>
        )}

        <div ref={endRef} className={styles.endAnchor} aria-hidden />
        </div>

        <AtlasConversationComposer value={input} onChange={draft.setText} onSend={()=>void send(input)} disabled={!!pending||blocked} sendDisabled={!canSend} pending={!!pending} capturing={draft.capturing} onVoice={draft.toggleCapture} onStopSpeech={()=>atlas?.stopAudio()} inputSource={inputSource} captureAvailable={!!atlas} captureError={atlas?.captureError} inputRef={inputRef}/>
      </div>
    </div>
  )
}

/** One transcript entry. Exported for the tests; the conversation is its only caller. */
export function ChatEntry({ entry }: { entry: TranscriptEntry }) {
  switch (entry.kind) {
    case 'user':
      return (
        <li className={styles.entry} data-kind="user">
          <div className={styles.userBubble}>
            <span className={styles.srOnly}>Du: </span>
            <p className={styles.userText}>{entry.text}</p>
          </div>
        </li>
      )

    case 'assistant':
      return (
        <li className={styles.entry} data-kind="assistant">
          <span className={styles.atlasMark} aria-hidden />
          <div className={styles.body}>
            <span className={styles.srOnly}>Atlas: </span>
            <div className={styles.markdown}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.text}</ReactMarkdown>
            </div>
          </div>
        </li>
      )

    case 'tool':
      return (
        <li className={styles.entry} data-kind="tool">
          <ToolStep entry={entry} />
        </li>
      )

    case 'links':
      return (
        <li className={styles.entry} data-kind="links">
          <ul className={styles.chips} aria-label="Genvägar">
            {entry.links.map((link) => (
              <li key={`${link.id}-${link.href}`}>
                <Link href={link.href} className={styles.chip}>
                  <span>{link.label}</span>
                  <ArrowRight aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </li>
      )

    case 'notice':
      return (
        <li className={styles.entry} data-kind="notice">
          <p className={styles.notice} data-tone={entry.tone} role={entry.tone === 'error' ? 'alert' : 'status'}>
            {entry.tone === 'error' && <span className={styles.srOnly}>Fel: </span>}
            {entry.text}
          </p>
        </li>
      )
  }
}

function ToolStep({ entry }: { entry: ToolEntry }) {
  const outcome = toolOutcome(entry)
  const error = outcome === 'failed' ? toolError(entry) : null
  const run = runSummary(entry)
  const preview = entry.resolved ? toolDataPreview(entry.result) : null
  return (
    <div className={styles.step} data-outcome={outcome} data-tool={entry.tool}>
      <span className={styles.stepDot} aria-hidden />
      <span className={styles.stepLabel}>{toolLabel(entry.tool)}</span>
      <span className={styles.stepOutcome}>{TOOL_OUTCOME_LABELS[outcome]}</span>
      {run && <code className={styles.stepCode}>{run}</code>}
      {error && <p className={styles.stepError}>{error}</p>}
      {preview && (
        <details className={styles.stepData}>
          <summary className={styles.stepSummary}>Visa data</summary>
          <pre className={styles.stepPre}>{preview}</pre>
        </details>
      )}
    </div>
  )
}

export function AtlasChatConversationLoading() {
  return (
    <div className={styles.field}>
      <div className={styles.conversation}>
        <header className={styles.convHeader}>
          <div className={styles.convIdentity}>
            <p className={styles.convTitle}>Läser konversationen…</p>
          </div>
        </header>
      </div>
    </div>
  )
}
