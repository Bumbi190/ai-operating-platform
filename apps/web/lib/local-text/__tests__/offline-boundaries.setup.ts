import { afterEach,beforeEach,expect,vi } from 'vitest'

// This setup belongs only to test:local-text-offline. Keep real adapters out of
// unit verification, including errors caught and hidden by production handlers.
const blocked=vi.hoisted(()=>{
 const attempts={process:0,fetch:0}
 return {
  attempts,
  process:()=>{attempts.process++;throw new Error('External process forbidden in local-text offline verification')},
  fetch:()=>{attempts.fetch++;throw new Error('External fetch forbidden in local-text offline verification')},
 }
})
vi.mock('node:child_process',async importOriginal=>{
 const actual=await importOriginal<typeof import('node:child_process')>()
 const guarded={...actual,exec:blocked.process,execSync:blocked.process,execFile:blocked.process,
  execFileSync:blocked.process,spawn:blocked.process,spawnSync:blocked.process,fork:blocked.process}
 return {...guarded,default:guarded}
})
vi.mock('child_process',async importOriginal=>{
 const actual=await importOriginal<typeof import('node:child_process')>()
 const guarded={...actual,exec:blocked.process,execSync:blocked.process,execFile:blocked.process,
  execFileSync:blocked.process,spawn:blocked.process,spawnSync:blocked.process,fork:blocked.process}
 return {...guarded,default:guarded}
})
vi.stubGlobal('fetch',blocked.fetch)
beforeEach(()=>{
 blocked.attempts.process=0;blocked.attempts.fetch=0
 vi.stubGlobal('fetch',blocked.fetch)
})
afterEach(()=>{
 // These counters survive vi.clearAllMocks/resetAllMocks in test fixtures.
 expect(blocked.attempts.process).toBe(0)
 expect(blocked.attempts.fetch).toBe(0)
})
