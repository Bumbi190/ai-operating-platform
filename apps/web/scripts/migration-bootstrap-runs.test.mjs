import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as planModule from './migration-bootstrap-plan.mjs';
import {readProvenanceInputs} from './migration-baseline-provenance.mjs';
import {loadVerifiedSequence} from './migration-bootstrap-replay-local.mjs';
import {sha256} from './migration-replay-preflight.mjs';
const repo=new URL('../../../',import.meta.url);
const inputs=readProvenanceInputs(fileURLToPath(repo));
const disk=p=>readFileSync(new URL(p,repo),'utf8');
test('runs prerequisite supplies kind and nullable workflow before all canonical migrations without full marketing SQL',()=>{
 const pin=planModule.RUNS_DISPATCH_FIXTURE;
 assert.ok(pin,'missing reviewed runs dispatch prerequisite');
 const plan=planModule.planCanonicalBootstrap(inputs);
 assert.equal(plan.sequence[1].path,pin.path);
 assert.ok(!plan.sequence.some(s=>s.kind==='fixture'&&s.path===pin.sourcePath));
 const [{body}]=loadVerifiedSequence([pin],disk);
 assert.match(body,/LOCK TABLE ONLY public\.runs IN ACCESS EXCLUSIVE MODE/);
 assert.match(body,/alter table public\.runs add column if not exists kind text;/);
 assert.match(body,/alter table public\.runs alter column workflow_id drop not null;/);
 assert.doesNotMatch(body,/campaign_plans|insert into|cron\.schedule|create or replace function/i);
 assert.equal(sha256(body),pin.lfSha256);
 assert.equal(plan.replayReady,false);
});
test('runs extraction rejects source drift and forged pins before execution',()=>{
 const pin=planModule.RUNS_DISPATCH_FIXTURE;
 assert.ok(pin,'missing reviewed runs dispatch prerequisite');
 assert.throws(()=>loadVerifiedSequence([pin],p=>disk(p)+'\n-- drift'),/SHA|sha|mismatch/);
 for(const field of ['sourceLfSha256','extractedLfSha256','lfSha256'])
  assert.throws(()=>loadVerifiedSequence([{...pin,[field]:'0'.repeat(64)}],disk),/synthetic|pin/i);
 assert.throws(()=>loadVerifiedSequence([{kind:'fixture',path:pin.sourcePath,lfSha256:pin.sourceLfSha256}],disk),/not allowed/);
});
