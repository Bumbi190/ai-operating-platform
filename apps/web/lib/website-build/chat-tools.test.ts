/** Actual authenticated Atlas website tool loop against the isolated SQL fixture. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'
import { initializeWorkerDb, resetWorkerDb, TEST_AGENT, TEST_CONVERSATION, TEST_PRINCIPAL, TEST_PROJECT, testSql } from '@/lib/website-build/test-db'
import {approvedTestInput} from './planning/test-fixture'
import {handleWebsitePlanningTool} from './planning/chat-tools'
import {setProjectWebsiteBuilder} from './planning/store'
let REAL_BUILD_DB: ReturnType<typeof initializeWorkerDb> | null = null

const A_USER = 'user-a', A_EMAIL = 'a@example.test', A_PROJECT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const B_USER = 'user-b', B_EMAIL = 'b@example.test', B_PROJECT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const OPERATOR = 'ops@omnira.test'

let CURRENT_USER: { id: string; email: string } | null = null
let TOOL_RESULTS: any[] = []
let TOOL_NAME = 'list_workflows'
let TOOL_INPUT: Record<string, unknown> = {}
/** Every filter the workflows query received, in call order. */
let WORKFLOW_OPS: [string, string, unknown][] = []

const WORKFLOWS = [
  { id: 'A1', project_id: A_PROJECT, name: 'Alpha One',  description: 'owned one',   steps: [{ input_template: 'x {{a_var}}', output_key: 'k1' }], created_at: '2026-01-01', projects: { name: 'Project A', slug: 'proj-a' } },
  { id: 'A2', project_id: A_PROJECT, name: 'Alpha Two',  description: 'owned two',   steps: [{ input_template: 'y {{a_two}}', output_key: 'k2' }], created_at: '2026-02-01', projects: { name: 'Project A', slug: 'proj-a' } },
  // Foreign, and NEWER — so ordering alone would surface them first.
  { id: 'B1', project_id: B_PROJECT, name: 'SECRET-Beta One', description: 'foreign one', steps: [{ input_template: 'z {{b_secret}}', output_key: 'k3' }], created_at: '2026-09-01', projects: { name: 'Project B', slug: 'proj-b' } },
  { id: 'B2', project_id: B_PROJECT, name: 'SECRET-Beta Two', description: 'foreign two', steps: [{ input_template: 'w {{b_other}}', output_key: 'k4' }], created_at: '2026-09-02', projects: { name: 'Project B', slug: 'proj-b' } },
]
const PROJECTS = [
  { id: A_PROJECT, owner_id: A_USER, name: 'Project A', slug: 'proj-a' },
  { id: B_PROJECT, owner_id: B_USER, name: 'Project B', slug: 'proj-b' },
]
const get = (r: any, p: string): unknown => p.split('.').reduce((a: any, k) => (a == null ? a : a[k]), r)

/** Service-role double: returns EVERYTHING unless the query filters it. */
function makeDb() {
  if (REAL_BUILD_DB && CURRENT_USER?.id === TEST_PRINCIPAL.userId) return REAL_BUILD_DB
  const from = (table: string) => {
    let rows: any[] = table === 'workflows' ? [...WORKFLOWS] : table === 'projects' ? [...PROJECTS] : []
    const rec = (op: string, c: string, v: unknown) => { if (table === 'workflows') WORKFLOW_OPS.push([op, c, v]) }
    const q: any = {
      select: () => q, insert: () => q, update: () => q,
      eq: (c: string, v: unknown) => { rec('eq', c, v); rows = rows.filter(r => get(r, c) === v); return q },
      in: (c: string, v: unknown[]) => { rec('in', c, v); rows = rows.filter(r => v.includes(get(r, c) as never)); return q },
      gte: () => q, not: () => q, limit: (n: number) => { rec('limit', String(n), n); rows = rows.slice(0, n); return q },
      order: (c: string, o?: { ascending?: boolean }) => {
        rec('order', c, o?.ascending !== false)
        const dir = o?.ascending === false ? -1 : 1
        rows = [...rows].sort((a, b) => (String(get(a, c)) < String(get(b, c)) ? -1 : 1) * dir)
        return q
      },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (ok: any, e?: any) => Promise.resolve({ data: rows, error: null }).then(ok, e),
    }
    return q
  }
  return { from, rpc: async () => ({ data: null, error: null }) } as any
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/cost/governed-spend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cost/governed-spend')>()
  return { ...actual, withGovernedSpend: async (_i: unknown, run: () => Promise<unknown>) => run() }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: CURRENT_USER } }) }, from: () => makeDb().from('x') }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeDb() }))

let streamCall = 0
vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = {
      stream: (args: any) => {
        streamCall += 1
        const turn = streamCall
        if (turn > 1) for (const m of args.messages ?? []) {
          const c = (m as any).content
          if (Array.isArray(c)) for (const b of c) if (b?.type === 'tool_result') TOOL_RESULTS.push(b.content)
        }
        const h: Record<string, (d: any) => void> = {}
        return {
          on(e: string, cb: (d: any) => void) { h[e] = cb; return this },
          async finalMessage() {
            if (turn === 1) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: TOOL_NAME, input: TOOL_INPUT }] }
            h.text?.('Klart.'); return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Klart.' }] }
          },
        }
      },
    }
  }
  return { default: FakeAnthropic }
})

async function ask(name = 'list_workflows', input: Record<string, unknown> = {}, conversationId?: string, text = 'lista mina workflows', websitePlanRef?:unknown) {
  TOOL_NAME = name; TOOL_INPUT = input
  streamCall = 0; TOOL_RESULTS = []; WORKFLOW_OPS = []
  vi.resetModules()
  const { POST } = await import('@/app/api/chat/route')
  const res: any = await POST(new Request('http://localhost/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', origin:'http://localhost',host:'localhost' },
    body: JSON.stringify({ messages: [{ role: 'user', content: text }], conversation_id: conversationId, websitePlanRef }),
  }) as any)
  const stream = res?.body ? await new Response(res.body).text() : ''
  await new Promise(r => setTimeout(r, 30))
  const raw = JSON.stringify(TOOL_RESULTS)
  let rows: any[] = []
  try { for (const r of TOOL_RESULTS) { const p = typeof r === 'string' ? JSON.parse(r) : r; if (Array.isArray(p)) rows = p } } catch { /* non-array result */ }
  return { res, raw, rows, stream }
}

beforeEach(() => {
  CURRENT_USER = { id: A_USER, email: A_EMAIL }
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR   // A and B are NOT operators
  ;(globalThis as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({}) })
})
afterEach(() => { delete process.env.PLATFORM_OPERATOR_EMAILS })

describe('Website build through actual authenticated chat tool loop', () => {
  beforeEach(() => { REAL_BUILD_DB = initializeWorkerDb(); resetWorkerDb(); CURRENT_USER = { id: TEST_PRINCIPAL.userId, email: 'builder@example.test' } })
  afterEach(() => { REAL_BUILD_DB = null })
  it('queues one durable build and gives its actual workspace link', async () => {
    const {decisionId:_decision,...input} = await approvedTestInput(REAL_BUILD_DB!,TEST_PRINCIPAL,{projectId:TEST_PROJECT,agentId:TEST_AGENT,conversationId:TEST_CONVERSATION,brief:'Bygg en svensk hemsida',idempotencyKey:crypto.randomUUID()})
    const { res } = await ask('start_website_build', input, TEST_CONVERSATION)
    expect(res.status).toBe(200)
    const result = JSON.parse(TOOL_RESULTS[0])
    expect(result.status).toBe('queued')
    expect(result.revisions).toEqual([])
    expect(result.workspaceUrl).toMatch(new RegExp('/build/' + result.sessionId + '$'))
    expect(result.published).toBe(false)
    expect(testSql("select count(*) from runs where input->>'sessionId'='" + result.sessionId + "';")).toBe('1')
  }, 30_000)
  it('foreign project and conversation never create a session', async () => {
    const input = { projectId: '10000000-0000-4000-8000-000000000002', agentId: TEST_AGENT, brief: 'Bygg', idempotencyKey: crypto.randomUUID() }
    await ask('start_website_build', input, TEST_CONVERSATION)
    expect(JSON.parse(TOOL_RESULTS[0]).code).toBe('NOT_FOUND')
    await ask('start_website_build', { ...input, projectId: TEST_PROJECT }, crypto.randomUUID())
    expect(JSON.parse(TOOL_RESULTS[0]).error).toBeTruthy()
  }, 30_000)

  it('emits a typed plan from a real draft without creating a decision',async()=>{
    const c=crypto.randomUUID();testSql("insert into conversations(id,user_id,project_id) values('"+c+"','"+TEST_PRINCIPAL.userId+"','"+TEST_PROJECT+"');");
    const {res,stream}=await ask('draft_website_build_plan',{projectId:TEST_PROJECT,expectedRevisionId:null,content:{title:'Webb',purpose:'Visa',audience:'Alla',pages:[{key:'index',title:'Hem',purpose:'Visa'}],design:{style:'Omnira',reference:null},features:[],architecture:'Statisk',steps:['Bygg'],domain:{registrar:'strato',requestedName:null}},idempotencyKey:crypto.randomUUID()},c);
    expect(res.status).toBe(200);expect(stream).toContain('"event":"website_plan"');expect(testSql("select count(*) from website_build_plan_decisions d join website_build_plans p on p.id=d.plan_id where p.conversation_id='"+c+"';")).toBe('0');
  },30_000)
  it('exact visible confirmation bypasses model dispatch and returns a durable receipt',async()=>{
    const c=crypto.randomUUID();testSql("insert into conversations(id,user_id,project_id) values('"+c+"','"+TEST_PRINCIPAL.userId+"','"+TEST_PROJECT+"');");
    await setProjectWebsiteBuilder(REAL_BUILD_DB!,TEST_PRINCIPAL,{projectId:TEST_PROJECT,agentId:TEST_AGENT});
    const p:any=await handleWebsitePlanningTool('draft_website_build_plan',{projectId:TEST_PROJECT,expectedRevisionId:null,content:{title:'Webb',purpose:'Visa',audience:'Alla',pages:[{key:'index',title:'Hem',purpose:'Visa'}],design:{style:'Omnira',reference:null},features:[],architecture:'Statisk',steps:['Bygg'],domain:{registrar:'strato',requestedName:null}},idempotencyKey:crypto.randomUUID()},TEST_PRINCIPAL,c,REAL_BUILD_DB!);
    const ref={...p.ref,revisionId:p.currentRevision.revisionId,sha256:p.currentRevision.sha256};
    const {res,stream}=await ask('start_website_build',{},c,'kör',ref);
    expect(testSql("select count(*) from conversation_messages where conversation_id='"+c+"' and tool_data->>'kind'='website_effect';")).toBe('1');
    expect(res.status).toBe(200);expect(streamCall).toBe(0);expect(stream).toContain('"event":"website_workspace"');expect(stream).toContain('"event":"done"');
    const retry=await ask('start_website_build',{},c,'jag godkänner',ref);expect(retry.stream).toContain('"event":"website_workspace"');
    expect(testSql("select count(*) from website_build_plan_decisions d join website_build_plans p on p.id=d.plan_id where p.conversation_id='"+c+"';")).toBe('1');
  },30_000)
  it('model-supplied confirmation cannot approve or start',async()=>{
    await ask('start_website_build',{projectId:TEST_PROJECT,agentId:TEST_AGENT,brief:'Bygg',confirm:true},TEST_CONVERSATION);
    expect(JSON.parse(TOOL_RESULTS[0]).code).toBe('PLAN_REVIEW_REQUIRED');
  })
  it('rejects authority fields in visible references before model dispatch',async()=>{
    const {res}=await ask('start_website_build',{},TEST_CONVERSATION,'kör',{projectId:TEST_PROJECT,planId:crypto.randomUUID(),revisionId:crypto.randomUUID(),sha256:'a'.repeat(64),approved:true});
    expect(res.status).toBe(400);expect(streamCall).toBe(0);
  })
  it('authentication precedes any website tool execution', async () => {
    CURRENT_USER = null
    const { res } = await ask('start_website_build')
    expect(res.status).toBe(401); expect(streamCall).toBe(0)
  })
})