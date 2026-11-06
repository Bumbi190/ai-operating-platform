import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewImageJobReceipt } from './receipt-review.mjs';
import { filenameAllowed, renderPreviewHtml, writeReviewBundle } from './review-preview.mjs';

const LOCK=JSON.parse(readFileSync(new URL('./artcraft-lock.json',import.meta.url)));
const sha=b=>createHash('sha256').update(b).digest('hex');
function png(w,h) {
  const b=Buffer.alloc(33);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(b,0);
  b.writeUInt32BE(13,8); b.write('IHDR',12,4);
  b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);
  return b;
}
function webp(w,h) {
  const b=Buffer.alloc(30);
  b.write('RIFF',0); b.writeUInt32LE(22,4); b.write('WEBP',8);
  b.write('VP8X',12); b.writeUInt32LE(10,16);
  b.writeUIntLE(w-1,24,3); b.writeUIntLE(h-1,27,3);
  return b;
}
function fixture() {
  const root=mkdtempSync(join(tmpdir(),'atlas-creative-review-'));
  for (const d of ['input','output','requests','audit']) mkdirSync(join(root,d));
  const src=png(320,160), out=webp(320,160);
  const id='testreceipt123';
  writeFileSync(join(root,'input','input.png'),src);
  writeFileSync(join(root,'output',id+'.webp'),out);
  writeFileSync(join(root,'requests',id+'.json'),JSON.stringify({
    id,operation:'photocraft.convert-webp',inputName:'input.png',quality:82,
  }));
  writeFileSync(join(root,'audit',id+'.claimed.json'),JSON.stringify({jobId:id,status:'claimed'}));
  const receipt={jobId:id,operation:'photocraft.convert-webp',status:'staged-not-published',
    toolVersion:LOCK.photocraft.version,binaryHash:LOCK.photocraft.sha256,
    inputHash:sha(src),outputHash:sha(out),outputName:id+'.webp'};
  writeFileSync(join(root,'audit',id+'.json'),JSON.stringify(receipt));
  return {root,id,receipt};
}
test('verified receipt creates local-only, unapproved image comparison',()=>{
  const {root,id}=fixture();
  try {
    const bundle=reviewImageJobReceipt(root,id);
    assert.equal(bundle.image.media.width,320);
    assert.equal(bundle.source.media.height,160);
    assert.equal(bundle.approvalStatus,'not-requested');
    assert.equal(bundle.executionAuthorized,false);
    assert.equal(bundle.publishAuthorized,false);
    assert.equal(bundle.video,null);
    const html=renderPreviewHtml(bundle);
    assert.match(html,/Originalbild/);
    assert.match(html,/PhotoCraft-resultat/);
    assert.doesNotMatch(html,/FilmCraft-demovideo/);
    assert.doesNotMatch(html,/<script/i);
    const location=writeReviewBundle(root,bundle);
    assert.ok(readFileSync(join(location,'manifest.json'),'utf8').includes('"publishAuthorized": false'));
    assert.throws(()=>writeReviewBundle(root,bundle),/EEXIST/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('rejects fake or tampered receipt and cannot approve via file metadata',()=>{
  const {root,id,receipt}=fixture();
  try {
    const bad={...receipt,outputHash:'0'.repeat(64)};
    writeFileSync(join(root,'audit',id+'.json'),JSON.stringify(bad));
    assert.throws(()=>reviewImageJobReceipt(root,id),/checksum mismatch/);
    writeFileSync(join(root,'audit',id+'.json'),JSON.stringify({...receipt,status:'published'}));
    assert.throws(()=>reviewImageJobReceipt(root,id),/does not match claim/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('rejects preview path traversal and unknown file extensions',()=>{
  for(const name of ['../evil.png','evil.svg','a/evil.png','http://example.com/i.png','a\\i.png']) {
    assert.equal(filenameAllowed(name),false);
  }
});
