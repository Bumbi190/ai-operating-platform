/**
 * Zero-dependency, read-only checks on preview artifacts.
 * A valid container is NOT proof of visual correctness or safe codec decoding.
 */
import { openSync, readSync, closeSync, lstatSync } from 'node:fs';
import { extname } from 'node:path';

function boundedRead(fd, size, start) {
  const b = Buffer.alloc(size);
  const count = readSync(fd, b, 0, size, start);
  if (count !== size) throw new Error('truncated media');
  return b;
}

function inspectPng(fd, size) {
  if (size < 33) throw new Error('invalid png length');
  const b = boundedRead(fd, 33, 0);
  if (!b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('png magic invalid');
  if (b.readUInt32BE(8) !== 13 || b.toString('ascii', 12, 16) !== 'IHDR') throw new Error('missing png IHDR');
  const width = b.readUInt32BE(16), height = b.readUInt32BE(20);
  if (!width || !height || width > 16000 || height > 16000) throw new Error('invalid image dimensions');
  return { format:'png', width, height, bytes:size };
}

function inspectWebp(fd, size) {
  if (size < 30) throw new Error('webp too short');
  const b = boundedRead(fd, 30, 0);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') throw new Error('webp magic invalid');
  if (b.readUInt32LE(4) + 8 !== size) throw new Error('webp size mismatch');
  const chunk = b.toString('ascii', 12, 16);
  let width, height;
  if (chunk === 'VP8X') {
    width = 1 + b.readUIntLE(24, 3);
    height = 1 + b.readUIntLE(27, 3);
  } else if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) throw new Error('VP8L signature invalid');
    width = 1 + (b[21] | ((b[22] & 0x3f) << 8));
    height = 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10));
  } else if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) throw new Error('VP8 frame marker invalid');
    width = b.readUInt16LE(26) & 0x3fff;
    height = b.readUInt16LE(28) & 0x3fff;
  } else {
    throw new Error('unsupported webp format');
  }
  if (!width || !height || width > 16000 || height > 16000) throw new Error('invalid image dimensions');
  return { format:'webp', width, height, bytes:size };
}

function inspectMp4(fd, size) {
  if (size < 64) throw new Error('mp4 too short');
  let offset = 0, steps = 0;
  const found = new Set();
  while (offset < size) {
    if (++steps > 100000) throw new Error('too many mp4 boxes');
    if (size - offset < 8) throw new Error('truncated mp4 box');
    const h = boundedRead(fd, 8, offset);
    let boxSize = h.readUInt32BE(0);
    const label = h.toString('ascii', 4, 8);
    if (!/^[a-zA-Z0-9 ]{4}$/.test(label)) throw new Error('invalid mp4 atom');
    let minimum = 8;
    if (boxSize === 1) {
      if (size - offset < 16) throw new Error('truncated extended mp4 box');
      const e = boundedRead(fd, 8, offset+8).readBigUInt64BE();
      if (e > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('mp4 atom too large');
      boxSize = Number(e);
      minimum = 16;
    } else if (boxSize === 0) boxSize = size - offset;
    if (boxSize < minimum || offset+boxSize > size) throw new Error('invalid mp4 atom size');
    found.add(label);
    offset += boxSize;
  }
  if (!found.has('ftyp') || !found.has('moov') || !found.has('mdat')) throw new Error('missing mp4 atoms');
  return {format:'mp4', bytes:size, atoms:[...found]};
}

export function inspectCreativeMedia(path, expectedFormat) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('non-regular media file');
  const format = expectedFormat ?? extname(path).slice(1).toLowerCase();
  const max = format === 'mp4' ? 40*1024*1024 : 20*1024*1024;
  if (stat.size < 30 || stat.size > max) throw new Error('media exceeds allowed size');
  const fd = openSync(path, 'r');
  try {
    const fresh = lstatSync(path);
    if (fresh.ino !== stat.ino || fresh.size !== stat.size) throw new Error('media changed during inspection');
    if (format === 'png') return inspectPng(fd, stat.size);
    if (format === 'webp') return inspectWebp(fd, stat.size);
    if (format === 'mp4') return inspectMp4(fd, stat.size);
    throw new Error('unsupported media format');
  } finally { closeSync(fd); }
}
