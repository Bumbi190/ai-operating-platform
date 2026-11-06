import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {CONTROL_FILES,plannedEntries,HANDOFF_SCHEMA} from './worker-handoff-manifest.mjs';
import {verifyProposedHandoffCopy} from './worker-handoff-verify.mjs';

const sha=data=>createHash('sha256').update(data).digest('hex');
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'creative-postcopy-'));
 const lock={};
 const contents=new Map();
 for(const [name,version] of [['photocraft','0.10.0'],['filmcraft','0.9.0']]){
  const release=name+'-'+version+'-windows-x64-portable';
  const zip=name+'/'+release+'.zip';
  const cli=name+'/portable/'+release+'/'+name+'-cli.exe';
  lock[name]={version,archiveRelativePath:zip,archiveSha256:sha('zip-'+name),
   binaryRelativePath:cli,sha256:sha('cli-'+name)};
  contents.set('imports/'+zip,'zip-'+name);
  contents.set('imports/'+cli,'cli-'+name);
  contents.set('imports/'+name+'/portable/'+release+'/'+name+'.exe','gui-'+name);
 }
 for(const file of CONTROL_FILES){
  contents.set('control/'+file,file==='artcraft-lock.json'?JSON.stringify(lock):'source '+file);
 }
 const expected=plannedEntries(lock);
 const rows=expected.map(entry=>{
  const content=contents.get(entry.destination);
  assert.equal(typeof content,'string',entry.destination);
  const full=join(root,...entry.destination.split('/'));
  mkdirSync(dirname(full),{recursive:true});
  writeFileSync(full,content);
  return {destination:entry.destination,sourceRole:entry.sourceRoot,
   sourceRelative:entry.sourceRelative,bytes:Buffer.byteLength(content),
   sha256:sha(content),releasePinned:entry.expectedSha256!==null};
 });
 const fingerprint=sha(JSON.stringify({schema:HANDOFF_SCHEMA,entries:rows}));
 const manifest={schema:HANDOFF_SCHEMA,mode:'read-only-proposed-handoff',entries:rows,
  entryCount:12,fingerprint,expectedDestinationRoot:'C:\\ProgramData\\OmniraCreativeWorker',
  reviewedCommitRequired:true,independentSignedApprovalRequired:true,
  protectedCopyAndPostCopyAclAuditRequired:true,sourceIsUntrustedUserWritable:true,
  approvalGranted:false,copyPerformed:false,accountActivationAllowed:false,productionReady:false};
 const pin=sha(JSON.stringify(manifest));
 const verify=(m=manifest,digest=pin)=>verifyProposedHandoffCopy({root,manifest:m,reviewedManifestSha256:digest});
 return {root,manifest,pin,verify,contents};
}
const withFixture=async fn=>{
 const f=fixture();
 try{await fn(f)}finally{rmSync(f.root,{recursive:true,force:true})}
};
test('exact 12 copy bytes verify, but never claim ACL, signature, reviewer or execution authority',()=>withFixture(async f=>{
 const r=await f.verify();
 assert.deepEqual(r,{
  schema:'omnira.creative.postcopy_read_only.v1',status:'bytes_verified_not_acl_verified',
  checkedFiles:12,reviewedManifestSha256:f.pin,
  aclVerified:false,signerVerified:false,reviewerApproved:false,
  executionEnabled:false,copyPerformed:false,productionReady:false,
 });
}));
test('untrusted manifest cannot be self-approved without external digest',()=>withFixture(async f=>{
 await assert.rejects(f.verify(f.manifest,'0'.repeat(64)),/reviewed_manifest_digest_mismatch/);
 await assert.rejects(f.verify(f.manifest,'untrusted'),/external_manifest_digest_required/);
 await assert.rejects(f.verify({...f.manifest,approvalGranted:true}),/reviewed_manifest_digest_mismatch/);
}));
test('changes to a copied control script are rejected',()=>withFixture(async f=>{
 writeFileSync(join(f.root,'control','worker-stage-binaries.ps1'),'changed after copy');
 await assert.rejects(f.verify(),/postcopy_/);
}));
test('modified GUI copy is rejected even though original GUI is not vendor pinned',()=>withFixture(async f=>{
 writeFileSync(join(f.root,'imports','filmcraft','portable','filmcraft-0.9.0-windows-x64-portable','filmcraft.exe'),'tampered');
 await assert.rejects(f.verify(),/postcopy_/);
}));
test('missing or additional file is rejected',()=>withFixture(async f=>{
 rmSync(join(f.root,'control','worker-verify.ps1'));
 await assert.rejects(f.verify(),/unexpected_or_missing_handoff_file/);
}));
test('extra file inside protected subtree blocks verification',()=>withFixture(async f=>{
 writeFileSync(join(f.root,'imports','evil.ps1'),'not approved');
 await assert.rejects(f.verify(),/unexpected_or_missing_handoff_file/);
}));
test('malformed or extra review fields fail despite recomputed digest',()=>withFixture(async f=>{
 const m={...f.manifest,approvedBy:'anonymous'};
 await assert.rejects(f.verify(m,sha(JSON.stringify(m))),/unexpected_handoff_fields/);
}));
test('manifest pinned release constraints cannot be bypassed by resigning fake metadata',()=>withFixture(async f=>{
 const m=structuredClone(f.manifest);
 const row=m.entries.find(x=>x.destination.endsWith('/filmcraft-cli.exe'));
 row.releasePinned=false;
 m.fingerprint=sha(JSON.stringify({schema:HANDOFF_SCHEMA,entries:m.entries}));
 await assert.rejects(f.verify(m,sha(JSON.stringify(m))),/pinned_release_handoff_mismatch/);
}));
test('relative root and symlink substitution are refused',()=>withFixture(async f=>{
 await assert.rejects(verifyProposedHandoffCopy({
  root:'not-absolute',manifest:f.manifest,reviewedManifestSha256:f.pin,
 }),/destination_must_be_absolute/);
 const target=join(f.root,'control','worker-verify.ps1');
 const alt=join(f.root,'alternate.txt');writeFileSync(alt,'alt data');
 rmSync(target);
 try{symlinkSync(alt,target,'file')}catch(e){
  if(['EPERM','EACCES','ENOTSUP'].includes(e.code))return;
  throw e;
 }
 await assert.rejects(f.verify(),/destination_reparse_point/);
}));
