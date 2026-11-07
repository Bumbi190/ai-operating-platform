import {describe,expect,it} from 'vitest'
import {randomUUID} from 'node:crypto'
import {CLAIM_STALE_MS,MAX_SWEEP_ROWS,reconcileReferenceTicket,
  SIGNED_TOKEN_GRACE_MS,sweepEligibility,sweepReferenceProject} from './reconcile'

const now=Date.parse('2026-10-17T10:00:00.000Z')
const projectId=randomUUID(),conversationId=randomUUID(),ticketId=randomUUID()
function ticket(state:'issued'|'processing'|'ready'|'rejected'='processing') {
  return {
    id:ticketId, project_id:projectId,conversation_id:conversationId,
    object_path:`incoming/${projectId}/${conversationId}/${ticketId}.png`,
    state,asset_id:null as string|null,staging_cleaned_at:null as string|null,
    expires_at:new Date(now-4*3600_000).toISOString(),
    updated_at:new Date(now-16*60_000).toISOString(),
  }
}
function fixture(row=ticket()) {
  const assetId=randomUUID()
  const asset={
    id:assetId,project_id:projectId,storage_bucket:'media-assets-private',visibility:'internal',
    storage_path:`website/references/${projectId}/${conversationId}/${ticketId}.webp`,
  }
  const provenance={
    asset_id:assetId,source:'uploaded',
    provider_metadata:{purpose:'atlas-website-reference',ticketId},
  }
  let foundAsset=false,foundOriginal=false,matchProvenance=true,removeCount=0
  let skipCAS=false,fetchCount=0,scanLimit=0,scanProject=''
  const from=(table:string)=>{
    let change:Record<string,any>|null=null
    const filters:Record<string,any>={}
    const query:any={
      select:()=>query,
      update:(v:Record<string,any>)=>{change=v;return query},
      eq:(k:string,v:any)=>{filters[k]=v;return query},
      in:(k:string,v:any)=>{filters[k]=v;return query},
      is:(k:string,v:any)=>{filters[k]=v;return query},
      order:()=>query,
      limit:(limit:number)=>{scanLimit=limit;return query},
      maybeSingle:async()=>{
        fetchCount++
        if(table==='website_build_reference_tickets'){
          if(filters.id!==row.id || filters.project_id!==row.project_id || (filters.state && row.state!==filters.state) ||
             (filters.updated_at && row.updated_at!==filters.updated_at))return {data:null,error:null}
          if(change){
            if(skipCAS) return{data:null,error:null}
            Object.assign(row,change)
            return{data:{id:row.id},error:null}
          }
          return {data:{...row},error:null}
        }
        if(table==='assets')return {data:foundAsset?asset:null,error:null}
        if(table==='asset_provenance')return {data:matchProvenance?provenance:null,error:null}
        throw Error('Unexpected table '+table)
      },
      then:(resolve:(x:any)=>any,reject:(x:unknown)=>any)=>{
        let data:any=null
        if(table==='website_build_reference_tickets'){
          if(change){Object.assign(row,change);data=[{id:row.id}]}
          else{
            scanProject=filters.project_id
            data=filters.staging_cleaned_at===null && row.staging_cleaned_at!==null?[]:[{...row}]
          }
        }
        return Promise.resolve({data,error:null}).then(resolve,reject)
      },
    }
    return query
  }
  const db={
    from,storage:{from:(bucket:string)=>({
      remove:async(paths:string[])=>{
        expect(paths).toEqual([row.object_path])
        expect(bucket).toBe('atlas-reference-staging')
        removeCount++;return{error:null}
      },
      list:async(_prefix:string,options:{search:string})=>{
        expect(bucket).toBe('media-assets-private')
        return {data:foundOriginal?[{name:options.search}]:[],error:null}
      },
    })},
  }
  return {
    db:db as never,row,assetId,provenance,
    withAsset:()=>{foundAsset=true},withOrphan:()=>{foundOriginal=true},
    withInvalidProvenance:()=>{foundAsset=true;matchProvenance=false},
    race:()=>{skipCAS=true},
    get removed(){return removeCount},
    get scanLimit(){return scanLimit},
    get scanProject(){return scanProject},
    get fetched(){return fetchCount},
  }
}
describe('website reference cleanup/reconciliation is fail-closed',()=>{
  it('allows a bounded grace period for signed upload tokens and a long processing lease',()=>{
    const issued=ticket('issued')
    issued.expires_at=new Date(now).toISOString()
    expect(sweepEligibility(issued,now+SIGNED_TOKEN_GRACE_MS)).toBe('none')
    expect(sweepEligibility(issued,now+SIGNED_TOKEN_GRACE_MS+1)).toBe('expired_upload')
    const working=ticket()
    working.updated_at=new Date(now-CLAIM_STALE_MS).toISOString()
    expect(sweepEligibility(working,now)).toBe('none')
    expect(sweepEligibility(working,now+1)).toBe('stale_processing')
    working.staging_cleaned_at=new Date(now).toISOString()
    expect(sweepEligibility(working,now+CLAIM_STALE_MS*2)).toBe('none')
    working.object_path='../../other-project'
    expect(sweepEligibility(working,now+CLAIM_STALE_MS*2)).toBe('none')
  })
  it('recovers an exact canonical image with matching provenance but does not regenerate',async()=>{
    const f=fixture();f.withAsset()
    expect(await reconcileReferenceTicket(f.db,f.row,now)).toBe('recovered')
    expect(f.row.state).toBe('ready')
    expect(f.row.asset_id).toBe(f.assetId)
    expect(f.removed).toBe(1)
    expect(f.row.staging_cleaned_at).not.toBeNull()
  })
  it('quarantines mismatched provenance, leaving the canonical and staging files alone',async()=>{
    const f=fixture();f.withInvalidProvenance()
    expect(await reconcileReferenceTicket(f.db,f.row,now)).toBe('manual_review')
    expect(f.row.state).toBe('processing')
    expect(f.removed).toBe(0)
  })
  it('does not delete orphan canonical bytes without an Asset row',async()=>{
    const f=fixture();f.withOrphan()
    expect(await reconcileReferenceTicket(f.db,f.row,now)).toBe('manual_review')
    expect(f.removed).toBe(0)
  })
  it('expires a crashed attempt only if no canonical Asset or file exists',async()=>{
    const f=fixture()
    expect(await reconcileReferenceTicket(f.db,f.row,now)).toBe('expired')
    expect(f.row.state).toBe('rejected')
    expect(f.removed).toBe(1)
    expect(f.row.staging_cleaned_at).not.toBeNull()
  })
  it('expires an issued ticket only after its upload token grace; preserves audit row',async()=>{
    const f=fixture(ticket('issued'))
    expect(await reconcileReferenceTicket(f.db,f.row,now)).toBe('expired')
    expect(f.row.state).toBe('rejected')
    expect(f.removed).toBe(1)
  })
  it('does not overwrite a concurrent changed ticket',async()=>{
    const f=fixture()
    f.race()
    expect(await reconcileReferenceTicket(f.db,f.row,now)).toBe('changed_concurrently')
    expect(f.row.state).toBe('processing')
    expect(f.removed).toBe(0)
  })
  it('scans only the requested project with a fixed row ceiling',async()=>{
    const f=fixture()
    const result=await sweepReferenceProject(f.db,projectId,now)
    expect(result).toEqual([{ticketId,outcome:'expired'}])
    expect(f.scanProject).toBe(projectId)
    expect(f.scanLimit).toBe(MAX_SWEEP_ROWS)
    await expect(sweepReferenceProject(f.db,'invalid',now)).rejects.toMatchObject({code:'INVALID_BODY'})
  })
})
