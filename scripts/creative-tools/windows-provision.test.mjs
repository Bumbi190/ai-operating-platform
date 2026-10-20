import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
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
  }
});
