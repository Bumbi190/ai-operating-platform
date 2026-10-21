/**
 * P22 read-only integrity recheck of ALREADY EXISTING synthetic ArtCraft
 * preview. No CLI editor execution, approvals, workers, network or DB.
 */
import assert from 'node:assert/strict';
import {lstatSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {makeReviewBundle,renderPreviewHtml,REVIEW_SCHEMA} from './review-preview.mjs';

const ID=/^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
function regular(path,kind){
 const item=lstatSync(path);
 if(item.isSymbolicLink()|| !(kind==='dir'?item.isDirectory():item.isFile()))
  throw new Error('unsafe existing review path');
 if(kind==='file'&&(item.size<1||item.size>16384))
  throw new Error('review metadata length invalid');
}
export function verifyExistingDemoReview(root,reviewId='artcraft-fixture-001'){
 if(typeof root!=='string'||!root||typeof reviewId!=='string'||!ID.test(reviewId))
  throw new Error('invalid demo review reference');
 const rootPath=resolve(root);
 regular(rootPath,'dir');
 const reviews=join(rootPath,'reviews');
 regular(reviews,'dir');
 const folder=join(reviews,reviewId);
 regular(folder,'dir');
 const manifestPath=join(folder,'manifest.json');
 const htmlPath=join(folder,'index.html');
 regular(manifestPath,'file');regular(htmlPath,'file');
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
 // Regenerate every source/output hash using immutable read-only media
 // inspectors. Manifest contents are NOT authority over disk bytes.
 const actual=makeReviewBundle(rootPath,reviewId);
 assert.ok(isDeepStrictEqual(manifest,actual),
  'saved review manifest does not match actual media hashes and scope');
 const expectedHtml=renderPreviewHtml(actual);
 assert.equal(readFileSync(htmlPath,'utf8'),expectedHtml,
  'saved preview HTML changed from verified renderer');
 assert.equal(actual.schema,REVIEW_SCHEMA);
 assert.equal(actual.approvalStatus,'not-requested');
 assert.equal(actual.independentQcPassed,false);
 assert.equal(actual.publishAuthorized,false);
 assert.equal(actual.executionAuthorized,false);
 assert.equal(actual.provenance,'local-direct-cli-fixtures-only');
 assert.equal(actual.source.media.width,actual.image.media.width);
 assert.equal(actual.source.media.height,actual.image.media.height);
 return Object.freeze({
  status:'existing-synthetic-preview-verified',
  reviewId,sourceName:actual.source.name,imageName:actual.image.name,
  videoName:actual.video.name,sourceSha256:actual.source.checksum,
  imageSha256:actual.image.checksum,videoSha256:actual.video.checksum,
  sourceWidth:actual.source.media.width,sourceHeight:actual.source.media.height,
  imageWidth:actual.image.media.width,imageHeight:actual.image.media.height,
  outputBytes:actual.image.media.bytes,videoBytes:actual.video.media.bytes,
  independentQcPassed:false,executionAuthorized:false,publishAuthorized:false,
  workerActivated:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--verify-existing'){
  console.error('Usage: node verify-existing-demo.mjs --verify-existing');
  process.exitCode=1;
 } else {
  try {
   const root=join(homedir(),'Projects','Omnira','External',
    'ArtCraft','_atlas_test_only');
   console.log(JSON.stringify(verifyExistingDemoReview(root)));
  }catch(error){
   console.error('EXISTING PREVIEW REFUSED:',String(error.message).slice(0,240));
   process.exitCode=1;
  }
 }
}
