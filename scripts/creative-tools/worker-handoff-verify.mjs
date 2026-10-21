/**
 * READ ONLY post-copy bytes/inventory verifier for proposed Creative Tools handoff.
 * Independent reviewer digest must arrive out of band; neither an exact match
 * nor an owner-provided digest constitutes approval, ACL proof or permission to
 * install, activate an account, or execute an editor.
 */
import {readFileSync,readdirSync,lstatSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {isAbsolute,join,resolve,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectPinnedLock,plannedEntries,HANDOFF_SCHEMA} from './worker-handoff-manifest.mjs';

const HEX=/^[a-f0-9]{64}$/;
const PROPOSED_KEYS=['schema','mode','entries','entryCount','fingerprint',
 'expectedDestinationRoot','reviewedCommitRequired','independentSignedApprovalRequired',
 'protectedCopyAndPostCopyAclAuditRequired','sourceIsUntrustedUserWritable',
 'approvalGranted','copyPerformed','accountActivationAllowed','productionReady'];
const ROW_KEYS=['destination','sourceRole','sourceRelative','bytes','sha256','releasePinned'];
const exact=(obj,keys)=>{
 if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('invalid_handoff_structure');
 const actual=Object.keys(obj).sort();
 if(JSON.stringify(actual)!==JSON.stringify([...keys].sort()))throw Error('unexpected_handoff_fields');
};
const digest=data=>createHash('sha256').update(data).digest('hex');
const validFingerprint=m=>digest(JSON.stringify({schema:HANDOFF_SCHEMA,entries:m.entries}));
const stableFile=path=>{
 const st=lstatSync(path,{bigint:true});
 if(!st.isFile()||st.isSymbolicLink()||st.size<=0n)throw Error('handoff_file_invalid');
 return st;
};
function checkManifest(m){
 exact(m,PROPOSED_KEYS);
 if(m.schema!==HANDOFF_SCHEMA||m.mode!=='read-only-proposed-handoff'||
   m.reviewedCommitRequired!==true||m.independentSignedApprovalRequired!==true||
   m.protectedCopyAndPostCopyAclAuditRequired!==true||
   m.sourceIsUntrustedUserWritable!==true||m.approvalGranted!==false||
   m.copyPerformed!==false||m.accountActivationAllowed!==false||
   m.productionReady!==false||m.entryCount!==12||
   m.expectedDestinationRoot!=='C:\\ProgramData\\OmniraCreativeWorker'||
   !HEX.test(m.fingerprint)||!Array.isArray(m.entries)||m.entries.length!==12){
  throw Error('unexpected_handoff_semantics');
 }
 if(validFingerprint(m)!==m.fingerprint)throw Error('handoff_fingerprint_mismatch');
 // Lockfile entry is independently part of the 12 bytes, and its expected
 // SHA from the proposed manifest is compared to a real post-copy lockfile.
 for(const row of m.entries){
  exact(row,ROW_KEYS);
  if(typeof row.destination!=='string'||typeof row.sourceRelative!=='string'||
    !HEX.test(row.sha256)||!Number.isSafeInteger(row.bytes)||row.bytes<=0||
    typeof row.releasePinned!=='boolean'||
    !['control','artcraft'].includes(row.sourceRole))throw Error('invalid_handoff_entry');
 }
 const lockEntry=m.entries.find(x=>x.destination==='control/artcraft-lock.json');
 if(!lockEntry)throw Error('handoff_lock_missing');
 return true;
}
function inspectRoot(root){
 if(!isAbsolute(root))throw Error('destination_must_be_absolute');
 const normalized=resolve(root);
 let current=normalized;
 // Reject target and parents that themselves are links. No recursive traversal
 // outside the fixed handoff destination happens here.
 while(true){
  const info=lstatSync(current);
  if(info.isSymbolicLink())throw Error('destination_reparse_point');
  if(current===normalized&&!info.isDirectory())throw Error('destination_not_directory');
  const parent=resolve(current,'..');
  if(parent===current)break;
  current=parent;
 }
 return normalized;
}
function inspectCopyPath(root,path){
 const parts=path.split('/');
 if(parts.some(p=>!p||p==='.'||p==='..')||path.includes('\\')||path.includes(':')||
   !/^[A-Za-z0-9._/-]+$/.test(path)||!['control','imports'].includes(parts[0])){
  throw Error('bad_destination_relative_path');
 }
 let current=root;
 for(let i=0;i<parts.length;i++){
  current=join(current,parts[i]);
  const stat=lstatSync(current);
  if(stat.isSymbolicLink())throw Error('destination_reparse_point');
  if(i<parts.length-1&&!stat.isDirectory())throw Error('destination_parent_not_directory');
  if(i===parts.length-1&&!stat.isFile())throw Error('destination_not_regular_file');
 }
 if(relative(root,current).split(sep).join('/')!==path)throw Error('destination_escape');
 return current;
}
function allLeaves(root){
 const leaves=[];
 const scan=(path,rel)=>{
  for(const ent of readdirSync(path,{withFileTypes:true})){
   const rp=rel?rel+'/'+ent.name:ent.name;
   const full=join(path,ent.name);
   const stat=lstatSync(full);
   if(stat.isSymbolicLink())throw Error('destination_reparse_point');
   if(stat.isDirectory())scan(full,rp);
   else if(stat.isFile())leaves.push(rp);
   else throw Error('unsupported_destination_entry');
  }
 };
 for(const subtree of ['control','imports']){
  const sub=join(root,subtree),stat=lstatSync(sub);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('invalid_handoff_subtree');
  scan(sub,subtree);
 }
 return leaves.sort();
}
async function hashFile(path){
 const hash=createHash('sha256');
 for await(const chunk of createReadStream(path))hash.update(chunk);
 return hash.digest('hex');
}
/** Only a data-binding check against a separately supplied manifest digest.
 * A matching digest does not authenticate the reviewer or grant approval.
 */
export function assertReviewedHandoffManifest(manifest,reviewedManifestSha256){
 if(typeof reviewedManifestSha256!=='string'||!HEX.test(reviewedManifestSha256)){
  throw Error('external_manifest_digest_required');
 }
 const encoded=JSON.stringify(manifest);
 if(digest(encoded)!==reviewedManifestSha256)throw Error('reviewed_manifest_digest_mismatch');
 checkManifest(manifest);
 return true;
}
/**
 * Pure file read. An external ACL/ownership checker is separately mandatory.
 * This function never considers any files safe for execution or publication.
 */
export async function verifyProposedHandoffCopy({root,manifest,reviewedManifestSha256}){
 assertReviewedHandoffManifest(manifest,reviewedManifestSha256);
 const base=inspectRoot(root);
 const expected=manifest.entries.map(x=>x.destination).sort();
 if(expected.some((name,i)=>i&&name.toLowerCase()===expected[i-1].toLowerCase()))throw Error('duplicate_handoff_destination');
 const present=allLeaves(base);
 if(JSON.stringify(present)!==JSON.stringify(expected)){
  throw Error('unexpected_or_missing_handoff_file');
 }
 for(const row of manifest.entries){
  const path=inspectCopyPath(base,row.destination);
  const before=stableFile(path);
  if(before.size!==BigInt(row.bytes))throw Error('postcopy_size_mismatch');
  const sha=await hashFile(path);
  const after=stableFile(path);
  if(before.size!==after.size||before.mtimeNs!==after.mtimeNs||
    before.ino!==after.ino||before.dev!==after.dev)throw Error('postcopy_changed_during_read');
  if(sha!==row.sha256)throw Error('postcopy_sha256_mismatch');
 }
 // The independently pinned ZIP/CLI release hash constraints must still be
 // true for the actual protected copies. Do not trust manifest flags alone.
 const lockRaw=readFileSync(join(base,'control','artcraft-lock.json'),'utf8');
 const lock=JSON.parse(lockRaw);
 inspectPinnedLock(lock);
 const plans=plannedEntries(lock);
 for(const planned of plans){
  const result=manifest.entries.find(x=>x.destination===planned.destination);
  if(!result||result.releasePinned!==(planned.expectedSha256!==null)||
    (planned.expectedSha256!==null&&result.sha256!==planned.expectedSha256)){
   throw Error('pinned_release_handoff_mismatch');
  }
 }
 return Object.freeze({
  schema:'omnira.creative.postcopy_read_only.v1',status:'bytes_verified_not_acl_verified',
  checkedFiles:12,reviewedManifestSha256,
  aclVerified:false,signerVerified:false,reviewerApproved:false,
  executionEnabled:false,copyPerformed:false,productionReady:false,
 });
}
async function main(){
 // Deliberately no CLI for privileged execution or source-controlled proof.
 // The independent reviewer must supply the manifest and pin to a controlled
 // verifier separately, not through a user-editable Worktree command.
 throw Error('Library-only verifier: no CLI or install command is provided');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(e=>{console.error(e.message);process.exitCode=1;});
}
