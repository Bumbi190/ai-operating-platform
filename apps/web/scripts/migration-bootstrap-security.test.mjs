import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as module from './migration-bootstrap-plan.mjs';
import {readProvenanceInputs} from './migration-baseline-provenance.mjs';
import {loadVerifiedSequence} from './migration-bootstrap-replay-local.mjs';
const root=new URL('../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('security prerequisites restore only reviewed heartbeat and config protection',()=>{
 assert.equal(module.SECURITY_FIXTURES?.length,2,'missing local security prerequisites');
 const plan=module.planCanonicalBootstrap(readProvenanceInputs(fileURLToPath(root)));
 for(const pin of module.SECURITY_FIXTURES){
  assert.equal(plan.sequence.filter(s=>s.path===pin.path).length,1);
  const [{body}]=loadVerifiedSequence([pin],read);
  assert.match(body,/LOCK TABLE ONLY public\./);
  assert.match(body,/enable row level security/i);
  assert.doesNotMatch(body,/INSERT INTO|UPDATE public|cron\.schedule|atlas_actions|token_health/i);
  assert.throws(()=>loadVerifiedSequence([pin],p=>read(p)+'\n-- drift'),/SHA|sha|mismatch/);
  for(const key of ['sourceLfSha256','extractedLfSha256','lfSha256'])
   assert.throws(()=>loadVerifiedSequence([{...pin,[key]:'0'.repeat(64)}],read),/synthetic|pin/);
 }
 assert.equal(plan.replayReady,false);
});
