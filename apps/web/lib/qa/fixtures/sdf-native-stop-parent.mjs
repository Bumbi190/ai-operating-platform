// Test-only real broker parent for class N attempt C (docs/superpowers/plans/2026-10-19-cooperative-native-stop.md).
// It runs the actual bridge, controlled launcher, reservation and cleanup source with an always-live test guard,
// prints progress as JSON lines, and is then killed by the test to prove that broker death becomes helper EOF.
// Never imported by product code. Requires: node --experimental-strip-types.
import {register} from 'node:module'
import {performance} from 'node:perf_hooks'
register('data:text/javascript,'+encodeURIComponent("export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if(/\\.js$/.test(s)&&(s.startsWith('.')||s.startsWith('file:')))return n(s.slice(0,-3)+'.ts',c);throw e}}"))
const [requestJson,attemptId,templateJson]=process.argv.slice(2)
const request=JSON.parse(requestJson),template=JSON.parse(templateJson)
const root=new URL('../../../../code-broker/src/',import.meta.url)
const {createExecutionLeaseGuard}=await import(new URL('runtime/execution-lease-guard.ts',root).href)
const {createNativeStopBridge}=await import(new URL('runtime/native-stop-bridge.ts',root).href)
const {launchControlledMaterialization}=await import(new URL('isolation/windows/controlled-helper.ts',root).href)
const {reserveWindowsSourceAttempt}=await import(new URL('isolation/windows/source-attempts.ts',root).href)
const {cleanupWindowsSourceFixture}=await import(new URL('isolation/windows/source-fixture.ts',root).href)
const start=performance.now(),emit=v=>process.stdout.write(JSON.stringify({...v,at:Math.round(performance.now()-start)})+'\n')
let counter=1
const lease=()=>{const now=Date.now();return{...template,serverNowMs:now,leaseUntilMs:now+90000,authorizationExpiresAtMs:now+300000,runtimeExpiresAtMs:now+1200000}}
const guard=createExecutionLeaseGuard({claim:{workId:request.workId,claimId:request.claimId,fence:request.fence,claimToken:'A'.repeat(43),requestCounter:1,leaseUntil:new Date(Date.now()+90000).toISOString()},expected:{projectId:template.projectId,binding:template.binding,authorityPins:template.authorityPins}},
 {monotonicNow:()=>performance.now(),wallNow:()=>Date.now(),nextCounter:()=>++counter,schedule:(fn,ms)=>{const t=setTimeout(fn,ms);return()=>clearTimeout(t)},read:async c=>({requestCounter:c,httpStatus:200,body:{status:'live',lease:lease()}})})
const bridge=createNativeStopBridge({platform:process.platform,nextAttempt:()=>attemptId,reserve:reserveWindowsSourceAttempt,cleanup:cleanupWindowsSourceFixture,
 schedule:(fn,ms)=>{const t=setTimeout(fn,ms);return()=>clearTimeout(t)},
 launch:(payload,handlers)=>{const r=launchControlledMaterialization(payload,{checkpoint:(seq,phase)=>{emit({event:'checkpoint',seq,phase});handlers.checkpoint(seq,phase)}});if(r.status==='launched')emit({event:'launched',pid:r.process.pid});return r}})
emit({event:'ready',parentPid:process.pid})
const result=await bridge(request,guard)
emit({event:'result',result})
guard.stop()
