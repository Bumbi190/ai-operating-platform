import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,symlinkSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createProposedHandoff,CONTROL_FILES} from './worker-handoff-manifest.mjs';
import {testSyntheticCopyOnDisk,SYNTHETIC_FIXTURE_MARKER} from './worker-handoff-temp-copy.mjs';

const sha=data=>createHash('sha256').update(data).digest('hex');
async function fixture(){
 const root=mkdtempSync(join(tmpdir(),'omnira-creative-dryrun-'));
 const src=join(root,'src');
 const controlRoot=join(src,'control'),artcraftRoot=join(src,'artcraft');
 mkdirSync(controlRoot,{recursive:true});mkdirSync(artcraftRoot,{recursive:true});
 writeFileSync(join(root,'.synthetic-test-only'),SYNTHETIC_FIXTURE_MARKER);
 const lock={};
 for(const [name,version] of [['photocraft','0.10.0'],['filmcraft','0.9.0']]){
  const release=name+'-'+version+'-windows-x64-portable';
  const zip=name+'/'+release+'.zip';
  const cli=name+'/portable/'+release+'/'+name+'-cli.exe';
  const gui=name+'/portable/'+release+'/'+name+'.exe';
  const z=Buffer.from('synthetic archive '+name),c=Buffer.from('synthetic cli '+name);
  lock[name]={version,archiveRelativePath:zip,archiveSha256:sha(z),
   binaryRelativePath:cli,sha256:sha(c)};
  for(const [rel,buf] of [[zip,z],[cli,c],[gui,Buffer.from('synthetic gui '+name)]]){
   const file=join(artcraftRoot,...rel.split('/'));
   mkdirSync(dirname(file),{recursive:true});
   writeFileSync(file,buf);
  }
 }
 for(const name of CONTROL_FILES.filter(x=>x!=='artcraft-lock.json')){
  writeFileSync(join(controlRoot,name),'synthetic control script '+name);
 }
 writeFileSync(join(controlRoot,'artcraft-lock.json'),JSON.stringify(lock));
 const manifest=await createProposedHandoff({controlRoot,artcraftRoot});
 const reviewedManifestSha256=sha(JSON.stringify(manifest));
 return {
  root,src,manifest,reviewedManifestSha256,
  run:(extra={})=>testSyntheticCopyOnDisk({fixtureRoot:root,manifest,reviewedManifestSha256,...extra}),
 };
}
async function withFixture(fn){
 const f=await fixture();
 try{await fn(f)}finally{rmSync(f.root,{recursive:true,force:true})}
}
test('copies exactly 12 tiny fixtures under OS temp, then post-verifies every byte',()=>withFixture(async f=>{
 const result=await f.run();
 assert.equal(result.syntheticFilesCopied,12);
 assert.equal(result.productionFilesCopied,0);
 assert.equal(result.aclVerified,false);
 assert.equal(result.reviewerApproved,false);
 assert.equal(result.signerVerified,false);
 assert.equal(result.executionEnabled,false);
 assert.equal(result.productionReady,false);
 for(const row of f.manifest.entries){
  const copied=join(f.root,'candidate',...row.destination.split('/'));
  assert.equal(sha(readFileSync(copied)),row.sha256);
 }
}));
test('requires marker and exact temp fixture parent, refuses arbitrary home path',()=>withFixture(async f=>{
 const marker=join(f.root,'.synthetic-test-only');
 rmSync(marker);
 await assert.rejects(f.run(),/ENOENT|missing_fixture_marker/);
 writeFileSync(marker,'fake');
 await assert.rejects(f.run(),/missing_fixture_marker/);
 await assert.rejects(f.run({fixtureRoot:f.src}),/outside_synthetic_temp_fixture/);
 await assert.rejects(f.run({fixtureRoot:'relative'}),/synthetic_absolute_temp_root_required/);
}));
test('occupied candidate destination is preserved, nothing overwritten',()=>withFixture(async f=>{
 const target=join(f.root,'candidate');
 mkdirSync(target);
 const prior=join(target,'do-not-touch.txt');
 writeFileSync(prior,'original');
 await assert.rejects(f.run(),/synthetic_target_already_exists/);
 assert.equal(readFileSync(prior,'utf8'),'original');
}));
test('changed source between two checks refuses and leaves target absent',()=>withFixture(async f=>{
 await assert.rejects(f.run({afterPreflight:()=>{
  const file=join(f.src,'control','worker-verify.ps1');
  const changed=readFileSync(file);
  changed[0]=changed[0]===65?66:65;
  writeFileSync(file,changed);
 }}),/synthetic_source_modified_or_unpinned/);
 assert.equal(existsSync(join(f.root,'candidate')),false);
}));
test('corrupted staged copy refuses, removes partial stage and preserves source',()=>withFixture(async f=>{
 const original=readFileSync(join(f.src,'control','worker-verify.ps1'),'utf8');
 await assert.rejects(f.run({afterStage:({stage})=>{
  writeFileSync(join(stage,'control','worker-verify.ps1'),'modified staged copy');
 }}),/postcopy_/);
 assert.equal(existsSync(join(f.root,'candidate')),false);
 assert.equal(readFileSync(join(f.src,'control','worker-verify.ps1'),'utf8'),original);
 assert.deepEqual(readdirSync(f.root).filter(x=>x.startsWith('.candidate-stage-')),[]);
}));
test('injected extra staged file refuses and target remains absent',()=>withFixture(async f=>{
 await assert.rejects(f.run({afterStage:({stage})=>{
  writeFileSync(join(stage,'control','unexpected.ps1'),'rogue');
 }}),/unexpected_or_missing_handoff_file/);
 assert.equal(existsSync(join(f.root,'candidate')),false);
}));
test('new target appearing between preflight and copy cannot be overwritten',()=>withFixture(async f=>{
 await assert.rejects(f.run({afterPreflight:({target})=>{
  mkdirSync(target);writeFileSync(join(target,'keep.txt'),'existing');
 }}),/synthetic_target_race/);
 assert.equal(readFileSync(join(f.root,'candidate','keep.txt'),'utf8'),'existing');
}));
test('new target appearing just before final promotion cannot be overwritten',()=>withFixture(async f=>{
 await assert.rejects(f.run({afterStage:({target})=>{
  mkdirSync(target);writeFileSync(join(target,'keep.txt'),'existing');
 }}),/synthetic_target_race/);
 assert.equal(readFileSync(join(f.root,'candidate','keep.txt'),'utf8'),'existing');
}));
test('too-large fixture cannot masquerade as an editor binary',()=>withFixture(async f=>{
 const file=join(f.src,'control','worker-verify.ps1');
 writeFileSync(file,Buffer.alloc(65537,0x5a));
 await assert.rejects(f.run(),/synthetic_file_size_rejected/);
 assert.equal(existsSync(join(f.root,'candidate')),false);
}));
test('source symlink cannot be followed into a copied fixture',()=>withFixture(async f=>{
 const path=join(f.src,'control','worker-verify.ps1');
 const original=readFileSync(path);
 const other=join(f.root,'fake.txt');writeFileSync(other,original);
 rmSync(path);
 try{symlinkSync(other,path,'file')}catch(e){
  if(['EPERM','EACCES','ENOTSUP'].includes(e.code))return;
  throw e;
 }
 await assert.rejects(f.run(),/synthetic_reparse_or_type_rejected/);
}));
test('unapproved manifest is refused before any fixture copy',()=>withFixture(async f=>{
 await assert.rejects(f.run({reviewedManifestSha256:'f'.repeat(64)}),/reviewed_manifest_digest_mismatch/);
 assert.equal(existsSync(join(f.root,'candidate')),false);
}));
