/**
 * P28 read-only evidence summary for the DISABLED Windows media worker.
 * Runs existing READ-ONLY audits only. Never enrolls, starts, authorizes,
 * provisions, publishes, changes ACLs, alters firewall rules or runs editors.
 * This user-session report is diagnostic, NOT privileged attestation.
 */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {platform} from 'node:os';

export const CREATIVE_WORKER_EXECUTION_ENABLED=false;
export const SAFETY_SCHEMA='omnira.creative.worker-safety-observation.v1';
const NAMES=Object.freeze(['photocraft','filmcraft']);

function exactlyTwoVerifiedPrograms(record) {
 if(record?.mode!=='read-only-artcraft-archive-audit' ||
   record.changesApplied!==false || record.workerExecutionEnabled!==false ||
   record.productionReady!==false || record.allVerified!==true ||
   !Array.isArray(record.programs) || record.programs.length!==2) return false;
 const byName=new Map(record.programs.map(x=>[x?.program,x]));
 if(byName.size!==2) return false;
 return NAMES.every(n=>{
  const x=byName.get(n);
  return !!x && x.programReadyForStaging===true &&
   x.archiveHashMatchesLock===true && x.entryNamesVerified===true &&
   x.noUnsafeZipEntries===true && x.boundsVerified===true &&
   x.archiveCliHashMatchesLock===true &&
   x.sourceCliSignatureVerified===true &&
   x.sourceGuiSignatureVerified===true &&
   x.inspectedOnly===true && x.changesApplied===false;
 });
}
function verifiedWorkerAcl(x){
 return x?.mode==='read-only-verification' &&
  x.account==='omnira-media-worker' &&
  x.accountExists===true && x.accountDisabled===true &&
  x.groupCheckAvailable===true && x.accountNotAdministrator===true &&
  x.restrictedAclsVerified===true &&
  x.workerExecutionEnabled===false && x.productionReady===false &&
  x.networkEgressVerified===false && x.signedQueueConfigured===false &&
  Array.isArray(x.folderChecks) && x.folderChecks.length===7 &&
  new Set(x.folderChecks.map(z=>z?.folder)).size===7 &&
  ['root','bin','queue','input','output','temp','receipts'].every(n=>{
   const z=x.folderChecks.find(z=>z?.folder===n);
   return !!z && z.exists===true && z.visibility==='present' &&
    z.aclReadable===true && z.inheritanceDisabled===true &&
    z.workerRightsOk===true && z.noUnexpectedAllow===true;
  });
}
function verifiedLedger(x) {
 return x?.mode==='read-only-proposed-creative-approval-ledger-ntfs-audit' &&
  x.changesApplied===false && x.workerExecutionEnabled===false &&
  x.productionReady===false && x.aclVerified===true &&
  x.rootTrusted===true && x.approvalsFolder?.verified===true &&
  x.nonceFolder?.verified===true &&
  x.exactAllowlistedTreeVerified===true && x.receiptsAclVerified===true &&
  x.workerAccessAuthorized===false &&
  x.effectiveTokenIsolationVerified===false &&
  x.realReviewerIdentityVerified===false &&
  x.installationAuthorized===false;
}
/**
 * Pure, strict diagnostic classifier. Even ALL positive current disk checks
 * cannot assert effective process isolation, human review or network denial.
 * The output intentionally has no "start" or execution capability.
 */
export function evaluateCreativeWorkerSafetyEvidence(input){
 if(!input || typeof input!=='object'||Array.isArray(input))
  throw new Error('read-only evidence required');
 const acl=verifiedWorkerAcl(input.worker);
 const signatures=exactlyTwoVerifiedPrograms(input.archives);
 const ledger=verifiedLedger(input.ledger);
 const blockers=[];
 if(!acl)blockers.push('worker_account_or_ntfs_unverified');
 if(!signatures)blockers.push('program_archive_or_signatures_unverified');
 if(!ledger)blockers.push('approval_ledger_acl_unverified');
 blockers.push('worker_network_egress_not_independently_verified');
 blockers.push('process_and_child_process_isolation_not_independently_verified');
 blockers.push('real_human_approval_and_authenticated_queue_not_live');
 return Object.freeze({
  schema:SAFETY_SCHEMA,mode:'read-only-diagnostic',
  checks:Object.freeze({
   disabledNonadminWorkerAndSevenNtfsFoldersVerified:acl,
   pinnedPhotoAndFilmArchivesVerified:signatures,
   approvalLedgerAclVerified:ledger,
   networkEgressDeniedByVerifiedSandbox:false,
   childProcessIsolationVerified:false,
   independentHumanApprovalVerified:false,
   authenticatedCreativeQueueLive:false
  }),
  blockers:Object.freeze(blockers),
  workerActivationAuthorized:false,
  creativeExecutionAuthorized:false,
  publishAuthorized:false,
  productionReady:false,
  changesApplied:false
 });
}
function readOnlyPowerShell(script) {
 const full=join(dirname(fileURLToPath(import.meta.url)),script);
 // Fixed observed Windows system location; never resolve the audit host via cwd/PATH.
 const result=spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',[
  '-NoProfile','-NonInteractive','-File',full
 ],{windowsHide:true,timeout:30000,encoding:'utf8',maxBuffer:128*1024});
 if(result.error || result.status!==0 || !result.stdout)
  throw new Error('read-only '+script+' unavailable');
 try{return JSON.parse(result.stdout)}catch{
  throw new Error('read-only '+script+' returned non-JSON');
 }
}
if(process.argv[1] &&
 fileURLToPath(import.meta.url).toLowerCase()===process.argv[1].toLowerCase()) {
 try {
  if(process.argv.length!==2||platform()!=='win32')
   throw new Error('run without parameters on Windows only');
  const input={
   worker:readOnlyPowerShell('worker-verify.ps1'),
   ledger:readOnlyPowerShell('worker-approval-ledger-acl-audit.ps1'),
   archives:readOnlyPowerShell('worker-archive-audit.ps1')
  };
  console.log(JSON.stringify(evaluateCreativeWorkerSafetyEvidence(input),null,2));
 }catch(e){
  console.error('CREATIVE SAFETY DIAGNOSTIC UNAVAILABLE');
  process.exitCode=2;
 }
}
