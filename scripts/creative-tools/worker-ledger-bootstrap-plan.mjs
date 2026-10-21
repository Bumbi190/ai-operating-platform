/**
 * P29 - exact, READ-ONLY proposed protected ledger bootstrap plan.
 * An unprivileged user cannot distinguish ACCESS DENIED from MISSING.
 * Produces no executable commands, never creates directories/ACLs/accounts,
 * never signs approvals, never permits creative execution or publishing.
 */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {platform} from 'node:os';

export const LEDGER_PLAN_SCHEMA='omnira.creative.protected-ledger-plan.v1';
export const LEDGER_BOOTSTRAP_APPLY_ENABLED=false;
const ROOT='C:\\ProgramData\\OmniraCreativeWorker';
const APPROVALS=ROOT+'\\approvals';
const NONCES=APPROVALS+'\\nonces';
const OWNERS=Object.freeze(['S-1-5-18','S-1-5-32-544']);
const EXPECTED=Object.freeze(['root','bin','queue','input','output','temp','receipts']);

function workerReadyForPlan(r) {
 if(!r||r.mode!=='read-only-verification'||r.account!=='omnira-media-worker'||
  r.accountExists!==true||r.accountDisabled!==true||
  r.accountNotAdministrator!==true||r.groupCheckAvailable!==true||
  r.restrictedAclsVerified!==true||
  r.workerExecutionEnabled!==false||r.productionReady!==false||
  r.networkEgressVerified!==false||r.signedQueueConfigured!==false||
  !Array.isArray(r.folderChecks)||r.folderChecks.length!==7||
  new Set(r.folderChecks.map(x=>x?.folder)).size!==7)return false;
 return EXPECTED.every(name=>{
  const x=r.folderChecks.find(r=>r?.folder===name);
  return x?.exists===true&&x.visibility==='present'&&
   x.aclReadable===true&&x.inheritanceDisabled===true&&
   x.workerRightsOk===true&&x.noUnexpectedAllow===true;
 });
}
function exactLedgerVerified(l) {
 return l?.mode==='read-only-proposed-creative-approval-ledger-ntfs-audit'&&
  l.rootTrusted===true&&l.approvalsFolder?.verified===true&&
  l.nonceFolder?.verified===true&&l.aclVerified===true&&
  l.exactAllowlistedTreeVerified===true&&l.receiptsAclVerified===true&&
  l.workerAccessAuthorized===false&&
  l.effectiveTokenIsolationVerified===false&&
  l.realReviewerIdentityVerified===false&&
  l.installationAuthorized===false&&l.changesApplied===false&&
  l.workerExecutionEnabled===false&&l.productionReady===false;
}
function trueDiagnosticMode(l) {
 return l?.mode==='read-only-proposed-creative-approval-ledger-ntfs-audit' &&
  l.changesApplied===false&&l.installationAuthorized===false&&
  l.workerExecutionEnabled===false&&l.productionReady===false &&
  l.workerAccessAuthorized===false;
}
function plain(obj){
 return obj && typeof obj==='object'&&!Array.isArray(obj);
}
export function planProtectedCreativeApprovalLedger(evidence={}){
 if(!plain(evidence)||!plain(evidence.worker)||!plain(evidence.ledger))
  throw new Error('trusted read-only audit evidence required');
 const {worker,ledger}=evidence;
 const workerVerified=workerReadyForPlan(worker);
 const ledgerModeTrusted=trueDiagnosticMode(ledger);
 const ledgerVerified=ledgerModeTrusted && exactLedgerVerified(ledger);
 const unknownLedgerLocation=ledgerModeTrusted &&
  ledger.approvalsFolder?.verified===false&&ledger.nonceFolder?.verified===false&&
  ledger.approvalsFolder.reason==='inaccessible_or_missing'&&
  ledger.nonceFolder.reason==='inaccessible_or_missing';
 let status='halt_untrusted_audit_or_parent';
 if(workerVerified && ledgerModeTrusted && ledger.rootTrusted===true){
  if(ledgerVerified)status='ledger_acl_verified_but_not_execution_ready';
  else if(unknownLedgerLocation)status='admin_presence_and_acl_audit_required';
  else status='halt_unexpected_or_partial_ledger_state';
 }
 return Object.freeze({
  schema:LEDGER_PLAN_SCHEMA,
  status,
  scope:Object.freeze({
   protectedRoot:ROOT,approvalsPath:APPROVALS,noncesPath:NONCES,
   requiredOwnerSids:OWNERS,
   requiredAllowSids:OWNERS,
   inheritanceDisabled:true,
   noReparsePoints:true,
   workerSidMayAppearInApprovalLedgerAces:false,
   untrustedUserMayAppearInApprovalLedgerAces:false,
   denyAllNonAdminWriteAccess:true
  }),
  verified:Object.freeze({
   workerIsDisabledNonAdminWithSevenAclChecks:workerVerified,
   rootIsTrusted:ledger.rootTrusted===true && workerVerified,
   privateLedgerAclObserved:ledgerVerified,
   approvalPathsExistenceIndependentlyProven:ledgerVerified,
   effectiveWorkerTokenIsolation:false,
   networkEgressDenied:false,
   realHumanApprovalVerified:false,
  }),
  requiredManualSequence:Object.freeze([
   'independent_elevated_operator_confirms_both_exact_paths_and_owners',
   'independent_security_review_approves_protected_private_ledger_design',
   'separate_admin_owned_handoff_only_after_explicit_authorization',
   'read_only_acl_audit_recheck_after_any_separately_authorized_change',
   'prove_nonce_ledger_history_and_external_anchor_before_real_approvals',
   'prove_worker_process_network_limits_before_any_media_execution'
  ]),
  installerCommandsProvided:false,
  scriptCanApplyChanges:false,
  requiresSeparateHumanAuthorization:true,
  workerAccountEnableAuthorized:false,
  executionAuthorized:false,
  publishAuthorized:false,
  productionReady:false,
  changesApplied:false
 });
}
function readOnlyScript(script) {
 const full=join(dirname(fileURLToPath(import.meta.url)),script);
 // Use the fixed OS PowerShell location, not a PATH-resolved executable.
 const powershell='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
 const result=spawnSync(powershell,['-NoProfile','-NonInteractive','-File',full],{
  timeout:30000,windowsHide:true,encoding:'utf8',maxBuffer:128*1024});
 if(result.error||result.status!==0||!result.stdout)throw new Error('audit_unavailable');
 try{return JSON.parse(result.stdout)}catch{throw new Error('audit_invalid_json')}
}
if(process.argv[1]&&fileURLToPath(import.meta.url).toLowerCase()===
 process.argv[1].toLowerCase()){
 try{
  if(process.argv.length!==2||platform()!=='win32')throw new Error('read_only_windows_only');
  console.log(JSON.stringify(planProtectedCreativeApprovalLedger({
   worker:readOnlyScript('worker-verify.ps1'),
   ledger:readOnlyScript('worker-approval-ledger-acl-audit.ps1')
  }),null,2));
 }catch{
  console.error('PROTECTED LEDGER PLAN UNAVAILABLE - NO CHANGES');
  process.exitCode=2;
 }
}
