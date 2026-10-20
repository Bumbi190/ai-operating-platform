import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectCreativeMedia } from './media-verify.mjs';

function fixture(ext, buffer, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-media-verify-'));
  const file = join(dir, 'sample.' + ext);
  try {
    writeFileSync(file, buffer);
    return fn(file);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function png(width, height) {
  const b = Buffer.alloc(33);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(b,0);
  b.writeUInt32BE(13,8);
  b.write('IHDR',12,4,'ascii');
  b.writeUInt32BE(width,16);
  b.writeUInt32BE(height,20);
  return b;
}
function webp(width, height) {
  const b = Buffer.alloc(30);
  b.write('RIFF',0,4,'ascii');
  b.writeUInt32LE(22,4);
  b.write('WEBP',8,4,'ascii');
  b.write('VP8X',12,4,'ascii');
  b.writeUInt32LE(10,16);
  b.writeUIntLE(width-1,24,3);
  b.writeUIntLE(height-1,27,3);
  return b;
}
function box(name, size) {
  const b = Buffer.alloc(size);
  b.writeUInt32BE(size,0);
  b.write(name,4,4,'ascii');
  return b;
}
test('reads expected dimensions without decoding arbitrary images', () => {
  const a = fixture('png',png(320,160), f=>inspectCreativeMedia(f));
  const b = fixture('webp',webp(320,160), f=>inspectCreativeMedia(f));
  assert.deepEqual([a.width,a.height,b.width,b.height],[320,160,320,160]);
});

test('rejects corrupt headers, RIFF size mismatch and oversized dimensions', () => {
  assert.throws(()=>fixture('webp',Buffer.alloc(45), f=>inspectCreativeMedia(f)));
  assert.throws(()=>fixture('webp',webp(320,160).subarray(0,29), f=>inspectCreativeMedia(f)));
  assert.throws(()=>fixture('png',png(100000,160), f=>inspectCreativeMedia(f)));
});

test('MP4 structural check requires bounded top-level atoms', () => {
  const valid = Buffer.concat([box('ftyp',24),box('mdat',24),box('moov',24)]);
  assert.equal(fixture('mp4',valid, f=>inspectCreativeMedia(f)).format,'mp4');
  const missing = Buffer.concat([box('ftyp',24),box('mdat',48)]);
  assert.throws(()=>fixture('mp4',missing, f=>inspectCreativeMedia(f)),/missing mp4 atoms/);
  const broken = Buffer.from(valid);
  broken.writeUInt32BE(9999999,24);
  assert.throws(()=>fixture('mp4',broken, f=>inspectCreativeMedia(f)),/invalid mp4 atom size/);
});
