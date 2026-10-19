import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {verifyDependencyInventory} from './dependency-inventory.mjs'
const ROOT='/workspace/repo',sha=b=>createHash('sha256').update(b).digest('hex')
const PATHS=["apps/web/lib/atlas/authorization/build.ts","apps/web/lib/atlas/authorization/derive.ts","apps/web/lib/atlas/authorization/types.ts","apps/web/lib/atlas/code-work/binding.ts","apps/web/lib/atlas/code-work/capability.ts","apps/web/lib/atlas/code-work/command-registry.ts","apps/web/lib/atlas/code-work/evidence.ts","apps/web/lib/atlas/code-work/lifecycle.ts","apps/web/lib/atlas/code-work/patch-protocol.ts","apps/web/lib/atlas/code-work/path-policy.ts","apps/web/lib/atlas/code-work/policy.ts","apps/web/lib/atlas/code-work/repository-registry.ts","apps/web/lib/atlas/code-work/terminal-evidence.ts","apps/web/lib/atlas/code-work/types.ts","apps/web/lib/atlas/code-work/worker-registry.ts","apps/web/lib/qa/__stubs__/server-only.ts","apps/web/lib/qa/sdf1a-code-work-contracts.test.ts","apps/web/package.json","apps/web/tsconfig.json","package-lock.json","package.json","packages/local-text-contract/package.json"]
export function strictJson(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>262144)throw Error('JSON bound')
 let at=0;const bad=()=>{throw Error('invalid JSON')},ws=()=>{while(/[ \t\r\n]/.test(text[at]??'x'))at++}
 const string=()=>{const start=at;if(text[at++]!=='"')bad();while(at<text.length){const c=text[at++];if(c==='"')return JSON.parse(text.slice(start,at));if(c==='\\')at++}bad()}
 function value(depth){if(depth>16)bad();ws();if(text[at]==='{'){at++;ws();const seen=new Set();if(text[at]==='}'){at++;return}for(;;){ws();const key=string();if(seen.has(key))bad();seen.add(key);ws();if(text[at++]!==':')bad();value(depth+1);ws();const n=text[at++];if(n==='}')return;if(n!==',')bad()}}
 else if(text[at]==='['){at++;ws();if(text[at]===']'){at++;return}for(;;){value(depth+1);ws();const n=text[at++];if(n===']')return;if(n!==',')bad()}}
 else if(text[at]==='"')string();else{const m=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(at));if(!m)bad();at+=m[0].length}}
 value(0);ws();if(at!==text.length)bad();return JSON.parse(text)
}
export function validateVitestReport(text){
 const r=strictJson(text),whole=n=>Number.isSafeInteger(n)&&n>=0
 for(const key of ['numTotalTestSuites','numPassedTestSuites','numFailedTestSuites','numPendingTestSuites','numTotalTests','numPassedTests','numFailedTests','numPendingTests','numTodoTests'])if(!whole(r[key]))throw Error('test counts')
 if(r.success!==true||r.numTotalTestSuites<1||r.numPassedTestSuites!==r.numTotalTestSuites||r.numFailedTestSuites!==0||r.numPendingTestSuites!==0||r.numTotalTests<1||r.numPassedTests!==r.numTotalTests||r.numFailedTests!==0||r.numPendingTests!==0||r.numTodoTests!==0||!Array.isArray(r.testResults)||r.testResults.length!==1)throw Error('fixture incomplete')
 const suite=r.testResults[0];if(suite.status!=='passed'||!Array.isArray(suite.assertionResults)||suite.assertionResults.length!==r.numTotalTests||suite.assertionResults.some(a=>a.status!=='passed'))throw Error('assertions incomplete')
 return {totalTests:r.numTotalTests,passedTests:r.numPassedTests,failedTests:0,skippedTests:0}
}
function source(expected){
 if(!/^[a-f0-9]{64}$/.test(expected))throw Error('source pin')
 const manifestBytes=fs.readFileSync(ROOT+'/.omnira-source-manifest.json');if(sha(manifestBytes)!==expected)throw Error('manifest mismatch')
 const m=strictJson(manifestBytes.toString('utf8'))
 if(m.schema!=='sdf.windows_source_manifest.v1'||m.policyId!=='sdf.windows_source_fixture.v1'||m.files?.length!==22)throw Error('manifest scope')
 const allowed=new Set(['.omnira-source-manifest.json','node_modules']);let total=0
 for(let i=0;i<PATHS.length;i++){
  const file=m.files[i];if(file.path!==PATHS[i]||!Number.isSafeInteger(file.byteLength)||file.byteLength<0||file.byteLength>1048576)throw Error('file scope')
  total+=file.byteLength;if(total>16777216)throw Error('source size')
  const parts=file.path.split('/');for(let n=1;n<parts.length;n++)allowed.add(parts.slice(0,n).join('/'));allowed.add(file.path)
  const p=ROOT+'/'+file.path,s=fs.lstatSync(p);if(!s.isFile()||s.nlink!==1||s.uid!==10001||s.gid!==10001||s.size!==file.byteLength||(s.mode&0o777)!==0o644||sha(fs.readFileSync(p))!==file.sha256)throw Error('source identity')
 }
 const link=fs.lstatSync(ROOT+'/node_modules');if(!link.isSymbolicLink()||fs.readlinkSync(ROOT+'/node_modules')!=='/opt/omnira/deps/node_modules')throw Error('dependency mount link')
 function walk(relative){for(const name of fs.readdirSync(ROOT+(relative?'/'+relative:''))){const r=relative?relative+'/'+name:name;if(!allowed.has(r))throw Error('unexpected source');const s=fs.lstatSync(ROOT+'/'+r);if(s.isDirectory())walk(r);else if(r!=='node_modules'&&!s.isFile())throw Error('source type')}}
 walk('');return m
}
const redact=s=>s.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,'[redacted-key]').replace(/(?:sk-proj-|sk-ant-|sk-)[A-Za-z0-9_-]{20,}/g,'[redacted-token]').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'')
async function run(){
 if(process.argv.length!==2||process.getuid()!==10001||process.getgid()!==10001)throw Error('fixed nonroot entrypoint only')
 const inventoryHash=process.env.OMNIRA_DEPENDENCY_INVENTORY_SHA256,manifestHash=process.env.OMNIRA_SOURCE_MANIFEST_SHA256
 verifyDependencyInventory(inventoryHash);source(manifestHash)
 const probe=ROOT+'/.omnira-write-probe';const fd=fs.openSync(probe,'wx',0o600);fs.writeSync(fd,'owned');fs.closeSync(fd);fs.unlinkSync(probe)
 fs.copyFileSync('/opt/omnira/vitest-fixture.config.mjs','/tmp/omnira-vitest.config.mjs',fs.constants.COPYFILE_EXCL)
 const start=Date.now();let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),overflow=false
 const child=spawn('/usr/local/bin/node',['--max-old-space-size=192','/opt/omnira/deps/node_modules/vitest/vitest.mjs','run','--config','/tmp/omnira-vitest.config.mjs','--reporter=json','--outputFile=/tmp/omnira-fixture-result.json'],{cwd:ROOT+'/apps/web',shell:false,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',TMPDIR:'/tmp',LANG:'C.UTF-8',NODE_ENV:'test',NODE_OPTIONS:'--max-old-space-size=192'},stdio:['ignore','pipe','pipe']})
 for(const [stream,name] of [[child.stdout,'out'],[child.stderr,'err']])stream.on('data',b=>{if(stdout.length+stderr.length+b.length>65536){overflow=true;child.kill('SIGKILL');return}if(name==='out')stdout=Buffer.concat([stdout,b]);else stderr=Buffer.concat([stderr,b])})
 const timer=setTimeout(()=>child.kill('SIGKILL'),90000);const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve(signal?null:code))});clearTimeout(timer)
 if(exit!==0||overflow)throw Error('fixture process failed')
 const resultBytes=fs.readFileSync('/tmp/omnira-fixture-result.json');if(resultBytes.length>262144)throw Error('fixture result too large');const counts=validateVitestReport(resultBytes.toString('utf8'))
 source(manifestHash);verifyDependencyInventory(inventoryHash)
 const versions={nodeVersion:process.versions.node,typeScriptVersion:JSON.parse(fs.readFileSync('/opt/omnira/deps/node_modules/typescript/package.json','utf8')).version,vitestVersion:JSON.parse(fs.readFileSync('/opt/omnira/deps/node_modules/vitest/package.json','utf8')).version}
 if(versions.nodeVersion!=='22.23.3'||versions.typeScriptVersion!=='5.9.3'||versions.vitestVersion!=='2.1.9')throw Error('runtime version mismatch')
 console.log(JSON.stringify({schema:'sdf.node_fixture_result.v1',uid:process.getuid(),gid:process.getgid(),...versions,...counts,exitCode:exit,durationMs:Date.now()-start,sourceManifestSha256:manifestHash,beforeAfterSourceEqual:true,stdoutSha256:sha(stdout),stderrSha256:sha(stderr),redactedStdout:redact(stdout.toString('utf8')),redactedStderr:redact(stderr.toString('utf8'))}))
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(()=>{console.error('omnira_fixed_fixture_failed');process.exitCode=1})
