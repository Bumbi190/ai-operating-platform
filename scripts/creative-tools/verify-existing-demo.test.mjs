import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {makeReviewBundle,writeReviewBundle} from './review-preview.mjs';
import {verifyExistingDemoReview} from './verify-existing-demo.mjs';

function png(w,h) {
 const b=Buffer.alloc(33);
 Buffer.from([137,80,78,71,13,10,26,10]).copy(b,0);
 b.writeUInt32BE(13,8);b.write('IHDR',12,4);
 b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);
 return b;
}
function webp(w,h){
 const b=Buffer.alloc(30);
 b.write('RIFF',0);b.writeUInt32LE(22,4);b.write('WEBP',8);
 b.write('VP8X',12);b.writeUInt32LE(10,16);
 b.writeUIntLE(w-1,24,3);b.writeUIntLE(h-1,27,3);
 return b;
}
function demoMp4(){
 const b=Buffer.alloc(80);
 const boxes=[{offset:0,size:16,label:'ftyp'},
  {offset:16,size:16,label:'moov'},
  {offset:32,size:48,label:'mdat'}];
 for(const {offset,size,label} of boxes){
  b.writeUInt32BE(size,offset);b.write(label,offset+4,4,'ascii');
 }
 return b;
}
function setup(){
 const root=mkdtempSync(join(tmpdir(),'omnira-artcraft-p22-'));
 mkdirSync(join(root,'input'));mkdirSync(join(root,'output'));
 writeFileSync(join(root,'input','atlas-test.png'),png(320,160));
 writeFileSync(join(root,'output','atlas-test.webp'),webp(320,160));
 writeFileSync(join(root,'output','pilot.mp4'),demoMp4());
 const bundle=makeReviewBundle(root,'localFixtureP22');
 const folder=writeReviewBundle(root,bundle);
 return {root,folder,bundle,dispose:()=>rmSync(root,{recursive:true,force:true})};
}
test('existing synthetic review verifies current file hashes without publishing',()=>{
 const f=setup();
 try{
  const reviewed=verifyExistingDemoReview(f.root,'localFixtureP22');
  assert.equal(reviewed.status,'existing-synthetic-preview-verified');
  assert.equal(reviewed.imageWidth,320);
  assert.equal(reviewed.sourceHeight,160);
  assert.equal(reviewed.executionAuthorized,false);
  assert.equal(reviewed.publishAuthorized,false);
  assert.equal(reviewed.independentQcPassed,false);
  assert.equal(reviewed.workerActivated,false);
 }finally{f.dispose()}
});
test('modified PhotoCraft image is rejected even if the old saved manifest says valid',()=>{
 const f=setup();
 try{
  const path=join(f.root,'output','atlas-test.webp');
  const bytes=readFileSync(path);
  bytes[17]^=1;
  writeFileSync(path,bytes);
  assert.throws(()=>verifyExistingDemoReview(f.root,'localFixtureP22'),
   /manifest does not match/);
 }finally{f.dispose()}
});
test('changed FilmCraft demo hash is refused',()=>{
 const f=setup();
 try{
  const path=join(f.root,'output','pilot.mp4');
  const bytes=readFileSync(path);bytes[60]^=1;writeFileSync(path,bytes);
  assert.throws(()=>verifyExistingDemoReview(f.root,'localFixtureP22'),
   /manifest does not match/);
 }finally{f.dispose()}
});
test('saved preview HTML must be exactly the verified local-only renderer output',()=>{
 const f=setup();
 try{
  const path=join(f.folder,'index.html');
  writeFileSync(path,readFileSync(path,'utf8')+'\n<script>alert(1)</script>');
  assert.throws(()=>verifyExistingDemoReview(f.root,'localFixtureP22'),
   /HTML changed/);
 }finally{f.dispose()}
});
test('forged approval and false media provenance in a manifest are rejected',()=>{
 const f=setup();
 try{
  const path=join(f.folder,'manifest.json');
  const data=JSON.parse(readFileSync(path,'utf8'));
  data.publishAuthorized=true;
  data.independentQcPassed=true;
  data.provenance='Atlas-approved-production';
  writeFileSync(path,JSON.stringify(data));
  assert.throws(()=>verifyExistingDemoReview(f.root,'localFixtureP22'),
   /manifest does not match/);
 }finally{f.dispose()}
});
test('review names cannot select other paths or network resources',()=>{
 const f=setup();
 try {
  for(const name of ['../other','a/b','a\\b','', 'https://example.invalid'])
   assert.throws(()=>verifyExistingDemoReview(f.root,name),/invalid demo review reference/);
 }finally{f.dispose()}
});
test('re-running verification does not overwrite or mutate the original private preview',()=>{
 const f=setup();
 try{
  const manifest=join(f.folder,'manifest.json');
  const before=readFileSync(manifest);
  verifyExistingDemoReview(f.root,'localFixtureP22');
  verifyExistingDemoReview(f.root,'localFixtureP22');
  assert.ok(before.equals(readFileSync(manifest)));
 }finally{f.dispose()}
});
