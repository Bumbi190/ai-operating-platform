import {expect,it,vi} from 'vitest'
import {recordDispatchUnknown,finalizeOwnedRunUnlessCancelled} from '@/lib/governance/run-execution-checkpoint'
function fixture(){
 const result={data:[{id:'run'}],error:null}
 const q={update:vi.fn(()=>q),eq:vi.fn(()=>q),select:vi.fn(()=>q),abortSignal:vi.fn(async()=>result),then:(resolve:(v:typeof result)=>unknown)=>Promise.resolve(result).then(resolve)}
 return {db:{from:()=>q} as never,q}
}
it('campaign lifecycle writes pass their finite signal to actual database transport',async()=>{
 const {db,q}=fixture(),signal=new AbortController().signal
 expect(await recordDispatchUnknown(db,'run','claim','image_unknown',{signal})).toBe('UNKNOWN_WRITTEN')
 expect(q.abortSignal).toHaveBeenCalledWith(signal)
 q.abortSignal.mockClear()
 expect(await finalizeOwnedRunUnlessCancelled(db,'run','claim',{status:'failed'},{signal})).toMatchObject({outcome:'SUCCEEDED'})
 expect(q.abortSignal).toHaveBeenCalledWith(signal)
})
