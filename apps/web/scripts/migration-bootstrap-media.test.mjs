import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as mod from './migration-bootstrap-plan.mjs';
import {readProvenanceInputs} from './migration-baseline-provenance.mjs';
import {loadVerifiedSequence} from './migration-bootstrap-replay-local.mjs';
const root=new URL('../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('recovered media DDL follows the BI platform prerequisite without entering canonical migrations',()=>{
 assert.equal(mod.MEDIA_FIXTURES?.length,2,'missing reviewed recovered media prerequisites');
 const plan=mod.planCanonicalBootstrap(readProvenanceInputs(fileURLToPath(root)));
 const bi=plan.sequence.findIndex(s=>s.name==='20260602_atlas_bi_foundation.sql');
 for(const pin of mod.MEDIA_FIXTURES){
  const at=plan.sequence.findIndex(s=>s.path===pin.path);
  assert.ok(at>bi&&bi>0);
  assert.equal(plan.sequence.filter(s=>s.path===pin.path).length,1);
  const [{body}]=loadVerifiedSequence([pin],read);
  assert.match(body,/LOCK TABLE ONLY public\.media_insights/);
  assert.match(body,/add column if not exists/);
  assert.doesNotMatch(body,/INSERT INTO|UPDATE public|cron\.schedule/i);
  assert.throws(()=>loadVerifiedSequence([pin],p=>read(p)+'\n-- drift'),/SHA|sha|mismatch/);
  for(const field of ['sourceLfSha256','extractedLfSha256','lfSha256'])
   assert.throws(()=>loadVerifiedSequence([{...pin,[field]:'0'.repeat(64)}],read),/synthetic|pin/i);
  assert.throws(()=>loadVerifiedSequence([{kind:'fixture',path:pin.sourcePath,lfSha256:pin.sourceLfSha256}],read),/not allowed/);
 }
 assert.equal(plan.replayReady,false);
});
test('missing or drifted historical media source blocks planning before Docker',()=>{
 assert.ok(mod.MEDIA_FIXTURES,'missing reviewed recovered media prerequisites');
 const inputs=readProvenanceInputs(fileURLToPath(root));
 for(const recoveredMedia of [[],inputs.recoveredMedia.map((r,i)=>i? r:{...r,sql:r.sql+'\n-- drift'})]){
  const plan=mod.planCanonicalBootstrap({...inputs,recoveredMedia});
  assert.ok(plan.blockers.some(b=>b.code==='synthetic_fixture_refused'));
 }
});

test('media prerequisites refuse a missing or changed BI platform anchor',()=>{
 const inputs=readProvenanceInputs(fileURLToPath(root));
 const name='20260602_atlas_bi_foundation.sql';
 for(const canonical of [
  inputs.canonical.filter(m=>m.name!==name),
  inputs.canonical.map(m=>m.name===name?{...m,sql:m.sql.replace("platform         TEXT NOT NULL DEFAULT 'instagram'","platform         TEXT DEFAULT 'instagram'")}:m)
 ]){
  const plan=mod.planCanonicalBootstrap({...inputs,canonical});
  if(canonical.some(m=>m.name===name)) assert.ok(plan.blockers.some(b=>b.code==='synthetic_fixture_refused'));
  assert.ok(!plan.sequence.some(s=>mod.MEDIA_FIXTURES.some(p=>p.path===s.path)));
 }
});
