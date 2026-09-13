'use client'

/**
 * Atlas Chat — the launcher on the chat home.
 *
 * The replaced page's flow, unchanged: a question opens a new, projectless
 * conversation through `POST /api/conversations` and moves the operator into it
 * with the question in `?send=`, where the conversation sends it once. The
 * starters are the replaced page's own, imported rather than copied.
 */

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, Loader2 } from 'lucide-react'
import { EXECUTIVE_PROMPTS } from '@/app/(platform)/chat/ExecutiveAssistant'
import { COMPOSER_HINT, CREATE_FAILED_NOTICE, LAUNCHER_PLACEHOLDER } from '@/lib/os/chat-shared'
import styles from './AtlasChat.module.css'

export function AtlasChatLauncher({ chatBase }: { chatBase: string }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [launching, setLaunching] = useState(false)
  const [failed, setFailed] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  async function launch(prompt: string) {
    if (!prompt.trim() || launching) return
    setLaunching(true)
    setFailed(false)
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: null }),
      })
      const conv = (await res.json().catch(() => null)) as { id?: string } | null
      if (conv?.id) {
        router.push(`${chatBase}/${conv.id}?send=${encodeURIComponent(prompt)}`)
        return
      }
      setFailed(true)
      setLaunching(false)
    } catch {
      setFailed(true)
      setLaunching(false)
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void launch(text)
    }
  }

  function onChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value)
    const el = event.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`
    el.style.overflowY = el.scrollHeight > 192 ? 'auto' : 'hidden'
  }

  return (
    <div className={styles.launcher}>
      <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void launch(text) }}>
        <label className={styles.srOnly} htmlFor="atlas-chat-launcher">Fråga Atlas</label>
        <textarea
          id="atlas-chat-launcher"
          ref={inputRef}
          className={styles.input}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={LAUNCHER_PLACEHOLDER}
          rows={1}
          disabled={launching}
        />
        <button type="submit" className={styles.send} disabled={!text.trim() || launching} aria-label="Starta konversationen">
          {launching ? <Loader2 className={styles.spin} aria-hidden /> : <ArrowUp aria-hidden />}
        </button>
      </form>
      <p className={`${styles.composerHint} ${styles.hintKeys}`} aria-hidden="true">{COMPOSER_HINT}</p>
      {failed && <p className={styles.formError} role="status">{CREATE_FAILED_NOTICE}</p>}

      <ul className={styles.prompts} aria-label="Snabbfrågor">
        {EXECUTIVE_PROMPTS.map((prompt) => (
          <li key={prompt.label}>
            <button type="button" className={styles.prompt} onClick={() => void launch(prompt.label)} disabled={launching}>
              <prompt.icon className={styles.promptIcon} aria-hidden />
              <span>{prompt.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
