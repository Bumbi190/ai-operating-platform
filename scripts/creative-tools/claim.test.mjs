import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {claimPilotJob} from './local-broker.mjs';

test('same job can only be claimed once, even after process exits', () => {
  const root=mkdtempSync(join(tmpdir(),'atlas-creative-claim-'));
  try {
    const claim=claimPilotJob(root,'jobA001');
    assert.equal(JSON.parse(readFileSync(claim,'utf8')).status,'claimed');
    assert.throws(()=>claimPilotJob(root,'jobA001'),/EEXIST/);
    assert.throws(()=>claimPilotJob(root,'..\\wrong'),/invalid job claim identifier/);
    assert.throws(()=>claimPilotJob(root,'../wrong'),/invalid job claim identifier/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
