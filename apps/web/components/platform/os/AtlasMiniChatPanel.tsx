'use client'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent
} from 'react'
import { Minus, Phone, PhoneOff, ArrowUp } from 'lucide-react'
import Link from 'next/link'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { OMNIRA_MARK_POINTS } from '@/components/platform/OmniraLogo'
import { useAtlasConversation } from '@/lib/atlas/conversation/provider'
import { useAtlas } from '@/lib/atlas/runtime'
import {
  clampMiniChat,
  type Point,
  type Viewport
} from '@/lib/atlas/mini-chat/geometry'
import styles from './AtlasMiniChatPanel.module.css'
type Props = {
  onMinimize: () => void
  draft: string
  onDraftChange: (text: string) => void
  position: Point | null
  onPositionChange: (point: Point) => void
  initialProjectId: string | null
}
const markdownComponents: Components = {
  a({ href, children, node: _node, ref: _ref, ...props }) {
    if (!href) return <span>{children}</span>
    if (href.startsWith('/') && !href.startsWith('//'))
      return (
        <Link {...props} href={href}>
          {children}
        </Link>
      )
    return (
      <a
        {...props}
        href={href}
        rel="noopener noreferrer"
        target={href.startsWith('#') ? undefined : '_blank'}
      >
        {children}
      </a>
    )
  }
}
export function AtlasMiniChatPanel({
  onMinimize,
  draft,
  onDraftChange,
  position,
  onPositionChange,
  initialProjectId
}: Props): JSX.Element {
  const atlas = useAtlas(),
    { controller, snapshot } = useAtlasConversation()
  const panel = useRef<HTMLDivElement>(null),
    editor = useRef<HTMLTextAreaElement>(null),
    messages = useRef<HTMLDivElement>(null)
  const alive = useRef(true),
    sending = useRef(false),
    follow = useRef(true),
    draftRef = useRef(draft)
  draftRef.current = draft
  const [image,setImage]=useState<{mediaType:'image/png'|'image/jpeg'|'image/webp';data:string;preview:string}|null>(null)
  const attachImage=(file:File)=>{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>4_000_000){setNotice('Bilden måste vara PNG, JPG eller WebP, högst 4 MB.');return}
    const reader=new FileReader()
    reader.onload=()=>{const preview=String(reader.result??'');const data=preview.split(',')[1];if(!data){setNotice('Bilden kunde inte läsas.');return}setImage({mediaType:file.type as 'image/png'|'image/jpeg'|'image/webp',data,preview});setNotice('')}
    reader.onerror=()=>setNotice('Bilden kunde inte läsas.')
    reader.readAsDataURL(file)
  }
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [frame, setFrame] = useState({
      x: 8,
      y: 8,
      width: 340,
      height: 480,
      mobile: false
    })
  const requestSeq = useRef(0)
  const drag = useRef<{
    pointer: number
    x: number
    y: number
    origin: Point
  } | null>(null)
  useEffect(() => {
    editor.current?.focus()
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    requestSeq.current++
    sending.current = false
    setBusy(false)
    setNotice('')
  }, [snapshot.id])
  useLayoutEffect(() => {
    const update = () => {
      const v = window.visualViewport,
        vp: Viewport = {
          left: v?.offsetLeft ?? 0,
          top: v?.offsetTop ?? 0,
          width: v?.width ?? innerWidth,
          height: v?.height ?? innerHeight
        }
      const mobile = vp.width < 768,
        width = Math.max(1, Math.min(mobile ? 420 : 340, vp.width - 16)),
        height = Math.max(1, Math.min(mobile ? 640 : 480, vp.height - 16))
      const start = mobile
        ? {
            x: vp.left + (vp.width - width) / 2,
            y: vp.top + vp.height - height - 8
          }
        : (position ?? {
            x: vp.left + vp.width - width - 20,
            y: vp.top + vp.height - height - 132
          })
      const point = clampMiniChat(start, { width, height }, vp)
      setFrame({ ...point, width, height, mobile })
    }
    update()
    window.addEventListener('resize', update)
    visualViewport?.addEventListener('resize', update)
    visualViewport?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update)
      visualViewport?.removeEventListener('resize', update)
      visualViewport?.removeEventListener('scroll', update)
    }
  }, [position])
  useLayoutEffect(() => {
    const e = editor.current
    if (e) {
      e.style.height = '40px'
      e.style.height = Math.min(e.scrollHeight, 76) + 'px'
    }
  }, [draft])
  useEffect(() => {
    if (follow.current && messages.current)
      messages.current.scrollTop = messages.current.scrollHeight
  }, [snapshot.entries, snapshot.pending])
  useEffect(() => {
    if (!frame.mobile) return
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = old
    }
  }, [frame.mobile])
  async function submit() {
    if ((!draft.trim()&&!image) || sending.current || snapshot.pending) return
    const text = draft.trim()||'Beskriv bilden.',
      id = snapshot.id,
      token = ++requestSeq.current
    sending.current = true
    setBusy(true)
    setNotice('')
    onDraftChange('')
    const result = await controller.sendCompactText({ text, initialProjectId, image:image?{mediaType:image.mediaType,data:image.data}:undefined })
    if (alive.current && requestSeq.current === token) {
      sending.current = false
      setBusy(false)
      if(result.ok)setImage(null)
      if (!result.ok && result.notice) {
        setNotice(result.notice)
        if (controller.snapshot().id === id && !draftRef.current)
          onDraftChange(text)
      }
    }
  }
  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    if (
      frame.mobile ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest('button')
    )
      return
    drag.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      origin: { x: frame.x, y: frame.y }
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.pointer !== event.pointerId) return
    if (Math.hypot(event.clientX - d.x, event.clientY - d.y) < 4) return
    const v = visualViewport
    onPositionChange(
      clampMiniChat(
        {
          x: d.origin.x + event.clientX - d.x,
          y: d.origin.y + event.clientY - d.y
        },
        frame,
        {
          left: v?.offsetLeft ?? 0,
          top: v?.offsetTop ?? 0,
          width: v?.width ?? innerWidth,
          height: v?.height ?? innerHeight
        }
      )
    )
  }
  const error = notice || atlas.captureError || atlas.warning?.detail
  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Atlas chatt"
      className={styles.panel + (frame.height < 260 ? ' ' + styles.short : '')}
      style={{
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height
      }}
    >
      <div
        className={styles.header}
        data-mini-chat-drag
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        <span className={styles.mark} title="Atlas">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <polygon points={OMNIRA_MARK_POINTS} fill="currentColor" />
          </svg>
        </span>
        <button type="button" aria-label="Minimera Atlas" onClick={onMinimize}>
          <Minus size={17} />
        </button>
      </div>
      <div
        ref={messages}
        className={styles.messages}
        role="log"
        aria-label="Meddelanden"
        aria-live="polite"
        onScroll={() => {
          const e = messages.current
          if (e)
            follow.current = e.scrollHeight - e.scrollTop - e.clientHeight < 60
        }}
      >
        {!snapshot.entries.length && (
          <p className={styles.empty}>Skriv till Atlas.</p>
        )}
        {snapshot.entries.map((entry, i) =>
          entry.kind === 'user' || entry.kind === 'assistant' ? (
            <div
              key={i}
              className={
                styles.message +
                ' ' +
                (entry.kind === 'user' ? styles.user : '')
              }
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
                skipHtml
              >
                {entry.text}
              </ReactMarkdown>
            </div>
          ) : entry.kind === 'notice' ? (
            <p key={i} className={styles.status}>
              {entry.text}
            </p>
          ) : null
        )}
        {snapshot.pending && <p className={styles.status}>Atlas skriver…</p>}
        {(snapshot.plan || snapshot.session) && snapshot.id && (
          <p className={styles.workspace}>
            <Link href={'/chat/' + snapshot.id + '?build=1'}>
              Granska byggplanen i arbetsytan
            </Link>
          </p>
        )}
        {atlas.isSessionActive && (
          <p role="status" className={styles.status}>
            {atlas.voicePhase === 'listening'
              ? 'Lyssnar…'
              : atlas.voicePhase === 'speaking'
                ? 'Atlas talar…'
                : 'Samtal pågår'}
            {atlas.transcript ? ' ' + atlas.transcript : ''}
          </p>
        )}
        {error && (
          <p role="status" className={styles.status + ' ' + styles.error}>
            {error}
          </p>
        )}
      </div>
      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {image&&<div style={{display:'flex',alignItems:'center',gap:8}}><img src={image.preview} alt="Bifogad bild" style={{maxWidth:80,maxHeight:80,borderRadius:6}}/><button type="button" onClick={()=>setImage(null)}>Ta bort</button></div>}
        <label style={{fontSize:12,cursor:'pointer'}}>Bifoga bild <input type="file" accept="image/png,image/jpeg,image/webp" style={{maxWidth:120}} onChange={e=>{const file=e.target.files?.[0];if(file)attachImage(file);e.target.value=''}}/></label>
        <textarea
          ref={editor}
          aria-label="Skriv till Atlas"
          placeholder="Skriv till Atlas…"
          rows={1}
          className={styles.editor}
          value={draft}
          disabled={(busy || snapshot.pending) && !snapshot.id}
          onChange={(e) => onDraftChange(e.target.value)}
          onPaste={e=>{const file=Array.from(e.clipboardData.files).find(file=>file.type.startsWith('image/'));if(file){e.preventDefault();attachImage(file)}}}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              e.nativeEvent.keyCode !== 229
            ) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <button
          type="submit"
          aria-label="Skicka"
          className={styles.send}
          disabled={!draft.trim() || busy || snapshot.pending}
        >
          <ArrowUp size={18} />
        </button>
        <button
          type="button"
          aria-label={
            atlas.isSessionActive ? 'Avsluta samtal' : 'Starta samtal'
          }
          aria-pressed={atlas.isSessionActive}
          className={atlas.isSessionActive ? styles.callActive : undefined}
          onClick={() =>
            atlas.isSessionActive ? atlas.deactivate() : atlas.activate()
          }
        >
          {atlas.isSessionActive ? <PhoneOff size={17} /> : <Phone size={17} />}
        </button>
      </form>
    </div>
  )
}
