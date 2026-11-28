import {describe,it,expect,vi,beforeEach} from 'vitest'
const m=vi.hoisted(()=>({query:vi.fn(),end:vi.fn(),factory:vi.fn()}))
vi.mock('postgres',()=>({default:m.factory}))
import {createLocalEvidencePostgresIngress as ingress,createLocalEvidencePostgresWorker as worker} from '../content-growth/instagram-evidence-postgres'
import {prepareLocalInstagramEvidenceQueue as prepare} from '../content-growth/instagram-evidence-store'
import type {createLocalInstagramEvidenceSession} from '../content-growth/instagram-evidence-hooks'
const password='a'.repeat(48)
const config={mode:'local-isolated-staging' as const,user:'ge_stage_worker',password}
const request={batchId:'synthetic-batch',eventKey:'a'.repeat(64)}
const token='00000000-0000-4000-8000-000000000001'
const uuid=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
type Snapshot=ReturnType<ReturnType<typeof createLocalInstagramEvidenceSession>['snapshot']>
const H=3600000,base=1000*H,scope={projectId:uuid(1),bindingId:uuid(2),accountId:'synthetic-account',platform:'instagram' as const}
const pub:Snapshot['publications'][number]={...scope,kind:'publication_interval_candidate',evidence:'unverified_local_interval',acquisitionId:uuid(3),scriptId:uuid(4),mediaId:'synthetic-media',startMs:base,endMs:base+1000}
const command=prepare({...scope,batchId:'synthetic-batch',owner:uuid(6),startMs:base-1000,endMs:base+H},{mode:'local_unverified_only',halted:false,publications:[pub],measurements:[],authorizesPilot:false})
beforeEach(()=>{
  vi.resetAllMocks()
  m.factory.mockImplementation(()=>Object.assign(m.query,{end:m.end}))
  m.end.mockResolvedValue(undefined)
})
describe('explicit isolated postgres evidence transport',()=>{
  it('factory is inert and refuses wrong mode, role, missing password',()=>{
    worker(config)
    expect(m.factory).not.toHaveBeenCalled()
    expect(()=>worker({...config,user:'postgres'})).toThrow()
    expect(()=>worker({...config,user:'ge_stage_ingress'})).toThrow()
    expect(()=>ingress({...config,password:''})).toThrow()
    expect(()=>worker({...config,mode:'production'} as never)).toThrow()
    expect(m.factory).not.toHaveBeenCalled()
  })
  it('rejects noncanonical arguments and never opens a connection',async()=>{
    const w=worker(config)
    expect(await w.claim({...request,eventKey:'bad'})).toEqual({status:'invalid_request'})
    expect(await w.deliver({...request,token:"'; DROP TABLE x"})).toEqual({status:'invalid_request'})
    expect(m.factory).not.toHaveBeenCalled()
  })
  it('uses fixed socket, one connection and bound values and closes after claim',async()=>{
    m.query.mockResolvedValue([{reply:{status:'claimed',token,attempt:1}}])
    expect(await worker(config).claim(request)).toEqual({status:'claimed',token,attempt:1})
    expect(m.factory).toHaveBeenCalledTimes(1)
    expect(m.factory.mock.calls[0][0]).toMatchObject({path:'/var/run/postgresql/.s.PGSQL.5432',user:config.user,ssl:false,max:1,max_pipeline:1,prepare:false,debug:false,query_timeout:6})
    expect(m.query.mock.calls[0].slice(1)).toEqual([request.batchId,request.eventKey])
    expect(m.end).toHaveBeenCalledWith({timeout:1})
  })
  it('accepts only exact known replies; never exposes unexpected token or payload',async()=>{
    const w=worker(config)
    m.query.mockResolvedValueOnce([{reply:{status:'claimed',token,attempt:1,payload:'private'}}])
      .mockResolvedValueOnce([{reply:{status:'done',retained:2,replayed:0,authorizesPilot:true}}])
      .mockResolvedValueOnce([{reply:{status:'done',retained:2,replayed:0,authorizesPilot:false}}])
    expect(await w.claim(request)).toEqual({status:'uncertain',reason:'unexpected_reply'})
    expect(await w.deliver({...request,token})).toEqual({status:'uncertain',reason:'unexpected_reply'})
    expect(await w.deliver({...request,token})).toEqual({status:'done',retained:2,replayed:0,authorizesPilot:false})
    expect(m.end).toHaveBeenCalledTimes(3)
  })
  it('sanitizes query and close failures without replaying a mutation',async()=>{
    const w=worker(config)
    m.query.mockRejectedValueOnce(Error('private credential or token'))
    expect(await w.claim(request)).toEqual({status:'uncertain',reason:'transport_error'})
    m.query.mockResolvedValueOnce([{reply:{status:'done'}}])
    m.end.mockRejectedValueOnce(Error('private close detail'))
    expect(await w.deliver({...request,token})).toEqual({status:'uncertain',reason:'transport_error'})
    expect(m.query).toHaveBeenCalledTimes(2)
  })
  it('does not queue a second operation on the same transport while the first is active',async()=>{
    let resolve!: (x:unknown)=>void
    m.query.mockReturnValueOnce(new Promise(r=>{resolve=r}))
    const w=worker(config),first=w.claim(request)
    expect(await w.claim(request)).toEqual({status:'uncertain',reason:'transport_error'})
    resolve([{reply:{status:'busy'}}])
    expect(await first).toEqual({status:'busy'})
    expect(m.factory).toHaveBeenCalledTimes(1)
  })
  it('bounds simultaneous operations across separate factories in this module',async()=>{
    const resolvers:Array<(x:unknown)=>void>=[]
    m.query.mockImplementation(()=>new Promise(r=>{resolvers.push(r)}))
    const x=worker(config).claim(request),y=worker(config).claim(request)
    try{
      expect(await worker(config).claim(request)).toEqual({status:'uncertain',reason:'transport_error'})
      expect(m.factory).toHaveBeenCalledTimes(2)
    }finally{
      for(const resolve of resolvers)resolve([{reply:{status:'busy'}}])
      await Promise.all([x,y])
    }
    m.query.mockResolvedValue([{reply:{status:'busy'}}])
    expect(await worker(config).claim(request)).toEqual({status:'busy'})
  })
  it('rejects malformed TLS CA before creating a client',()=>{
    expect(()=>worker({...config,mode:'local-isolated-tls',caPem:'not a certificate'})).toThrow('Invalid local evidence TLS trust anchor')
    expect(m.factory).not.toHaveBeenCalled()
  })
  it('rejects ambient NODE_TLS_REJECT_UNAUTHORIZED even with explicit local config',async()=>{
    const old=process.env.NODE_TLS_REJECT_UNAUTHORIZED
    process.env.NODE_TLS_REJECT_UNAUTHORIZED='0'
    try{expect(await worker(config).claim(request)).toEqual({status:'uncertain',reason:'transport_error'});expect(m.factory).not.toHaveBeenCalled()}
    finally{if(old===undefined)delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;else process.env.NODE_TLS_REJECT_UNAUTHORIZED=old}
  })
  it('ingress reuses canonical store validation and sends exactly one minimized envelope',async()=>{
    const i=ingress({...config,user:'ge_stage_ingress'})
    expect((await i.enqueue({...command,eventKey:'wrong'})).status).toBe('invalid_envelope')
    expect(m.factory).not.toHaveBeenCalled()
    m.query.mockResolvedValueOnce([{reply:'queued'}])
    expect(await i.enqueue(command)).toMatchObject({status:'queued_unverified',authorizesPilot:false})
    expect(m.query.mock.calls[0].slice(1)).toEqual([command.envelope.target.batchId,command.eventKey,JSON.stringify(command.envelope)])
    expect((m.query.mock.calls[0][0] as string[]).join('')).toContain('::text::jsonb')
    expect(m.end).toHaveBeenCalledTimes(1)
  })
  it('fails closed with ambient PG configuration without reading it or calling driver',async()=>{
    const old=process.env.PGHOST
    process.env.PGHOST='synthetic-disallowed'
    try{expect(await worker(config).claim(request)).toEqual({status:'uncertain',reason:'transport_error'});expect(m.factory).not.toHaveBeenCalled()}
    finally{if(old===undefined)delete process.env.PGHOST;else process.env.PGHOST=old}
  })
})
