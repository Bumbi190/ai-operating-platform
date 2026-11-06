'use client'

/**
 * Authenticated browser half of the Nova Desktop relay.
 * Cookies and user credentials never leave this Omnira tab.
 * Its calls to /api/chat MUST pass mode='nova_readonly'.
 */
import { useEffect, useRef, useState } from 'react'

type Pair = { port: number; key: string }
type LocalTask = { id: string; text: string; mode: 'nova_readonly' }
type ChatTurn = { role: 'user' | 'assistant'; content: string }
type LocalFetch = RequestInit & { targetAddressSpace: 'loopback' }

const MAX_LOCAL_CHARS = 3000
const SAFE_PAIR = /^[A-Za-z0-9_-]{32,96}$/

function scrubPairingFragment(): Pair | null {
  const raw = window.location.hash.slice(1)
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  const params = new URLSearchParams(raw)
  const port = Number(params.get('port'))
  const key = params.get('key') ?? ''
  if (!Number.isInteger(port) || port < 1025 || port > 65535 || !SAFE_PAIR.test(key)) {
    return null
  }
  return { port, key }
}

export default function NovaBridgePage() {
  const [phase, setPhase] = useState<'ready' | 'connecting' | 'paired' | 'failed' | 'paused'>('ready')
  const [message, setMessage] = useState('Öppna sidan från Nova-bubblans Koppla Atlas-knapp.')
  const [lastPrompt, setLastPrompt] = useState('')
  const [lastAnswer, setLastAnswer] = useState('')
  const pairingRef = useRef<Pair | null>(null)
  const stoppedRef = useRef(true)
  const turnsRef = useRef<ChatTurn[]>([])
  const pollRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const atlasAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // React StrictMode may re-run effects in development after the fragment
    // has already been scrubbed. Preserve the in-memory pairing in that case.
    if (!pairingRef.current) pairingRef.current = scrubPairingFragment()
    if (pairingRef.current) {
      setMessage('Nova hittad lokalt. Klicka Anslut för att godkänna kopplingen.')
    }
    return () => {
      stoppedRef.current = true
      abortRef.current?.abort()
      atlasAbortRef.current?.abort()
    }
  }, [])

  async function local<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const pairing = pairingRef.current
    if (!pairing) throw new Error('Ingen giltig Nova-parning')
    const init: LocalFetch = {
      method,
      credentials: 'omit',
      mode: 'cors',
      cache: 'no-store',
      targetAddressSpace: 'loopback',
      headers: {
        'Content-Type': 'application/json',
        'X-Nova-Token': pairing.key,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }
    const controller = new AbortController()
    init.signal = controller.signal
    abortRef.current = controller
    try {
      const response = await fetch('http://127.0.0.1:' + pairing.port + path, init)
      if (!response.ok) throw new Error('Nova lokal HTTP ' + response.status)
      return (await response.json()) as T
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  async function push(id: string, kind: 'text' | 'done' | 'error', text = '') {
    return local<{ ok: boolean }>('/event', 'POST', { id, kind, text })
  }

  async function executeReadOnly(task: LocalTask): Promise<void> {
    if (task.mode !== 'nova_readonly' || !task.id || typeof task.text !== 'string' ||
        task.text.length > MAX_LOCAL_CHARS) {
      throw new Error('Nova skickade ett ogiltigt uppdrag')
    }
    setLastPrompt(task.text)
    setLastAnswer('')
    setMessage('Atlas svarar i läsläge. Ingen mejl- eller publiceringsåtgärd utförs.')
    let answer = ''
    const turns: ChatTurn[] = [...turnsRef.current.slice(-10), { role: 'user', content: task.text }]
    const atlasAbort = new AbortController()
    atlasAbortRef.current = atlasAbort
    const response = await fetch('/api/chat', {
      method: 'POST',
      credentials: 'same-origin',
      signal: atlasAbort.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: turns, mode: 'nova_readonly', voice: false }),
    })
    if (!response.ok || !response.body) {
      throw new Error(response.status === 401
        ? 'Atlas-sessionen har gått ut. Logga in i Omnira.'
        : 'Atlas kunde inte svara (HTTP ' + response.status + ').')
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (!stoppedRef.current) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let data: { event?: string; text?: string; code?: string } = {}
          try { data = JSON.parse(line.slice(6)) } catch { continue }
          if (data.event === 'text' && typeof data.text === 'string') {
            for (let i = 0; i < data.text.length; i += 2048) {
              const part = data.text.slice(i, i + 2048)
              answer += part
              if (answer.length > 30_000) throw new Error('Svaret blev för stort')
              await push(task.id, 'text', part)
              setLastAnswer(answer)
            }
          } else if (data.event === 'error') {
            throw new Error('Atlas rapporterade ett tjänstefel: ' + (data.code ?? 'okänt'))
          } else if (data.event === 'tool_call' || data.event === 'navigate') {
            throw new Error('Atlas försökte använda ett verktyg i läsläge.')
          }
        }
      }
    } finally {
      try { await reader.cancel() } catch { /* stream finished */ }
    }
    if (stoppedRef.current) return
    atlasAbortRef.current = null
    turnsRef.current = [...turns, { role: 'assistant', content: answer }].slice(-12)
    await push(task.id, 'done')
    setMessage('Atlas svarade. Inget exekveringsverktyg kördes.')
  }

  async function pollingLoop() {
    if (pollRef.current) return
    pollRef.current = true
    try {
      while (!stoppedRef.current) {
        try {
          const data = await local<{ task?: LocalTask }>('/next')
          const task = data.task
          if (task?.id) {
            try {
              await executeReadOnly(task)
            } catch (error) {
              const detail = error instanceof Error ? error.message : 'Okänt fel'
              setMessage('Atlas-svaret avbröts: ' + detail)
              try { await push(task.id, 'error', detail.slice(0, 200)) } catch { /* canceled */ }
            }
          }
          if (!stoppedRef.current) await new Promise(resolve => setTimeout(resolve, 800))
        } catch {
          if (!stoppedRef.current) {
            setPhase('failed')
            setMessage('Kopplingen till Nova försvann. Aktivera igen i panelen.')
          }
          break
        }
      }
    } finally {
      pollRef.current = false
    }
  }

  async function connect() {
    if (!pairingRef.current) {
      setPhase('failed')
      setMessage('Ingen giltig parning. Klicka Koppla Atlas i Nova på din dator.')
      return
    }
    if (pollRef.current) return
    stoppedRef.current = false
    setPhase('connecting')
    setMessage('Ansluter till den lokala Nova-bubblan ...')
    try {
      const result = await local<{ connected: boolean; mode: string }>(
        '/connect', 'POST', { protocol: 1 })
      if (!result.connected || result.mode !== 'read_only') {
        throw new Error('Fel protokoll från lokal Nova')
      }
      setPhase('paired')
      setMessage('Ansluten! Låt fliken vara öppen. Atlas kan svara i Nova-bubblan i läsläge.')
      void pollingLoop()
    } catch (error) {
      stoppedRef.current = true
      setPhase('failed')
      setMessage('Kopplingen misslyckades: ' +
                 (error instanceof Error ? error.message : 'okänt fel') +
                 '. Tillåt åtkomst till lokalt nätverk om Chrome frågar.')
    }
  }

  function pause() {
    stoppedRef.current = true
    abortRef.current?.abort()
    atlasAbortRef.current?.abort()
    setPhase('paused')
    setMessage('Kopplingen pausad. Inga nya frågor behandlas från bubblan.')
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-16 text-zinc-100">
      <div className="rounded-3xl border border-indigo-500/30 bg-zinc-950/80 p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Omnira / Nova</p>
        <h1 className="mt-2 text-2xl font-semibold">Anslut Nova Desktop</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-300">{message}</p>
        <p className="mt-3 text-xs text-zinc-500">
          Enbart läsning · Ingen inloggning lämnar Omnira · Inga mejl skickas ·
          Inga workflows eller publiceringar kan startas här.
        </p>
        <div className="mt-7 flex gap-3">
          <button type="button" onClick={connect} disabled={phase === 'connecting' || phase === 'paired'}
                  className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">
            {phase === 'paired' ? 'Ansluten' : 'Anslut'}
          </button>
          <button type="button" onClick={pause}
                  className="rounded-xl border border-zinc-700 px-5 py-3 text-sm text-zinc-300">
            Pausa
          </button>
        </div>
        {lastPrompt && (
          <section className="mt-8 border-t border-zinc-800 pt-5">
            <p className="text-xs text-indigo-300">Senaste fråga från Nova</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{lastPrompt}</p>
            <p className="mt-5 text-xs text-indigo-300">Atlas svarar</p>
            <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-zinc-200">
              {lastAnswer || '...'}
            </p>
          </section>
        )}
      </div>
    </main>
  )
}
