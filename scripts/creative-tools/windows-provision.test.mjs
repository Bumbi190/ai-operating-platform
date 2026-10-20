import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
function inspect(script) {
  const result=spawnSync('powershell.exe',['-NoProfile','-File',join(here,script)],{
    encoding:'utf8',timeout:12000,maxBuffer:100000,
  });
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
}
test('worker provisioning is a read-only plan by default',()=>{
  if(process.platform!=='win32') return;
  const r=inspect('worker-provision.ps1');
  assert.equal(r.mode,'plan-only');
  assert.equal(r.changesApplied,false);
  assert.equal(r.productionReady,false);
});
test('worker security inspection remains read-only and fail closed',()=>{
  if(process.platform!=='win32') return;
  const r=inspect('worker-verify.ps1');
  assert.equal(r.mode,'read-only-verification');
  assert.equal(r.productionReady,false);
  assert.equal(r.signedQueueConfigured,false);
  assert.equal(r.workerExecutionEnabled,false);
  assert.equal(r.folderChecks.length,7);
  for(const folder of r.folderChecks) {
    if(folder.visibility!=='present') {
      assert.equal(folder.aclReadable,false,folder.folder);
      assert.equal(folder.noUnexpectedAllow,false,folder.folder);
      if(folder.visibility!=='absent') assert.equal(folder.exists,null,folder.folder);
    }
  }
  if(r.folderChecks.some(folder=>folder.visibility!=='present'||!folder.aclReadable)) {
    assert.equal(r.restrictedAclsVerified,false,'unreadable ACL can never count as verified');
  }
});
test('pure Windows worker ACL policy rejects Write-only and high privileges',()=>{
  if(process.platform!=='win32') return;
  const r=inspect('worker-acl-policy.test.ps1');
  assert.equal(r.mode,'synthetic-acl-policy-test');
  assert.equal(r.allPassed,true);
  assert.ok(r.cases>=14);
  assert.equal(r.changesApplied,false);
});
test('staging Apply cannot bypass elevated ACL verification or copy to an unreadable target',()=>{
  const source=readFileSync(join(here,'worker-stage-binaries.ps1'),'utf8');
  assert.match(source,/worker-verify\.ps1/);
  assert.match(source,/restrictedAclsVerified/);
  assert.match(source,/accountNotAdministrator/);
  assert.match(source,/groupCheckAvailable/);
  assert.match(source,/targetInspection -ne 'verified'/);
  assert.match(source,/workerAccountStillDisabled/);
});
test('binary staging checks both vendor hashes without copying anything',()=>{
  if(process.platform!=='win32') return;
  const r=inspect('worker-stage-binaries.ps1');
  assert.equal(r.mode,'read-only-staging-plan');
  assert.equal(r.changesApplied,false);
  assert.equal(r.productionReady,false);
  assert.deepEqual(r.programs.map(p=>p.program),['photocraft','filmcraft']);
  for(const p of r.programs) {
    assert.equal(p.sourceBinaryExists,true,p.program);
    assert.equal(p.sourceHashMatchesLock,true,p.program);
    assert.equal(p.archiveExists,true,p.program);
    assert.equal(p.archiveHashMatchesLock,true,p.program);
    if(p.targetInspection!=='verified') assert.equal(p.targetExists,null,p.program);
    else assert.equal(typeof p.targetExists,'boolean',p.program);
  }
});
