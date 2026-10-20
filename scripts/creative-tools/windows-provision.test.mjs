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
test('pure ZIP allowlist rejects seventeen unsafe synthetic archive variants',()=>{
  if(process.platform!=='win32')return;
  const audit=inspect('worker-archive-policy.test.ps1');
  assert.equal(audit.mode,'synthetic-zip-policy-test');
  assert.equal(audit.cases,17);
  assert.equal(audit.allPassed,true);
  assert.equal(audit.changesApplied,false);
});
test('ZIP preflight validates exact files, archive CLI hash and both executable signers without extracting',()=>{
  if(process.platform!=='win32') return;
  const result=spawnSync('powershell.exe',['-NoProfile','-File',join(here,'worker-archive-audit.ps1')],{
    encoding:'utf8',timeout:30000,maxBuffer:100000,
  });
  assert.equal(result.status,0,result.stderr);
  const audit=JSON.parse(result.stdout);
  assert.equal(audit.mode,'read-only-artcraft-archive-audit');
  assert.equal(audit.allVerified,true);
  assert.equal(audit.changesApplied,false);
  assert.equal(audit.workerExecutionEnabled,false);
  assert.equal(audit.productionReady,false);
  assert.deepEqual(audit.programs.map(p=>p.program),['photocraft','filmcraft']);
  for(const program of audit.programs){
    assert.equal(program.entryCount,9,program.program);
    for(const flag of ['archiveHashMatchesLock','entryNamesVerified','noUnsafeZipEntries',
      'boundsVerified','archiveCliHashMatchesLock','sourceCliSignatureVerified',
      'sourceGuiSignatureVerified','programReadyForStaging']){
      assert.equal(program[flag],true,program.program+':'+flag);
    }
  }
});
test('archive audit accepts an explicit absolute read-only source but not a relative path',()=>{
  if(process.platform!=='win32')return;
  const source=join(process.env.USERPROFILE,'Projects','Omnira','External','ArtCraft');
  const approved=spawnSync('powershell.exe',['-NoProfile','-File',
    join(here,'worker-archive-audit.ps1'),'-SourceRoot',source],{
      encoding:'utf8',timeout:30000,maxBuffer:100000,
    });
  assert.equal(approved.status,0,approved.stderr);
  const status=JSON.parse(approved.stdout);
  assert.equal(status.allVerified,true);
  assert.equal(status.changesApplied,false);
  const rejected=spawnSync('powershell.exe',['-NoProfile','-File',
    join(here,'worker-archive-audit.ps1'),'-SourceRoot','not/absolute'],{
      encoding:'utf8',timeout:10000,maxBuffer:100000,
    });
  assert.notEqual(rejected.status,0);
});
test('staging Apply requires exact archive audit and validates executable signatures again',()=>{
  const source=readFileSync(join(here,'worker-stage-binaries.ps1'),'utf8');
  for(const proof of ['worker-archive-audit.ps1','allVerified','Get-AuthenticodeSignature',
    'archiveRecheck','ReparsePoint','workerFinal.Enabled']){
    assert.ok(source.includes(proof),proof);
  }
});
test('read-only post-copy ACL audit never approves missing handoff folders or execution',()=>{
  if(process.platform!=='win32')return;
  const audit=inspect('worker-handoff-acl-audit.ps1');
  assert.equal(audit.mode,'read-only-protected-handoff-acl-audit');
  assert.equal(audit.expectedFiles,12);
  assert.equal(audit.expectedDirectories,8);
  assert.equal(audit.checks.length,20);
  assert.equal(audit.sourceHandoffApproved,false);
  assert.equal(audit.postCopyDigestsVerified,false);
  assert.equal(audit.workerExecutionEnabled,false);
  assert.equal(audit.productionReady,false);
  assert.equal(audit.changesApplied,false);
  if(audit.checks.some(c=>!c.verified))assert.equal(audit.aclVerified,false);
});
test('privileged staging rejects user-writable worktree scripts and archive inputs',()=>{
  const source=readFileSync(join(here,'worker-stage-binaries.ps1'),'utf8');
  const earlyGuard=source.indexOf('Refusing elevated staging from a user-writable source');
  const lockRead=source.indexOf('$lock = Get-Content');
  assert.ok(earlyGuard>0&&lockRead>earlyGuard,'source location must be enforced before lock file is read');
  for(const required of ["$trustedControl = Join-Path $root 'control'",
    "$trustedImports = Join-Path $root 'imports'",
    'Assert-ProtectedCreativeSource',
    '[Security.Principal.SecurityIdentifier]',
    "'S-1-5-18','S-1-5-32-544'",
    "'worker-stage-binaries.ps1'","'worker-verify.ps1'","'worker-acl-policy.ps1'",
    "'worker-archive-audit.ps1'","'worker-archive-policy.ps1'","'artcraft-lock.json'",
    '$artcraftRoot = if ($Apply) { $trustedImports }',
    '-SourceRoot $trustedImports',
    'archiveRelativePath -cne',
    'binaryRelativePath -cne',
    'Get-Acl -LiteralPath $Path']){
    assert.ok(source.includes(required),'missing privileged source protection: '+required);
  }
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
