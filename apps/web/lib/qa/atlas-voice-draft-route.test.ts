/**
 * Real POST /api/chat integration: partial provider text, owned persistence,
 * explicit continuation and token-limit honesty. No provider/network calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VOICE_DOCUMENT_INCOMPLETE_WARNING, VOICE_DOCUMENT_STREAM_INTERRUPTED_WARNING } from '@/lib/atlas/voice-pilot/document-mode'

vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({
  outcome: 'fail' as 'fail' | 'max_tokens' | 'complete',
  user: { id: 'operator-one', email: 'owner@example.test' },
  requestedConversation: 'conv-owned',
  calls: [] as Array<{ max_tokens: number; tools: Array<{name:string}>; messages: unknown[] }>,
  writes: [] as Array<{table: string; operation: string; payload: any}>,
  foreignOwner: false,
  fallbackCalls: 0,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))
function builder(table: string): any {
  const filters: Array<[string, unknown]> = []
  let writeOperation: string | null = null
  let payload: unknown
  const b: any = {
    select: () => b,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return b },
    neq: () => b, gte: () => b, lte: () => b, lt: () => b, gt: () => b,
    is: () => b, in: () => b, not: () => b, order: () => b, limit: () => b,
    range: () => b, filter: () => b, or: () => b, contains: () => b, single: () => b,
    maybeSingle: async () => {
      if (table === 'conversations') {
        return {data: !state.foreignOwner && filters.some(([k,v]) => k === 'id' && v === state.requestedConversation)
          && filters.some(([k,v]) => k === 'user_id' && v === state.user.id)
          ? { id: state.requestedConversation } : null, error: null}
      }
      return { data: null, error: null }
    },
    insert: (body: unknown) => {state.writes.push({ table, operation: 'insert', payload: body });return Promise.resolve({error:null})},
    update: (body: unknown) => {writeOperation = 'update';payload = body;return b},
    upsert: () => b, delete: () => b,
    then: (ok: any) => {
      if (writeOperation) state.writes.push({table, operation: writeOperation, payload})
      return Promise.resolve({data: [],error:null}).then(ok)
    },
  }
  return b
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => builder(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}))
vi.mock('@/lib/ai/anthropic', () => ({
  getAnthropic: () => ({
    messages: { stream: (args: any) => {
      state.calls.push(args)
      let textHandler: ((part: string) => void) | undefined
      return {
        on(event: string, callback: (part:string)=>void) {
          if(event==='text') textHandler=callback
          return this
        },
        async finalMessage() {
          const part=state.outcome==='complete' ? 'Här kommer den säkra fortsättningen.' : '## Claude-prompt\n\nSteg ett är halvfärdigt'
          textHandler?.(part)
          if (state.outcome === 'fail') throw new Error('Provider transport disconnected after streamed text')
          return { stop_reason: state.outcome==='max_tokens' ? 'max_tokens' : 'end_turn',
            content: [{type:'text',text:part}] }
        },
      }
    } },
  }),
}))
vi.mock('@/lib/atlas/openai-chat', () => ({
  openAIAtlasStream: async () => {state.fallbackCalls++;throw new Error('A model fallback must not repeat partially generated text')},
}))
const owned = (messages: Array<{role: 'user'|'assistant';content:string}>, voice = true) => ({
  conversation_id: state.requestedConversation, voice, messages,
})
const frames = (raw: string) => raw.split('\n\n').filter(x=>x.startsWith('data: ')).map(x=>JSON.parse(x.slice(6)) as {event:string; text?:string;[key:string]:unknown})
async function post(body: unknown) {
  vi.resetModules()
  const { POST } = await import('@/app/api/chat/route')
  const res = await POST(new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { origin:'http://localhost', host:'localhost','content-type':'application/json' },
    body:JSON.stringify(body),
  }) as any)
  return { res, events: frames(res.body ? await new Response(res.body).text() : '') }
}
const requestPrompt = 'Skriv en komplett Claude-prompt som beskriver ett arbetsflöde'
const assistantDraft = () => state.writes.filter(x=>x.table==='conversation_messages' && x.operation==='insert')
  .map(x=>x.payload).find(x=>x.role==='assistant')
beforeEach(()=>{
  state.outcome='fail'
  state.calls.length=0
  state.writes.length=0
  state.fallbackCalls=0
  state.foreignOwner=false
  vi.stubEnv('ANTHROPIC_API_KEY','fixture-not-a-secret')
  vi.stubEnv('ATLAS_TEXT_FAILOVER_ENABLED','true')
  vi.stubEnv('ATLAS_MODEL_PROFILE','')
})
afterEach(() => vi.unstubAllEnvs())
describe('Nova real-stream draft recovery',()=>{
  it('preserves streamed text and never auto-retries an uncertain provider failure',async()=>{
    const {res,events}=await post(owned([{role:'user',content:requestPrompt}]))
    expect(res.status).toBe(200)
    expect(events.some(e=>e.event==='text' && e.text?.includes('Steg ett'))).toBe(true)
    expect(events.some(e=>e.event==='draft_interrupted' && e.continuationAllowed===true)).toBe(true)
    expect(events.some(e=>e.event==='error')).toBe(true)
    expect(events.some(e=>e.event==='done')).toBe(false)
    const saved=assistantDraft()
    expect(saved.content).toContain('Steg ett är halvfärdigt')
    expect(saved.content).toContain(VOICE_DOCUMENT_STREAM_INTERRUPTED_WARNING.trim())
    expect(saved.tool_data).toMatchObject({kind:'incomplete_draft',continuationAllowed:true})
    expect(state.calls).toHaveLength(1)
    expect(state.fallbackCalls).toBe(0)
  })
  it('treats a max-token stop as an incomplete document and resumes without any tools',async()=>{
    state.outcome='max_tokens'
    const {events}=await post(owned([{role:'user',content:requestPrompt}]))
    expect(events.some(e=>e.event==='draft_interrupted')).toBe(true)
    const original=assistantDraft()
    expect(original.tool_data).toMatchObject({kind:'incomplete_draft',continuationAllowed:true})
    expect(original.content).toContain(VOICE_DOCUMENT_INCOMPLETE_WARNING.trim())
    state.calls.length=0
    state.writes.length=0
    state.outcome='complete'
    const resumed=await post(owned([
      {role:'user',content:requestPrompt},
      {role:'assistant',content:original.content},
      {role:'user',content:'Fortsätt'},
    ],false))
    expect(resumed.events.some(e=>e.event==='done')).toBe(true)
    expect(state.calls).toHaveLength(1)
    expect(state.calls[0].tools).toEqual([])
    expect(assistantDraft().content).toContain('säkra fortsättningen')
  })
  it('does not persist drafts to an unowned conversation',async()=>{
    state.foreignOwner=true
    const {events}=await post(owned([{role:'user',content:requestPrompt}]))
    expect(events.some(e=>e.event==='draft_interrupted' && e.saved===false)).toBe(true)
    expect(assistantDraft()).toBeUndefined()
    expect(state.fallbackCalls).toBe(0)
  })
})
