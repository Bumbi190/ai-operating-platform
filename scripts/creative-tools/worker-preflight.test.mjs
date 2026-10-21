import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateWorkerPreflight} from './worker-preflight.mjs';

const ready={
  platform:'win32',username:'omnira-media-worker',workerName:'omnira-media-worker',
  restrictedAccountVerified:true,restrictedStagingAclVerified:true,
  networkEgressRestricted:true,hashesMatch:true,
  approvalAndReplayEnforced:true,authenticatedCreativeQueue:true,
};
test('never treat owner session as a safe autonomous worker',()=>{
  assert.equal(evaluateWorkerPreflight({...ready,username:'Andre'}).ready,false);
  assert.equal(evaluateWorkerPreflight({...ready,restrictedAccountVerified:false}).ready,false);
});
test('all independent readiness gates must be proven',()=>{
  assert.equal(evaluateWorkerPreflight(ready).ready,true);
  for(const field of ['restrictedStagingAclVerified','networkEgressRestricted','hashesMatch','approvalAndReplayEnforced','authenticatedCreativeQueue']) {
    assert.equal(evaluateWorkerPreflight({...ready,[field]:false}).ready,false,field);
  }
});
