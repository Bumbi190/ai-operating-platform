import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));
const policy=readFileSync(join(root,'worker-approval-ledger-acl-policy.ps1'),'utf8');
const audit=readFileSync(join(root,'worker-approval-ledger-acl-audit.ps1'),'utf8');
test('proposed approval ledger uses a fixed independent path, not media receipts or imports',()=>{
 assert.match(audit,/Join-Path \$root 'approvals'/);
 assert.match(audit,/Join-Path \$approvals 'nonces'/);
 assert.match(audit,/Join-Path \$env:ProgramData 'OmniraCreativeWorker'/);
 assert.doesNotMatch(audit,/\$env:USERPROFILE|Get-Location|Read-Host|\[Parameter\(Mandatory/i);
});
test('NTFS checker limits ledger principals strictly to SYSTEM and Administrators',()=>{
 assert.match(policy,/S-1-5-18/);
 assert.match(policy,/S-1-5-32-544/);
 assert.match(policy,/InheritanceProtected/);
 assert.match(policy,/IsReparse/);
 assert.match(policy,/FullControl/);
 assert.match(audit,/GetAccessRules/);
 assert.match(audit,/GetOwner/);
 assert.match(audit,/Test-CreativeApprovalLedgerAcl/);
});
test('audit explicitly denies operational authority and contains no privileged write commands',()=>{
 for(const key of [
  'workerAccessAuthorized','effectiveTokenIsolationVerified',
  'receiptContentsVerified','externalAnchorVerified','realReviewerIdentityVerified',
  'installationAuthorized','changesApplied','workerExecutionEnabled','productionReady',
 ]){
  assert.match(audit,new RegExp('\\b'+key+'=\\$false\\b'));
 }
 for(const unsafe of [
  /\bNew-Item\b/i,/\bSet-Acl\b/i,/\bicacls(?:\.exe)?\b/i,
  /\btakeown(?:\.exe)?\b/i,/\bSet-LocalUser\b/i,
  /\bStart-Process\b/i,/\bCopy-Item\b/i,/\bRemove-Item\b/i,
  /\bSet-Content\b/i,/\bAdd-Content\b/i,
 ]){
  assert.doesNotMatch(audit,unsafe);
  assert.doesNotMatch(policy,unsafe);
 }
});
