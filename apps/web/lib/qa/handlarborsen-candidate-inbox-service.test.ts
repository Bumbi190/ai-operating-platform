import { describe, expect, it, vi } from 'vitest'
import {
  competitorInboxEnabled, safeInboxCommand, parseInboxRows,
  createCompetitorInboxService,
} from '@/lib/atlas/project-analytics/handlarborsen-candidate-inbox-service'
import { candidateDigest } from '@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import type { CandidateMemoryLoad } from '@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service', async () => {
  const { createHash } = await import('node:crypto')
  return {
    candidateMemoryEnabled: (env: Record<string,string>) => env.HANDLARBORSEN_CANDIDATE_MEMORY_ENABLED === 'true',
    loadCandidateMemory: vi.fn(),
    loadOrganizationCandidateMemory: vi.fn(),
    candidateDigest: (source: any) => createHash('sha256').update(
      [source.name,source.officialUrl,source.observedOn,source.relevance].join('\n'),'utf8',
    ).digest('hex'),
  }
})

const actor = '11111111-1111-4111-8111-111111111111'
const owner = '22222222-2222-4222-8222-222222222222'
const now = new Date('2026-10-17T12:00:00.000Z')
const source = {
  name: 'TradingSolutions D2D',
  officialUrl: 'https://www.tradingsolutions.se/d2d/',
  observedOn: '2026-10-15',
  relevance: 'Verifierat officiellt B2B-auktionsunderlag.',
  provenance: 'independently_checked_official_website' as const,
  host: 'tradingsolutions.se',
  firstSeenAt: '2026-10-16T20:23:40.736Z',
  lifecycle: 'candidate_for_review' as const,
  foundedRecently: 'not_verified' as const,
  executable: false as const,
}
const memory: CandidateMemoryLoad = { status:'ok', candidates:[source], awaitingReview:1 }
const row = {
  project_id: HANDLARBORSEN_PROJECT_ID,
  candidate_host:source.host, recipient_id:actor,
  evidence_digest:candidateDigest(source),
  created_at:'2026-10-17T09:00:00+00:00', read_at:null,
}
function harness(o: {
  role?: 'owner'|'collaborator'
  enabled?: boolean
  memoryEnabled?: boolean
  session?: boolean
  scope?: string[]
  project?: any
  rows?: any[]
  notificationError?: boolean
  candidateMemory?: CandidateMemoryLoad
}={}) {
  const role=o.role??'collaborator'
  const id=role==='owner'?owner:actor
  const user=vi.fn(async () => ({data:{user:o.session===false?null:{id}},error:null}))
  const session=vi.fn(async () => ({ auth:{getUser:user} }))
  const scope=vi.fn(async()=>({
    role:{active:true,role},
    projectIds:o.scope??[HANDLARBORSEN_PROJECT_ID],
  }))
  const projectRead=vi.fn(async()=>({
    data:o.project===undefined ? {
      id:HANDLARBORSEN_PROJECT_ID,slug:'handlarborsen',name:'Handlarbörsen',owner_id:owner,
    }:o.project, error:null,
  }))
  const inboxRead=vi.fn(async()=>({
    data:o.rows??[ {...row,recipient_id:id} ],
    error:o.notificationError?{message:'temporary DB failure'}:null,
  }))
  const rpc=vi.fn(async()=>({data:[{
    outcome:'updated',current_read_at:'2026-10-17T10:00:00.000Z' as string | null,
  }],error:null}))
  const from=vi.fn((table:string) => {
    if(table==='projects') return {select:()=>({eq:()=>({eq:()=>({maybeSingle:projectRead})})})}
    if(table==='handlarborsen_candidate_inbox')
      return {select:()=>({eq:()=>({eq:()=>({order:()=>({limit:inboxRead})})})})}
    throw Error('Unexpected table '+table)
  })
  const admin=vi.fn(()=>({from,rpc}))
  const loadCandidates=vi.fn(async(_mode:string)=>o.candidateMemory??memory)
  const deps:any={
    env: {
      HANDLARBORSEN_CANDIDATE_INBOX_ENABLED:o.enabled===false?'false':'true',
      HANDLARBORSEN_CANDIDATE_MEMORY_ENABLED:o.memoryEnabled===false?'false':'true',
    },
    session,admin,scope,loadCandidates,now:()=>now,
  }
  return{service:createCompetitorInboxService(deps),session,user,scope,admin,from,inboxRead,projectRead,rpc,loadCandidates}
}

describe('per-recipient Handlarbörsen candidate inbox contract',()=>{
  it('is entirely dormant unless both inbox and candidate memory flags are on',async()=>{
    for(const opts of [{enabled:false},{memoryEnabled:false}]){
      const h=harness(opts)
      expect(await h.service.load('owner')).toEqual({status:'disabled'})
      expect(await h.service.setRead('owner',{host:source.host,read:true})).toEqual({status:'disabled'})
      expect(h.session).not.toHaveBeenCalled()
      expect(h.from).not.toHaveBeenCalled()
    }
    expect(competitorInboxEnabled({NODE_ENV:'test',HANDLARBORSEN_CANDIDATE_INBOX_ENABLED:'true'})).toBe(false)
  })
  it('strictly validates human read/unread acknowledgement input',()=>{
    expect(safeInboxCommand({host:source.host,read:true})).toEqual({host:source.host,read:true})
    expect(safeInboxCommand({host:source.host,read:false})).toEqual({host:source.host,read:false})
    for(const bad of [null,{}, {host:source.host,read:'yes'},
      {host:source.host,read:true,recipient_id:actor},
      {host:source.host,read:true,project_id:HANDLARBORSEN_PROJECT_ID},
      {host:'https://evil.test/',read:true},
      {host:'www.tradingsolutions.se',read:true},
      {host:source.host+'?a=1',read:true}]){
      expect(safeInboxCommand(bad)).toBeNull()
    }
  })
  it('verifies recipient identity, digest, unique host, project and non-future timestamps',()=>{
    const good=parseInboxRows([row],memory,actor,now)
    expect(good.status).toBe('ok')
    if(good.status==='ok'){
      expect(good.unreadCount).toBe(1)
      expect(good.notifications[0]).toMatchObject({
        host:source.host,name:source.name,unread:true,readAt:null,
      })
    }
    for(const invalid of [
      [{...row,recipient_id:owner}],
      [{...row,project_id:'wrong'}],
      [{...row,evidence_digest:'0'.repeat(64)}],
      [{...row,candidate_host:'evil.example'}],
      [{...row,created_at:'2099-01-01T00:00:00Z'}],
      [{...row,read_at:'2026-10-16T07:00:00Z'}],
      [row,row],
    ]) expect(parseInboxRows(invalid,memory,actor,now)).toEqual({status:'unavailable'})
    expect(parseInboxRows([row],{status:'unavailable'},actor,now)).toEqual({status:'unavailable'})
  })
  it('shows independent read state for each recipient without modifying the source evidence',()=>{
    const someoneElse={...row,recipient_id:owner,read_at:'2026-10-17T10:00:00.000Z'}
    const a=parseInboxRows([row],memory,actor,now)
    const b=parseInboxRows([someoneElse],memory,owner,now)
    expect(a.status==='ok'&&a.unreadCount).toBe(1)
    expect(b.status==='ok'&&b.unreadCount).toBe(0)
    expect(source.firstSeenAt).toBe('2026-10-16T20:23:40.736Z')
  })
  it('denies missing session, foreign project and owner/collaborator role mismatch before storage',async()=>{
    for(const opts of [{session:false},{scope:[]},{role:'owner' as const,scope:[]},
      {project:{id:'foreign',slug:'handlarborsen',name:'Handlarbörsen',owner_id:owner}}]){
      const h=harness(opts)
      const result=await h.service.load(opts.role??'collaborator')
      expect(result.status==='unauthorized'||result.status==='forbidden').toBe(true)
      expect(h.inboxRead).not.toHaveBeenCalled()
    }
    const h=harness({role:'collaborator'})
    expect((await h.service.setRead('owner',{host:source.host,read:true})).status).toBe('forbidden')
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('allows only the authenticated role to query their own addressed notices',async()=>{
    for(const mode of ['owner','collaborator'] as const){
      const h=harness({role:mode})
      const result=await h.service.load(mode)
      expect(result.status).toBe('ok')
      expect(h.loadCandidates).toHaveBeenCalledWith(mode)
      expect(h.inboxRead).toHaveBeenCalledOnce()
      expect(h.rpc).not.toHaveBeenCalled()
    }
  })
  it('binds acknowledgement to authenticated actor, exact project and host on a typed RPC',async()=>{
    const h=harness()
    expect(await h.service.setRead('collaborator',{host:source.host,read:true}))
      .toEqual({status:'updated',read:true})
    expect(h.rpc).toHaveBeenCalledWith('handlarborsen_set_candidate_inbox_read_v1',{
      p_project_id:HANDLARBORSEN_PROJECT_ID,p_host:source.host,p_recipient_id:actor,p_read:true,
    })
    expect(h.rpc).toHaveBeenCalledTimes(1)
  })
  it('reports missing data, DB errors and unexpected RPC output as unavailable',async()=>{
    expect(await harness({notificationError:true}).service.load('collaborator')).toEqual({status:'unavailable'})
    const h=harness()
    h.rpc.mockResolvedValueOnce({data:[{outcome:'updated',current_read_at:null}],error:null})
    expect(await h.service.setRead('collaborator',{host:source.host,read:true}))
      .toEqual({status:'unavailable'})
    const notFound=harness()
    notFound.rpc.mockResolvedValueOnce({data:[{outcome:'not_found',current_read_at:null}],error:null})
    expect(await notFound.service.setRead('collaborator',{host:source.host,read:true}))
      .toEqual({status:'not_found'})
  })
})
