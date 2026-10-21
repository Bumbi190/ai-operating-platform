import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,truncateSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createProposedHandoff,plannedEntries,inspectPinnedLock,CONTROL_FILES} from './worker-handoff-manifest.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'atlas-creative-handoff-'));
 const controlRoot=join(root,'scripts');
 const artcraftRoot=join(root,'artcraft');
 mkdirSync(controlRoot,{recursive:true});mkdirSync(artcraftRoot,{recursive:true});
 for(const name of CONTROL_FILES.filter(x=>x!=='artcraft-lock.json')){
  writeFileSync(join(controlRoot,name),'reviewable script: '+name);
 }
 const lock={};
 for(const [name,version] of [['photocraft','0.10.0'],['filmcraft','0.9.0']]){
  const release=name+'-'+version+'-windows-x64-portable';
  const archiveRelativePath=name+'/'+release+'.zip';
  const binaryRelativePath=name+'/portable/'+release+'/'+name+'-cli.exe';
  const guiPath=name+'/portable/'+release+'/'+name+'.exe';
  const zipData=Buffer.from('test-only ZIP bytes: '+name);
  const cliData=Buffer.from('test-only CLI bytes: '+name);
  const guiData=Buffer.from('test-only GUI bytes: '+name);
  for(const [rel,data] of [[archiveRelativePath,zipData],[binaryRelativePath,cliData],[guiPath,guiData]]){
   const file=join(artcraftRoot,...rel.split('/'));
   mkdirSync(dirname(file),{recursive:true});writeFileSync(file,data);
  }
  lock[name]={version,binaryRelativePath,sha256:sha(cliData),archiveRelativePath,archiveSha256:sha(zipData)};
 }
 writeFileSync(join(controlRoot,'artcraft-lock.json'),JSON.stringify(lock));
 return {root,controlRoot,artcraftRoot,lock};
}
const withFixture=async fn=>{
 const f=fixture();
 try{await fn(f)}finally{rmSync(f.root,{recursive:true,force:true})}
};
test('only six fixed control files and six fixed media sources are ever proposed',async()=>withFixture(async f=>{
 const m=await createProposedHandoff(f);
 assert.equal(m.schema,'omnira.creative.proposed_handoff.v1');
 assert.equal(m.mode,'read-only-proposed-handoff');
 assert.equal(m.entryCount,12);
 assert.equal(m.entries.filter(x=>x.destination.startsWith('control/')).length,6);
 assert.equal(m.entries.filter(x=>x.destination.startsWith('imports/')).length,6);
 assert.equal(new Set(m.entries.map(x=>x.destination.toLowerCase())).size,12);
 assert.equal(m.approvalGranted,false);
 assert.equal(m.copyPerformed,false);
 assert.equal(m.productionReady,false);
 assert.equal(m.sourceIsUntrustedUserWritable,true);
 assert.equal(m.independentSignedApprovalRequired,true);
 assert.match(m.fingerprint,/^[a-f0-9]{64}$/);
 assert.deepEqual((await createProposedHandoff(f)).entries,m.entries);
 assert.equal((await createProposedHandoff(f)).fingerprint,m.fingerprint);
}));
test('user-writable control script changes the fingerprint and never constitutes approval',async()=>withFixture(async f=>{
 const original=await createProposedHandoff(f);
 const file=join(f.controlRoot,'worker-stage-binaries.ps1');
 writeFileSync(file,'modified after prior review');
 const changed=await createProposedHandoff(f);
 assert.notEqual(original.fingerprint,changed.fingerprint);
 assert.equal(changed.approvalGranted,false);
 assert.equal(changed.protectedCopyAndPostCopyAclAuditRequired,true);
}));
test('changed ZIP fails pinned expected digest, even if filename is the same',async()=>withFixture(async f=>{
 const zip=join(f.artcraftRoot,...f.lock.photocraft.archiveRelativePath.split('/'));
 writeFileSync(zip,'changed data at same path');
 await assert.rejects(createProposedHandoff(f),/handoff_pinned_digest_mismatch/);
}));
test('changed CLI fails pinned expected digest',async()=>withFixture(async f=>{
 const exe=join(f.artcraftRoot,...f.lock.filmcraft.binaryRelativePath.split('/'));
 writeFileSync(exe,'malicious payload');
 await assert.rejects(createProposedHandoff(f),/handoff_pinned_digest_mismatch/);
}));
test('GUI changes are observable in fingerprint, never misrepresented as independently pinned',async()=>withFixture(async f=>{
 const old=await createProposedHandoff(f);
 const file=join(f.artcraftRoot,'photocraft/portable/photocraft-0.10.0-windows-x64-portable/photocraft.exe');
 writeFileSync(file,'gui changed');
 const next=await createProposedHandoff(f);
 assert.notEqual(next.fingerprint,old.fingerprint);
 assert.equal(next.entries.find(e=>e.destination.endsWith('photocraft.exe')).releasePinned,false);
}));
test('path traversal, wrong version and injected manifest keys fail before file IO',async()=>withFixture(async f=>{
 for(const bad of [
  {...f.lock,photocraft:{...f.lock.photocraft,binaryRelativePath:'../stolen.exe'}},
  {...f.lock,photocraft:{...f.lock.photocraft,archiveRelativePath:'photocraft/../../rogue.zip'}},
  {...f.lock,photocraft:{...f.lock.photocraft,version:'0.99.0'}},
  {...f.lock,photocraft:{...f.lock.photocraft,sha256:'z'.repeat(64)}},
  {...f.lock,photocraft:{...f.lock.photocraft,approved:true}},
  {...f.lock,unknown:{version:'9.9.9'}},
 ]){
  assert.throws(()=>plannedEntries(bad),/unexpected_/);
 }
 assert.equal(inspectPinnedLock(f.lock),true);
}));
test('required file missing never generates a partial manifest',async()=>withFixture(async f=>{
 rmSync(join(f.artcraftRoot,'filmcraft/portable/filmcraft-0.9.0-windows-x64-portable/filmcraft.exe'));
 await assert.rejects(createProposedHandoff(f));
}));
test('relative roots cannot be used to redirect a manifest source',async()=>withFixture(async f=>{
 await assert.rejects(createProposedHandoff({...f,controlRoot:'relative/scripts'}),/unsafe_handoff_source/);
 await assert.rejects(createProposedHandoff({...f,artcraftRoot:'relative/artcraft'}),/unsafe_handoff_source/);
}));
test('oversized file fails closed before it is hashed',async()=>withFixture(async f=>{
 const target=join(f.artcraftRoot,'photocraft/portable/photocraft-0.10.0-windows-x64-portable/photocraft.exe');
 truncateSync(target,151*1024*1024);
 await assert.rejects(createProposedHandoff(f),/handoff_file_over_budget/);
}));
test('reparse/symlink substitution cannot be silently followed',async t=>withFixture(async f=>{
 const target=join(f.artcraftRoot,'photocraft/portable/photocraft-0.10.0-windows-x64-portable/photocraft.exe');
 const other=join(f.root,'other.txt');writeFileSync(other,'fake substitute');
 rmSync(target);
 try{symlinkSync(other,target,'file')}catch(e){
  if(['EPERM','EACCES','ENOTSUP'].includes(e.code)){t.diagnostic('Symlinks require privilege on this Windows host');return}
  throw e;
 }
 await assert.rejects(createProposedHandoff(f),/handoff_link_or_reparse/);
}));
