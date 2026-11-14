/**
 * Read-only interpretation of LOCAL PhotoCraft pilot receipts.
 * A receipt is not a signature, publication authority, or source of real project permissions.
 */
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyPreviewCandidate, REVIEW_SCHEMA } from './review-preview.mjs';
import { validateJob } from './local-broker.mjs';

const LOCK = JSON.parse(readFileSync(new URL('./artcraft-lock.json',import.meta.url),'utf8'));
const ID = /^[A-Za-z][A-Za-z0-9_-]{2,39}$/;
const SHA = /^[a-f0-9]{64}$/;

function readJsonIn(root,folder,name) {
  const file=join(root,folder,name);
  if (!existsSync(file) || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) {
    throw new Error('missing or unsafe pilot receipt file');
  }
  if (lstatSync(file).size > 8192) throw new Error('oversized receipt');
  return JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
}

export function reviewImageJobReceipt(root,id) {
  if(typeof id !== 'string' || !ID.test(id)) throw new Error('invalid review job identifier');
  const request=validateJob(readJsonIn(root,'requests',id+'.json'));
  const receipt=readJsonIn(root,'audit',id+'.json');
  const claim=readJsonIn(root,'audit',id+'.claimed.json');
  if(request.id !== id || request.operation !== 'photocraft.convert-webp') {
    throw new Error('not a PhotoCraft image job');
  }
  if(receipt.jobId !== id || receipt.operation !== request.operation ||
     receipt.status !== 'staged-not-published' || claim.jobId !== id ||
     claim.status !== 'claimed') throw new Error('job receipt does not match claim');
  if(receipt.toolVersion !== LOCK.photocraft.version ||
     receipt.binaryHash !== LOCK.photocraft.sha256) throw new Error('tool build identity mismatch');
  if(receipt.outputName !== id+'.webp') throw new Error('unrecognized output name');
  if(!SHA.test(receipt.inputHash) || !SHA.test(receipt.outputHash)) {
    throw new Error('missing receipt integrity proof');
  }
  const source=verifyPreviewCandidate(root,'input',request.inputName,receipt.inputHash);
  const image=verifyPreviewCandidate(root,'output',receipt.outputName,receipt.outputHash);
  if(source.media.width !== image.media.width || source.media.height !== image.media.height) {
    throw new Error('output dimensions do not match original');
  }
  return Object.freeze({
    schema:REVIEW_SCHEMA,
    reviewId:'job-'+id,
    source,image,video:null,
    provenance:'validated-local-pilot-receipt',
    approvalStatus:'not-requested',
    independentQcPassed:false,
    publishAuthorized:false,
    executionAuthorized:false,
  });
}
