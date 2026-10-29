/**
 * Read-only, deterministic proposed transfer inventory for Atlas Creative Worker.
 * NOT an authorization, signature, privileged handoff, or write/copy action.
 * Source files are ordinary user-writable files: independent pinned approval
 * and admin-controlled copy are required before protected staging.
 */
import {createReadStream,lstatSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {dirname,join,resolve,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

export const HANDOFF_SCHEMA='omnira.creative.proposed_handoff.v1';
export const CONTROL_FILES=Object.freeze([
 'artcraft-lock.json','worker-acl-policy.ps1','worker-archive-audit.ps1',
 'worker-archive-policy.ps1','worker-stage-binaries.ps1','worker-verify.ps1',
]);
const APPS=Object.freeze([
 Object.freeze({name:'photocraft',version:'0.10.0'}),
 Object.freeze({name:'filmcraft',version:'0.9.0'}),
]);
const HASH=/^[a-f0-9]{64}$/;
const releaseName=app=>app.name+'-'+app.version+'-windows-x64-portable';
const fixed=(obj,keys)=>{
 if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('invalid_handoff_lock');
 const actual=Object.keys(obj).sort();
 if(JSON.stringify(actual)!==JSON.stringify([...keys].sort()))throw Error('unexpected_lock_keys');
};
export function inspectPinnedLock(lock){
 fixed(lock,APPS.map(x=>x.name));
 for(const app of APPS){
  const e=lock[app.name];fixed(e,['version','binaryRelativePath','sha256','archiveRelativePath','archiveSha256']);
  const dir=releaseName(app);
  const exe=app.name+'-cli.exe';
  if(e.version!==app.version||
     e.binaryRelativePath!==app.name+'/portable/'+dir+'/'+exe||
     e.archiveRelativePath!==app.name+'/'+dir+'.zip'||
     typeof e.sha256!=='string'||!HASH.test(e.sha256)||
     typeof e.archiveSha256!=='string'||!HASH.test(e.archiveSha256))throw Error('unexpected_handoff_lock_values');
 }
 return true;
}
export function plannedEntries(lock){
 inspectPinnedLock(lock);
 const rows=CONTROL_FILES.map(n=>({
  role:'control',sourceRoot:'control',sourceRelative:n,destination:'control/'+n,
  expectedSha256:null,maxBytes:128*1024,
 }));
 for(const app of APPS){
  const entry=lock[app.name];
  const zip=entry.archiveRelativePath;
  const cli=entry.binaryRelativePath;
  const gui=cli.slice(0,-(app.name+'-cli.exe').length)+app.name+'.exe';
  rows.push({role:'archive',sourceRoot:'artcraft',sourceRelative:zip,destination:'imports/'+zip,
   expectedSha256:entry.archiveSha256,maxBytes:125*1024*1024});
  rows.push({role:'cli',sourceRoot:'artcraft',sourceRelative:cli,destination:'imports/'+cli,
   expectedSha256:entry.sha256,maxBytes:150*1024*1024});
  rows.push({role:'gui',sourceRoot:'artcraft',sourceRelative:gui,destination:'imports/'+gui,
   expectedSha256:null,maxBytes:150*1024*1024});
 }
 const unique=new Set();
 for(const r of rows){
  if(!/^[a-z0-9._/-]+$/i.test(r.destination)||r.destination.includes('..')||
    unique.has(r.destination.toLowerCase()))throw Error('unsafe_handoff_destination');
  unique.add(r.destination.toLowerCase());
 }
 return rows.sort((a,b)=>a.destination.localeCompare(b.destination,'en'));
}
function resolveLiteralRegularFile(root,rel){
 if(typeof root!=='string'||!isAbsolute(root)||!rel||rel.startsWith('/')||rel.includes('\\')||
   rel.split('/').some(x=>!x||x==='..'||x==='.')||rel.includes(':'))throw Error('unsafe_handoff_source');
 let current=resolve(root);
 const components=rel.split('/');
 for(let i=-1;i<components.length;i++){
  if(i>=0)current=join(current,components[i]);
  const st=lstatSync(current);
  if(st.isSymbolicLink())throw Error('handoff_link_or_reparse');
  if(i<components.length-1 && !st.isDirectory())throw Error('handoff_parent_not_directory');
  if(i===components.length-1 && (!st.isFile()||st.size<=0))throw Error('handoff_source_not_regular_file');
 }
 if(relative(resolve(root),current).split(sep).join('/')!==rel)throw Error('handoff_path_escape');
 return current;
}
async function hashStream(path){
 const sha=createHash('sha256');
 for await(const chunk of createReadStream(path))sha.update(chunk);
 return sha.digest('hex');
}
/**
 * Returns source OBSERVATIONS only. A hash computed from a writable file is
 * not an independent approved pin. Never copy or trust this manifest alone.
 */
export async function createProposedHandoff({controlRoot,artcraftRoot}){
 const lockPath=resolveLiteralRegularFile(controlRoot,'artcraft-lock.json');
 const lock=JSON.parse(readFileSync(lockPath,'utf8'));
 const plan=plannedEntries(lock);
 const results=[];
 for(const entry of plan){
  const root=entry.sourceRoot==='control'?controlRoot:artcraftRoot;
  const source=resolveLiteralRegularFile(root,entry.sourceRelative);
  const before=lstatSync(source);
  if(before.size>entry.maxBytes)throw Error('handoff_file_over_budget');
  const sha256=await hashStream(source);
  const after=lstatSync(source);
  if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('handoff_changed_during_read');
  if(entry.expectedSha256!==null&&sha256!==entry.expectedSha256)throw Error('handoff_pinned_digest_mismatch');
  results.push({
   destination:entry.destination,sourceRole:entry.sourceRoot,sourceRelative:entry.sourceRelative,
   bytes:before.size,sha256,releasePinned:entry.expectedSha256!==null,
  });
 }
 const fingerprint=createHash('sha256').update(JSON.stringify({
  schema:HANDOFF_SCHEMA,entries:results,
 })).digest('hex');
 return {
  schema:HANDOFF_SCHEMA,mode:'read-only-proposed-handoff',entries:results,
  entryCount:results.length,fingerprint,
  expectedDestinationRoot:'C:\\ProgramData\\OmniraCreativeWorker',
  reviewedCommitRequired:true,independentSignedApprovalRequired:true,
  protectedCopyAndPostCopyAclAuditRequired:true,
  sourceIsUntrustedUserWritable:true,approvalGranted:false,copyPerformed:false,
  accountActivationAllowed:false,productionReady:false,
 };
}
async function main(){
 if(process.argv.length!==2){throw Error('Usage: node worker-handoff-manifest.mjs (no arguments; read-only)')}
 const controlRoot=dirname(fileURLToPath(import.meta.url));
 const artcraftRoot=join(homedir(),'Projects','Omnira','External','ArtCraft');
 console.log(JSON.stringify(await createProposedHandoff({controlRoot,artcraftRoot}),null,2));
}
if(process.argv[1]&&resolve(process.argv[1]).toLowerCase()===fileURLToPath(import.meta.url).toLowerCase()){
 main().catch(e=>{console.error('Proposed handoff unavailable: '+e.message);process.exitCode=1;});
}
