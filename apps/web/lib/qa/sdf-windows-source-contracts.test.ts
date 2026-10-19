import {describe,it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import {parseSourceManifest,canonicalSourceManifest} from '../../../code-broker/src/isolation/windows/source-contracts'
import {makeSourceManifest} from './fixtures/sdf-windows-source-fixtures'
describe('strict immutable source manifest',()=>{
 it('accepts exactly the selected twenty-two files and returns a detached value',()=>{const m=makeSourceManifest();const parsed=parseSourceManifest(m);expect(parsed.files).toHaveLength(22);m.files[0].path='changed';expect(parsed.files[0].path).toBe('apps/web/lib/atlas/authorization/build.ts')})
 for(const path of ['../.env','a:b','AUX.txt','x//a','x\\\\a','/root/a','a/../b','.env','x/.git/config','x/node_modules/a','.omnira-source-manifest.json','á.ts','apps/web/lib/atlas/authorization/BUILD.ts'])it('refuses an unselected or ambiguous path '+path,()=>{const m=makeSourceManifest();m.files[0].path=path;expect(()=>parseSourceManifest(m)).toThrow()})
 for(const change of [
  (m:any)=>m.files.pop(),(m:any)=>m.files.push(m.files[0]),(m:any)=>m.files.reverse(),(m:any)=>m.files[0].gitBlobId='f'.repeat(39),
  (m:any)=>m.files[0].sha256='G'.repeat(64),(m:any)=>m.files[0].byteLength=1048577,(m:any)=>m.files[0].byteLength=-1,(m:any)=>m.files[0].byteLength=1.5,
  (m:any)=>m.files.forEach((f:any)=>f.byteLength=1048576),(m:any)=>m.baseSha='a'.repeat(40),(m:any)=>m.binding.fence=0,
  (m:any)=>m.binding.repositoryId='github.com/foreign/repo',(m:any)=>m.files[0].mode='100644',(m:any)=>m.productionAuthority=true,
  (m:any)=>m.policyId='other',(m:any)=>m.binding.extra=true,(m:any)=>m.binding.schema='sdf.windows_workspace_request.v1'
 ])it('rejects inconsistent shape, order, scope or bounds '+change.toString(),()=>{const m=makeSourceManifest();change(m);expect(()=>parseSourceManifest(m)).toThrow()})
 it('canonical bytes preserve fixed field order regardless of input insertion order',()=>{const m=makeSourceManifest();const reversed={files:m.files,baseSha:m.baseSha,policyId:m.policyId,binding:m.binding,schema:m.schema};const bytes=canonicalSourceManifest(reversed);expect(bytes.startsWith('{"schema":"sdf.windows_source_manifest.v1","binding":')).toBe(true);expect(bytes).toBe(canonicalSourceManifest(m));expect(createHash('sha256').update(bytes).digest('hex')).toHaveLength(64)})
})
