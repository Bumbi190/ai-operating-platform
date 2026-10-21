import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {planProtectedCreativeApprovalLedger,LEDGER_BOOTSTRAP_APPLY_ENABLED} from
 './worker-ledger-bootstrap-plan.mjs';

const folders=['root','bin','queue','input','output','temp','receipts'];
function inputs(){
 return {
  worker:{
   mode:'read-only-verification',account:'omnira-media-worker',
   accountExists:true,accountDisabled:true,groupCheckAvailable:true,
   accountNotAdministrator:true,restrictedAclsVerified:true,
   workerExecutionEnabled:false,productionReady:false,
   networkEgressVerified:false,signedQueueConfigured:false,
   folderChecks:folders.map(folder=>({
    folder,exists:true,visibility:'present',aclReadable:true,
    inheritanceDisabled:true,workerRightsOk:true,noUnexpectedAllow:true
   }))
  },
  ledger:{
   mode:'read-only-proposed-creative-approval-ledger-ntfs-audit',
   changesApplied:false,installationAuthorized:false,
   workerExecutionEnabled:false,productionReady:false,
   workerAccessAuthorized:false,
   effectiveTokenIsolationVerified:false,
   realReviewerIdentityVerified:false,
   rootTrusted:true,approvalsFolder:{verified:false,reason:'inaccessible_or_missing'},
   nonceFolder:{verified:false,reason:'inaccessible_or_missing'},
   aclVerified:false,exactAllowlistedTreeVerified:false,
   receiptsAclVerified:false
  }
 }
}
function blocked(plan){
 assert.equal(plan.workerAccountEnableAuthorized,false);
 assert.equal(plan.executionAuthorized,false);
 assert.equal(plan.publishAuthorized,false);
 assert.equal(plan.productionReady,false);
 assert.equal(plan.changesApplied,false);
 assert.equal(plan.scriptCanApplyChanges,false);
 assert.equal(plan.installerCommandsProvided,false);
 assert.equal(plan.requiresSeparateHumanAuthorization,true);
}
test('real-world unknown approval paths require separate admin presence proof, never self-provision',()=>{
 assert.equal(LEDGER_BOOTSTRAP_APPLY_ENABLED,false);
 const plan=planProtectedCreativeApprovalLedger(inputs());
 assert.equal(plan.status,'admin_presence_and_acl_audit_required');
 assert.equal(plan.verified.rootIsTrusted,true);
 assert.equal(plan.verified.approvalPathsExistenceIndependentlyProven,false);
 blocked(plan);
});
test('exact protected owner/allow SID set excludes worker and every ordinary account',()=>{
 const plan=planProtectedCreativeApprovalLedger(inputs());
 assert.deepEqual([...plan.scope.requiredAllowSids],['S-1-5-18','S-1-5-32-544']);
 assert.equal(plan.scope.approvalsPath,
  'C:\\ProgramData\\OmniraCreativeWorker\\approvals');
 assert.equal(plan.scope.noncesPath,
  'C:\\ProgramData\\OmniraCreativeWorker\\approvals\\nonces');
 assert.equal(plan.scope.workerSidMayAppearInApprovalLedgerAces,false);
 assert.equal(plan.scope.inheritanceDisabled,true);
 assert.equal(plan.scope.noReparsePoints,true);
 blocked(plan);
});
test('partial, suspicious or conflicting ledger status never becomes an install instruction',()=>{
 for(const variant of [
  {approvalsFolder:{verified:true},nonceFolder:{verified:false}},
  {approvalsFolder:{verified:false,reason:'wrong_owner_or_acl_or_type'}},
  {aclVerified:true,approvalsFolder:{verified:false,reason:'wrong_owner_or_acl_or_type'}},
  {rootTrusted:false},
 ]) {
  const data=inputs();
  Object.assign(data.ledger,variant);
  const p=planProtectedCreativeApprovalLedger(data);
  assert.match(p.status,/^halt_/);
  blocked(p);
 }
});
test('worker enabled, admin, unverifiable NTFS or untrusted audit version makes plan halt',()=>{
 for(const variant of [
  {accountDisabled:false},{accountNotAdministrator:false},
  {folderChecks:[]},{accountExists:false},
  {networkEgressVerified:true},{signedQueueConfigured:true},
  {workerExecutionEnabled:true},
 ]) {
  const data=inputs();
  Object.assign(data.worker,variant);
  const p=planProtectedCreativeApprovalLedger(data);
  assert.equal(p.status,'halt_untrusted_audit_or_parent');
  blocked(p);
 }
 const data=inputs();data.ledger.mode='injected';
 assert.equal(planProtectedCreativeApprovalLedger(data).status,'halt_untrusted_audit_or_parent');
});
test('even a fully verified private ACL never proves real human approval or execution',()=>{
 const data=inputs();
 Object.assign(data.ledger,{
  approvalsFolder:{verified:true},nonceFolder:{verified:true},
  aclVerified:true,exactAllowlistedTreeVerified:true,receiptsAclVerified:true
 });
 const p=planProtectedCreativeApprovalLedger(data);
 assert.equal(p.status,'ledger_acl_verified_but_not_execution_ready');
 assert.equal(p.verified.privateLedgerAclObserved,true);
 assert.equal(p.verified.effectiveWorkerTokenIsolation,false);
 assert.equal(p.verified.realHumanApprovalVerified,false);
 blocked(p);
});
test('caller-provided extra flags cannot override the closed fail-closed result',()=>{
 const input=inputs();
 input.ledger.someModelApproved=true;
 input.operatorApproved=true;
 input.installationAuthorized=true;
 const p=planProtectedCreativeApprovalLedger(input);
 assert.equal(p.status,'admin_presence_and_acl_audit_required');
 blocked(p);
});
test('no evidence and malformed evidence produce no privileged plan',()=>{
 for(const evidence of [null,{},[],{worker:null,ledger:{}},{worker:{},ledger:[]}]) {
  assert.throws(()=>planProtectedCreativeApprovalLedger(evidence),
   /trusted read-only audit evidence required/);
 }
});
test('plan CLI contains only fixed read-only PowerShell calls, no write mechanisms',()=>{
 const text=readFileSync(resolve(import.meta.dirname,'worker-ledger-bootstrap-plan.mjs'),'utf8');
 for(const pattern of [/\bNew-Item\b/,/\bSet-Acl\b/,/\bicacls\b/,
  /\bEnable-LocalUser\b/,/\bStart-Process\b/,/\bNew-NetFirewallRule\b/,
  /\bRemove-Item\b/,/\bCopy-Item\b/,/\brunPilotJob\s*\(/]){
  assert.doesNotMatch(text,pattern);
 }
 assert.match(text,/worker-verify\.ps1/);
 assert.match(text,/worker-approval-ledger-acl-audit\.ps1/);
});
