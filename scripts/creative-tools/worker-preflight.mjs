/**
 * Read-only workstation worker readiness. Refuses to call existing interactive
 * user session an isolated creative worker. NOT a security attestation.
 */
import { userInfo, platform } from 'node:os';
import { existsSync, readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const lock=JSON.parse(readFileSync(new URL('./artcraft-lock.json',import.meta.url),'utf8'));
export function evaluateWorkerPreflight(input) {
  const windows=input.platform==='win32';
  const dedicated=typeof input.workerName==='string' &&
    input.username.toLowerCase()===input.workerName.toLowerCase() &&
    input.username.toLowerCase()!=='andre';
  const tests={
    windows,
    dedicatedUnprivilegedAccount: dedicated && input.restrictedAccountVerified===true,
    restrictedStagingAclVerified: input.restrictedStagingAclVerified===true,
    networkEgressRestricted: input.networkEgressRestricted===true,
    binaryFingerprintsVerified: input.hashesMatch===true,
    approvalAndReplayEnforced: input.approvalAndReplayEnforced===true,
    authenticatedCreativeQueue: input.authenticatedCreativeQueue===true,
  };
  return Object.freeze({
    ready:Object.values(tests).every(Boolean),
    tests,
    note:'Read-only diagnosis; programmatic checks cannot establish Windows sandbox isolation.',
  });
}
function verifyHashes(root) {
  return Object.values(lock).every(entry=>{
    const binary=join(root,entry.binaryRelativePath);
    if(!existsSync(binary) || !lstatSync(binary).isFile() || lstatSync(binary).isSymbolicLink()) return false;
    return createHash('sha256').update(readFileSync(binary)).digest('hex')===entry.sha256;
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase()===process.argv[1].toLowerCase()) {
  if (process.argv.length!==2) {
    console.error('Run without parameters for a read-only security status.');
    process.exitCode=1;
  } else {
    const root=join(homedir(),'Projects','Omnira','External','ArtCraft');
    // Operator assertions deliberately absent: none are inferred from local files.
    const result=evaluateWorkerPreflight({
      platform:platform(),username:userInfo().username,
      workerName:'omnira-media-worker',
      restrictedAccountVerified:false,restrictedStagingAclVerified:false,
      networkEgressRestricted:false,hashesMatch:verifyHashes(root),
      approvalAndReplayEnforced:false,authenticatedCreativeQueue:false,
    });
    console.log(JSON.stringify(result,null,2));
    if(!result.ready) process.exitCode=2;
  }
}
