'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Send, Bot, User, Play, CheckCircle2, Loader2, AlertCircle, Zap,
  ChevronLeft, Plus,
} from 'lucide-react'
import type Anthropic from '@anthropic-ai/sdk'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AtlasActionChips } from '@/components/platform/os/AtlasActionChips'
import type { ResolvedLink } from '@/lib/nav/registry'
import {useAtlasConversation} from '@/lib/atlas/conversation/provider'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TextMessage {
  role: 'user' | 'assistant'
  type: 'text'
  content: string
}

interface ToolCallMessage {
  role: 'assistant'
  type: 'tool_call'
  tool: string
  input: unknown
  result?: unknown
}

interface SystemMessage {
  role: 'system'
  type: 'system'
  content: string
}

interface LinksMessage {
  role: 'assistant'
  type: 'links'
  links: ResolvedLink[]
}

type ChatMessage = TextMessage | ToolCallMessage | SystemMessage | LinksMessage

interface SavedMessage {
  role: string
  content: string | null
  tool_data: unknown
  created_at: string | null
}

interface Props {
  conversationId?: string
  conversationTitle?: string
  projectName?: string | null
  savedMessages?: SavedMessage[]
  historyReadable?: boolean
  projectId?: string | null
}

const SUGGESTED_PROMPTS = [
  'Vad behöver min uppmärksamhet idag?',
  'Visa verksamheternas resultat',
  'Vad bör vi fokusera på härnäst?',
  'Granska väntande godkännanden',
]

// ─── ChatClient ───────────────────────────────────────────────────────────────

export function ChatClient({
  conversationId,
  conversationTitle,
  projectName,
  savedMessages = [],
  historyReadable=true,
  projectId=null,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()

  // Convert saved DB messages to UI format. Saved navigation rows (content null,
  // tool_data.kind === 'links') rehydrate as chips; everything else is text.
  const initialMessages: ChatMessage[] = savedMessages.length > 0
    ? savedMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map((m): ChatMessage | null => {
          const td = m.tool_data as { kind?: string; links?: ResolvedLink[] } | null
          if (m.role === 'assistant' && td?.kind === 'links' && Array.isArray(td.links)) {
            return { role: 'assistant', type: 'links', links: td.links }
          }
          if (!m.content) return null
          return { role: m.role as 'user' | 'assistant', type: 'text', content: m.content }
        })
        .filter((m): m is ChatMessage => m !== null)
    : [
        {
          role: 'assistant' as const,
          type: 'text' as const,
          content: 'Hej! Jag är din Executive Assistant. Jag har koll på dina verksamheter och kan brief­a läget, köra arbetsflöden, granska godkännanden och peka ut vad som bör prioriteras. Vad vill du veta?',
        },
      ]

  const {controller,snapshot}=useAtlasConversation()
  useEffect(()=>{if(conversationId)controller.activateConversation({id:conversationId,saved:savedMessages,state:historyReadable?'ok':'error',projectId})},[controller,conversationId,savedMessages,historyReadable,projectId])
  const messages:ChatMessage[]=snapshot.id===conversationId&&snapshot.entries.length?snapshot.entries.map(entry=>{
    if(entry.kind==='tool')return {role:'assistant',type:'tool_call',tool:entry.tool,input:entry.input,result:entry.result} as ToolCallMessage
    if(entry.kind==='links')return {role:'assistant',type:'links',links:entry.links} as LinksMessage
    if(entry.kind==='notice')return {role:'system',type:'system',content:entry.text} as SystemMessage
    return {role:entry.kind==='user'?'user':'assistant',type:'text',content:entry.text} as TextMessage
  }):initialMessages
  const [input, setInput] = useState('')
  const loading=snapshot.id===conversationId&&snapshot.pending
  const [mode, setMode] = useState<'fast_path' | 'atlas' | null>(null)   // routing-verifiering
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit=useCallback(async(e?:React.FormEvent,overrideText?:string)=>{
    e?.preventDefault()
    const text=(overrideText??input).trim()
    if(!text||loading||!conversationId||!historyReadable)return
    setInput('')
    await controller.sendTurn({conversationId,text,inputSource:'text',onEvent:event=>{
      if(event.event==='navigate'&&typeof event.href==='string'&&event.href.split('?')[0]!==pathname)router.push(event.href)
      if(event.event==='done'&&controller.snapshot().history.filter(m=>m.role==='user').length===1)router.refresh()
      if(event.event==='timing')setMode(event.reqType==='fast_path'?'fast_path':'atlas')
      if(event.event==='website_plan'||event.event==='website_workspace')router.push('/chat/'+conversationId+'?build=1')
    }})
    inputRef.current?.focus()
  },[input,loading,conversationId,historyReadable,controller,pathname,router])
  useEffect(()=>{if(snapshot.id===conversationId&&snapshot.speechDraft!==null)setInput(snapshot.speechDraft)},[snapshot.id,snapshot.speechDraft,conversationId])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Auto-skicka en fråga som kommer via ?send= (från Executive Assistant-launchern).
  const autoSentRef = useRef(false)
  useEffect(() => {
    if (autoSentRef.current || savedMessages.length > 0) return
    const send = new URLSearchParams(window.location.search).get('send')
    if (send) {
      autoSentRef.current = true
      window.history.replaceState({}, '', window.location.pathname)
      handleSubmit(undefined, send)
    }
  }, [handleSubmit, savedMessages.length])

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50 shrink-0">
        <button
          onClick={() => router.push('/chat')}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
          <Zap className="w-3.5 h-3.5 text-indigo-400" />
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">
            {conversationTitle ?? 'AI Assistent'}
          </h1>
          <p className="text-xs text-muted-foreground truncate">
            {projectName ? `${projectName} · ` : ''}Kör workflows och hantera AI-agenter via chatt
          </p>
        </div>

        <button
          onClick={async () => {
            const res = await fetch('/api/conversations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            })
            const conv = await res.json()
            if (conv.id) router.push(`/chat/${conv.id}`)
          }}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title="Ny chatt"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Routing-badge — verifierar FAST PATH vs EXECUTIVE */}
      {mode && (
        <div className="px-4 pt-1 flex justify-end">
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${mode === 'fast_path' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10'}`}>
            {mode === 'fast_path' ? '⚡ FAST PATH' : '🧠 EXECUTIVE'}
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 space-y-4">
        {messages.map((msg, i) => {
          if (msg.type === 'tool_call') {
            return <ToolCallCard key={i} msg={msg} />
          }

          if (msg.type === 'links') {
            return (
              <div key={i} className="flex justify-start pl-10">
                <AtlasActionChips links={msg.links} />
              </div>
            )
          }

          if (msg.type === 'system') {
            return (
              <div key={i} className="flex justify-center">
                <div className="inline-flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-full px-3 py-1">
                  <AlertCircle className="w-3 h-3" />
                  {msg.content}
                </div>
              </div>
            )
          }

          const isUser = msg.role === 'user'
          return (
            <div key={i} className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
              {!isUser && (
                <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-indigo-400" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  isUser
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-card border border-border rounded-tl-sm',
                )}
              >
                {msg.content ? (
                  isUser ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="prose prose-sm prose-invert max-w-none
                      [&>p]:mb-2 [&>p:last-child]:mb-0
                      [&>ul]:mb-2 [&>ul]:pl-4 [&>ul>li]:mb-0.5
                      [&>ol]:mb-2 [&>ol]:pl-4 [&>ol>li]:mb-0.5
                      [&>h1]:text-base [&>h1]:font-semibold [&>h1]:mb-2
                      [&>h2]:text-sm [&>h2]:font-semibold [&>h2]:mb-1.5
                      [&>h3]:text-sm [&>h3]:font-medium [&>h3]:mb-1
                      [&>code]:bg-muted [&>code]:px-1 [&>code]:rounded [&>code]:text-xs
                      [&>pre]:bg-muted [&>pre]:p-2 [&>pre]:rounded [&>pre]:text-xs [&>pre]:overflow-x-auto
                      [&>hr]:border-border [&>hr]:my-2
                      [&>strong]:font-semibold
                      [&>table]:w-full [&>table]:text-xs [&>table]:border-collapse [&>table]:mb-2
                      [&>table_th]:text-left [&>table_th]:px-2 [&>table_th]:py-1 [&>table_th]:border [&>table_th]:border-border [&>table_th]:bg-muted/50 [&>table_th]:font-medium
                      [&>table_td]:px-2 [&>table_td]:py-1 [&>table_td]:border [&>table_td]:border-border">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  )
                ) : (
                  !isUser && loading && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-xs">Tänker...</span>
                    </div>
                  )
                )}
              </div>
              {isUser && (
                <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              )}
            </div>
          )
        })}

        {/* Suggested prompts — only at start */}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            {SUGGESTED_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => handleSubmit(undefined, prompt)}
                className="text-xs rounded-full border border-border bg-card px-3 py-1.5 hover:bg-accent hover:border-border/60 transition-colors text-muted-foreground hover:text-foreground"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 pb-6 pt-2">
        <form onSubmit={handleSubmit}>
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-card px-4 py-3 focus-within:border-indigo-500/40 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Skriv ett meddelande… (Enter för att skicka, Shift+Enter för ny rad)"
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent text-sm resize-none focus:outline-none placeholder:text-muted-foreground max-h-32 scrollbar-thin disabled:opacity-50"
              style={{ minHeight: '24px' }}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-xl bg-indigo-500 text-white flex items-center justify-center hover:bg-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground/50 mt-2">
            AI kan göra misstag. Verifiera viktig information.
          </p>
        </form>
      </div>
    </div>
  )
}

// ─── ToolCallCard ─────────────────────────────────────────────────────────────

function ToolCallCard({ msg }: { msg: ToolCallMessage }) {
  const toolLabels: Record<string, string> = {
    list_workflows: 'Listar workflows',
    trigger_workflow: 'Kör workflow',
    get_run_status: 'Hämtar körningsstatus',
    ask_manager: 'Frågar Manager Agent',
  }

  const isDone = msg.result !== undefined
  const isWorkflowRun = msg.tool === 'trigger_workflow'
  const result = msg.result as Record<string, unknown> | null

  return (
    <div className="flex justify-start pl-10">
      <div className="max-w-[75%] rounded-xl border border-border bg-card/50 overflow-hidden text-xs">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/30">
          {isDone ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
          ) : (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 shrink-0" />
          )}
          <span className="font-medium text-muted-foreground">
            {toolLabels[msg.tool] ?? msg.tool}
          </span>
          {isDone && <span className="text-green-500 ml-auto">klar</span>}
        </div>

        {isDone && result && (
          <div className="px-3 py-2">
            {isWorkflowRun && result.run_id ? (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Play className="w-3 h-3 text-green-500" />
                <span>Körning startad</span>
                <code className="font-mono text-[10px] bg-muted px-1 rounded ml-1">
                  {String(result.run_id).slice(0, 8)}…
                </code>
              </div>
            ) : (
              <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap max-h-20 overflow-y-auto scrollbar-thin">
                {JSON.stringify(result, null, 2).slice(0, 300)}
                {JSON.stringify(result).length > 300 ? '…' : ''}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}