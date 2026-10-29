/**
 * Local-only reviewer bundle. No network service, no approval endpoints, no publish.
 * Uses pinned known demo fixture filenames, validates bytes and shows a comparison.
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, realpathSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inspectCreativeMedia } from './media-verify.mjs';

export const REVIEW_SCHEMA = 'omnira.creative.review-preview.v1';

export function filenameAllowed(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,78}\.(png|webp|mp4)$/.test(name);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[c]);
}
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

export function verifyPreviewCandidate(root, group, name, expectedHash=null) {
  if (group !== 'input' && group !== 'output') throw new Error('unexpected source group');
  if (!filenameAllowed(name) || basename(name) !== name) throw new Error('invalid preview filename');
  const dir=join(root,group);
  if (!existsSync(dir) || lstatSync(dir).isSymbolicLink()) throw new Error('unsafe preview root');
  const absolute=join(dir,name);
  if (!existsSync(absolute) || lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isFile()) {
    throw new Error('preview file not regular');
  }
  const realDir=realpathSync.native(dir);
  const realFile=realpathSync.native(absolute);
  if (!realFile.toLowerCase().startsWith((realDir+sep).toLowerCase())) throw new Error('preview escaped root');
  const kind=name.split('.').pop();
  const inspected=inspectCreativeMedia(realFile,kind);
  const checksum=sha256(readFileSync(realFile));
  if (expectedHash !== null && checksum !== expectedHash) throw new Error('preview checksum mismatch');
  return Object.freeze({group,name,checksum,media:inspected});
}

export function renderPreviewHtml(bundle) {
  const input=bundle.source, image=bundle.image, video=bundle.video;
  const ref=({group,name})=>'../../'+group+'/'+encodeURIComponent(name);
  const meta=(item)=>escapeHtml(item.media.format.toUpperCase()+' · '+item.media.bytes+' bytes'+
    (item.media.width?' · '+item.media.width+'×'+item.media.height:''));
  return `<!doctype html>
<html lang="sv"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file:; media-src file:; style-src 'unsafe-inline';">
<title>Atlas Creative – lokal granskning</title>
<style>
body{font-family:system-ui,Arial;background:#0e1628;color:#edf2ff;margin:0;padding:32px}
main{max-width:1120px;margin:auto}h1{font-size:28px}p{line-height:1.6;color:#b7c6e2}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}
.panel{background:#1a2741;border:1px solid #344560;border-radius:16px;padding:18px}
img,video{max-width:100%;height:auto;border-radius:10px;background:#0b1221}
code{color:#bcd7ff;word-wrap:break-word}small{color:#a8bbd9}
.notice{border-top:1px solid #344560;padding-top:15px;margin-top:22px}
</style></head><body><main><h1>Atlas Creative – förhandsgranskning</h1>
<p>Lokala testfiler. Ingen publicering eller godkännande har skett. Detta är inte en kvalitetssäkrad produktionsleverans.</p>
<div class="grid">
<section class="panel"><h2>Originalbild</h2><img src="${ref(input)}" alt="Testbild före redigering" />
<p><small>${meta(input)}</small></p></section>
<section class="panel"><h2>PhotoCraft-resultat</h2><img src="${ref(image)}" alt="Testbild efter WebP-export" />
<p><small>${meta(image)}</small></p></section>
${video ? `<section class="panel"><h2>FilmCraft-demovideo</h2><video src="${ref(video)}" controls preload="metadata"></video>
<p><small>${meta(video)}</small></p></section>` : ""}
</div><p class="notice">Arbetsorder: <code>${escapeHtml(bundle.reviewId)}</code> ·
Status: <strong>Endast förhandsgranskning</strong> · Godkänd: Nej · Publicerad: Nej</p>
</main></body></html>`;
}
export function makeReviewBundle(root, reviewId='artcraft-fixture-001') {
  if (!/^[A-Za-z][A-Za-z0-9_-]{2,63}$/.test(reviewId)) throw new Error('invalid review id');
  const source=verifyPreviewCandidate(root,'input','atlas-test.png');
  const image=verifyPreviewCandidate(root,'output','atlas-test.webp');
  const video=verifyPreviewCandidate(root,'output','pilot.mp4');
  if (source.media.width!==image.media.width || source.media.height!==image.media.height) {
    throw new Error('image export unexpectedly changed dimensions');
  }
  return Object.freeze({
    schema: REVIEW_SCHEMA,reviewId,source,image,video,
    provenance:'local-direct-cli-fixtures-only',
    approvalStatus:'not-requested',independentQcPassed:false,
    publishAuthorized:false,executionAuthorized:false,
  });
}
export function writeReviewBundle(root,bundle) {
  const reviews=join(root,'reviews');
  if (!existsSync(reviews)) mkdirSync(reviews,{recursive:true});
  if (lstatSync(reviews).isSymbolicLink()) throw new Error('review output is symlink');
  const target=join(reviews,bundle.reviewId);
  mkdirSync(target); // no existing directory: never overwrite an older review
  writeFileSync(join(target,'manifest.json'),JSON.stringify(bundle,null,2)+'\n',{flag:'wx'});
  writeFileSync(join(target,'index.html'),renderPreviewHtml(bundle),{flag:'wx'});
  return target;
}
if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  if (process.argv.length !== 3 || process.argv[2] !== '--demo') {
    console.error('Use: node review-preview.mjs --demo');
    process.exitCode=1;
  } else {
    const root=join(homedir(),'Projects','Omnira','External','ArtCraft','_atlas_test_only');
    try {
      const bundle=makeReviewBundle(root);
      console.log(JSON.stringify({reviewPath:writeReviewBundle(root,bundle),reviewId:bundle.reviewId,status:'local-preview-only'}));
    } catch(e) { console.error('REVIEW REFUSED:',String(e.message)); process.exitCode=1; }
  }
}
