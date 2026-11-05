import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { it, expect } from 'vitest'
import { canonicalDesktopProof, DESKTOP_PROOF_VERSION, verifySignedDesktopEvidence, previewSignedDesktopDiagnostic } from '@/lib/atlas/model-router/signed-desktop-evidence'

const NOW = Date.parse('2026-10-29T07:45:00Z')
const brokerId = 'aab10000-1111-4111-8111-111111111111'
const hostId = 'aab20000-2222-4222-8222-222222222222'
const challengeId = 'aab30000-3333-4333-8333-333333333333'
const nonce = randomBytes(32).toString('base64url')

it('an ephemeral test signer can authenticate a read-only report exactly once, never authorize dispatch',async()=>{
  // In-memory test identity ONLY. This is not Windows Code Broker enrollment.
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
  const jwk=publicKey.export({format:'jwk'}) as JsonWebKey
  const publicJwk={kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y}
  const thumbprint=createHash('sha256').update(JSON.stringify({
    crv:'P-256',kty:'EC',x:jwk.x,y:jwk.y,
  })).digest('base64url')
  const trust={
    status:'active',brokerId,hostId,buildSha256:'a'.repeat(64),
    publicJwk,keyThumbprint:thumbprint,enrollmentVerified:true,
  }
  const challenge={
    version:DESKTOP_PROOF_VERSION,challengeId,nonce,brokerId,hostId,
    issuedAtMs:NOW-1000,expiresAtMs:NOW+30000,purpose:'read_only_desktop_diagnostic',
  }
  const snapshot={
    schemaVersion:'atlas.desktop-readiness.snapshot.v1',
    capturedAtMs:NOW-500,origin:'unattested_windows_local',
    brokerAttested:false,dispatchAuthorized:false,
    preflight:{
      state:'observed',freeRamMB:3000,gpu:{
        name:'RTX 3060',freeVramMB:10000,totalVramMB:12288,temperatureC:40,
      },
      localModels:['qwen3:4b'],ollamaServer:true,
      resourceGatePassed:false,inferenceSmokePassed:false,codexLoginSeen:true,
    },
    primePilot:{
      credentialFilePresent:true,entitlementVerified:false,toolSmokeFresh:false,
      pilotHumanApproved:false,historicalTestState:'unavailable',
      historicalTestCount:0,historicalTestPass:0,historicalReportTimestamp:null,
    },
    budget:{
      state:'local_ledger_read',day:'2026-10-29',timezone:'Europe/Stockholm',
      localApiBudgetLimitUsd:5,localApiReservedUsd:0,localCodexRunLimit:3,
      localCodexRunSlotsRemaining:3,actualCodexUsdKnown:false,
    },
    note:'Read only.'
  }
  const unsigned={
    version:DESKTOP_PROOF_VERSION,challengeId,nonce,brokerId,hostId,
    buildSha256:'a'.repeat(64),counter:22,signedAtMs:NOW,
    snapshotJson:JSON.stringify(snapshot),
  }
  const signature=sign('sha256',Buffer.from(canonicalDesktopProof(unsigned)),
    {key:privateKey,dsaEncoding:'der'}).toString('base64url')
  const envelope={...unsigned,signature}
  let used=false
  const input={
    envelope,challenge,trustedIdentity:trust,observedNowMs:NOW+1000,
    consume:async()=>{if(used)return false;used=true;return true},
  }
  const preview=await previewSignedDesktopDiagnostic(input,{
    task:'code_patch',minimumQuality:2,dataClassification:'public',
    allowExternalProcessing:true,observedNowMs:NOW+1000,
    evidence:[{
      workerId:'prime-agent-codex-pilot',health:'ready',observedAtMs:NOW+1000,
      authenticated:true,entitlement:'available',
      pilotToolSmokePassed:true,pilotIsolationVerified:true,
      pilotCodexSlotAvailable:true,pilotHumanApproved:true,
    }],
    meteredPolicy:{
      humanApproved:true,hardSpendGateEnforced:true,
      remainingBudgetSek:10,approvedCeilingSek:10,
    },
  })
  const first=preview.proof
  expect(preview.decision.status).toBe('blocked')
  expect(preview.decision.dispatchAuthorized).toBe(false)
  expect(first).toMatchObject({
    status:'verified_diagnostic_only',signerVerified:true,
    hardwareAttested:false,trustedForRouting:false,dispatchAuthorized:false,
  })
  expect(first.diagnostic?.status).toBe('observed')
  const replay=await verifySignedDesktopEvidence(input)
  expect(replay.reason).toBe('replayed_or_unavailable')
  const altered=await verifySignedDesktopEvidence({...input,envelope:{
    ...envelope,snapshotJson:envelope.snapshotJson.replace('3000','9000')
  },consume:async()=>true})
  expect(altered.reason).toBe('signature_invalid')
  const wrongNonce=await verifySignedDesktopEvidence({...input,
    challenge:{...challenge,nonce:randomBytes(32).toString('base64url')},
    consume:async()=>true,
  })
  expect(wrongNonce.reason).toBe('challenge_mismatch')
  const expired=await verifySignedDesktopEvidence({...input,
    observedNowMs:NOW+30000,consume:async()=>true,
  })
  expect(expired.reason).toBe('expired_or_future')
  const wrongBuild=await verifySignedDesktopEvidence({...input,
    trustedIdentity:{...trust,buildSha256:'b'.repeat(64)},
    consume:async()=>true,
  })
  expect(wrongBuild.reason).toBe('identity_unverified')
  const noReplayStore=await verifySignedDesktopEvidence({...input,consume:null})
  expect(noReplayStore.reason).toBe('invalid_proof')
  // Even a valid signature cannot turn locally observed values into trusted
  // hardware attestation or model-execution permission.
  const badUnsigned={...unsigned,snapshotJson:JSON.stringify({
    ...snapshot,brokerAttested:true,
  })}
  const badSigned={...badUnsigned,signature:sign('sha256',
    Buffer.from(canonicalDesktopProof(badUnsigned)),
    {key:privateKey,dsaEncoding:'der'}).toString('base64url')}
  const badObservation=await verifySignedDesktopEvidence({...input,
    envelope:badSigned,consume:async()=>true,
  })
  expect(badObservation.reason).toBe('snapshot_invalid')
  const oldBeforeChallenge={...unsigned,snapshotJson:JSON.stringify({
    ...snapshot,capturedAtMs:challenge.issuedAtMs-1,
  })}
  const oldSigned={...oldBeforeChallenge,signature:sign('sha256',
    Buffer.from(canonicalDesktopProof(oldBeforeChallenge)),
    {key:privateKey,dsaEncoding:'der'}).toString('base64url')}
  expect((await verifySignedDesktopEvidence({...input,
    envelope:oldSigned,consume:async()=>true,
  })).reason).toBe('snapshot_invalid')
})
