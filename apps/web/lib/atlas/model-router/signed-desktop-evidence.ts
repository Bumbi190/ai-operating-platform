/**
 * Stage-only ES256 signed desktop diagnostic envelope.
 *
 * SECURITY: A matching signature proves control of a PRE-ENROLLED broker key,
 * NOT execution of a trusted binary nor authenticity of local sensor values.
 * Even a valid, non-replayed envelope is ONLY a diagnostic and never produces
 * authoritative WorkerEvidence or Code Broker execution authorization.
 *
 * Real production must provision the Windows broker identity separately,
 * pin it through the existing enrollment authority and implement an atomic,
 * persistent challenge/counter-consumption transaction before use.
 */
import {
  createHash, createPublicKey, timingSafeEqual, verify,
} from 'node:crypto'
import { inspectDesktopSnapshot, type DesktopDiagnostic } from './desktop-evidence'
import { routeModel, type RoutingRequest } from './route'

export const DESKTOP_PROOF_VERSION = 'atlas.desktop.proof.v1' as const
export const DESKTOP_PROOF_DOMAIN = 'omnira.code_broker.desktop_diagnostic.v1' as const

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/
const MAX_SNAPSHOT_BYTES = 16_384
const MAX_CHALLENGE_LIFETIME_MS = 120_000
const MAX_SIGNED_SKEW_MS = 10_000
const MAX_SNAPSHOT_LAG_MS = 60_000

type P256Jwk = Readonly<{ kty: 'EC'; crv: 'P-256'; x: string; y: string }>
export type DesktopChallenge = Readonly<{
  version: typeof DESKTOP_PROOF_VERSION
  challengeId: string
  nonce: string
  brokerId: string
  hostId: string
  issuedAtMs: number
  expiresAtMs: number
  purpose: 'read_only_desktop_diagnostic'
}>
export type DesktopSignedEvidence = Readonly<{
  version: typeof DESKTOP_PROOF_VERSION
  challengeId: string
  nonce: string
  brokerId: string
  hostId: string
  buildSha256: string
  counter: number
  signedAtMs: number
  snapshotJson: string
  signature: string
}>
export type RegisteredBrokerProofIdentity = Readonly<{
  status: 'active'
  brokerId: string
  hostId: string
  buildSha256: string
  publicJwk: P256Jwk
  keyThumbprint: string
  enrollmentVerified: true
}>

/**
 * A server-owned durable transaction must atomically consume the challenge
 * and advance the per-broker counter, or return false without side effects.
 * A client-supplied callback is NOT authority; only trusted server code may
 * supply this dependency in a future implementation.
 */
export type ConsumeDesktopProof = (args: Readonly<{
  brokerId: string
  hostId: string
  challengeId: string
  nonceSha256: string
  counter: number
  snapshotSha256: string
}>) => Promise<boolean>

export type DesktopProofCheck = Readonly<{
  status: 'verified_diagnostic_only' | 'rejected'
  reason: 'ok' | 'invalid_proof' | 'identity_unverified' | 'challenge_mismatch' |
    'expired_or_future' | 'signature_invalid' | 'snapshot_invalid' |
    'replayed_or_unavailable'
  signerVerified: boolean
  hardwareAttested: false
  trustedForRouting: false
  dispatchAuthorized: false
  diagnostic: DesktopDiagnostic | null
}>

const record = (input: unknown): Record<string, unknown> | null =>
  input !== null && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown> : null

const exactKeys = (obj: Record<string, unknown>, names: readonly string[]): boolean =>
  Object.keys(obj).sort().join('|') === [...names].sort().join('|')

const safeTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const canonicalBase64Url = (value: unknown, bytes: number): value is string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return false
  const decoded = Buffer.from(value, 'base64url')
  return decoded.length === bytes && decoded.toString('base64url') === value
}
const fingerprint = (jwk: P256Jwk): string =>
  createHash('sha256').update(JSON.stringify({
    crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y,
  })).digest('base64url')

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex')

function validPublicJwk(input: unknown): input is P256Jwk {
  const p = record(input)
  if (!p || !exactKeys(p, ['kty','crv','x','y']) ||
      p.kty !== 'EC' || p.crv !== 'P-256' ||
      !canonicalBase64Url(p.x, 32) || !canonicalBase64Url(p.y, 32)) return false
  try {
    createPublicKey({ key: p as import('node:crypto').JsonWebKey, format: 'jwk' })
    return true
  } catch { return false }
}

function validChallenge(input: unknown): input is DesktopChallenge {
  const c = record(input)
  return !!c && exactKeys(c, [
    'version','challengeId','nonce','brokerId','hostId',
    'issuedAtMs','expiresAtMs','purpose',
  ]) && c.version === DESKTOP_PROOF_VERSION &&
    typeof c.challengeId === 'string' && UUID.test(c.challengeId) &&
    typeof c.brokerId === 'string' && UUID.test(c.brokerId) &&
    typeof c.hostId === 'string' && UUID.test(c.hostId) &&
    canonicalBase64Url(c.nonce, 32) &&
    safeTimestamp(c.issuedAtMs) && safeTimestamp(c.expiresAtMs) &&
    c.expiresAtMs > c.issuedAtMs &&
    c.expiresAtMs - c.issuedAtMs <= MAX_CHALLENGE_LIFETIME_MS &&
    c.purpose === 'read_only_desktop_diagnostic'
}
function validEnvelope(input: unknown): input is DesktopSignedEvidence {
  const e = record(input)
  return !!e && exactKeys(e, [
    'version','challengeId','nonce','brokerId','hostId',
    'buildSha256','counter','signedAtMs','snapshotJson','signature',
  ]) && e.version === DESKTOP_PROOF_VERSION &&
    typeof e.challengeId === 'string' && UUID.test(e.challengeId) &&
    typeof e.brokerId === 'string' && UUID.test(e.brokerId) &&
    typeof e.hostId === 'string' && UUID.test(e.hostId) &&
    canonicalBase64Url(e.nonce, 32) &&
    typeof e.buildSha256 === 'string' && SHA256.test(e.buildSha256) &&
    typeof e.counter === 'number' && Number.isSafeInteger(e.counter) &&
    e.counter >= 1 && safeTimestamp(e.signedAtMs) &&
    typeof e.snapshotJson === 'string' &&
    Buffer.byteLength(e.snapshotJson, 'utf8') <= MAX_SNAPSHOT_BYTES &&
    Buffer.byteLength(e.snapshotJson, 'utf8') > 0 &&
    typeof e.signature === 'string' && /^[A-Za-z0-9_-]{8,120}$/.test(e.signature)
}

function validTrustedIdentity(input: unknown): input is RegisteredBrokerProofIdentity {
  const b=record(input)
  if (!b || !exactKeys(b, [
    'status','brokerId','hostId','buildSha256',
    'publicJwk','keyThumbprint','enrollmentVerified',
  ]) || b.status !== 'active' || b.enrollmentVerified !== true ||
      typeof b.brokerId !== 'string' || !UUID.test(b.brokerId) ||
      typeof b.hostId !== 'string' || !UUID.test(b.hostId) ||
      typeof b.buildSha256 !== 'string' || !SHA256.test(b.buildSha256) ||
      !validPublicJwk(b.publicJwk) ||
      !canonicalBase64Url(b.keyThumbprint, 32)) return false
  return fingerprint(b.publicJwk) === b.keyThumbprint
}

const sameString = (a: string, b: string): boolean => {
  const left = Buffer.from(a), right=Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left,right)
}

/**
 * This is a DOMAIN-SEPARATED, field-ordered string; no JSON.stringify of
 * caller-provided objects is ever used to decide signed field ordering.
 * Every field is validated before this is called.
 */
export function canonicalDesktopProof(proof: Omit<DesktopSignedEvidence, 'signature'>): string {
  return [
    DESKTOP_PROOF_DOMAIN,
    `version:${proof.version}`,
    `broker_id:${proof.brokerId}`,
    `host_id:${proof.hostId}`,
    `build_sha256:${proof.buildSha256}`,
    `challenge_id:${proof.challengeId}`,
    `nonce:${proof.nonce}`,
    `counter:${proof.counter}`,
    `signed_at_ms:${proof.signedAtMs}`,
    `snapshot_sha256:${sha256(proof.snapshotJson)}`,
  ].join('\n')
}

export async function verifySignedDesktopEvidence(input: {
  envelope: unknown
  challenge: unknown
  trustedIdentity: unknown
  observedNowMs: number
  consume: ConsumeDesktopProof | null | undefined
}): Promise<DesktopProofCheck> {
  const deny = (reason: DesktopProofCheck['reason']): DesktopProofCheck => ({
    status: 'rejected', reason, signerVerified: false, hardwareAttested: false,
    trustedForRouting: false, dispatchAuthorized: false, diagnostic: null,
  })
  const { envelope, challenge, trustedIdentity, observedNowMs, consume } = input
  if (!validEnvelope(envelope) || !validChallenge(challenge) ||
      !safeTimestamp(observedNowMs) || typeof consume !== 'function') return deny('invalid_proof')
  if (!validTrustedIdentity(trustedIdentity)) return deny('identity_unverified')
  if (envelope.brokerId !== trustedIdentity.brokerId ||
      envelope.hostId !== trustedIdentity.hostId ||
      envelope.buildSha256 !== trustedIdentity.buildSha256 ||
      challenge.brokerId !== trustedIdentity.brokerId ||
      challenge.hostId !== trustedIdentity.hostId) return deny('identity_unverified')
  if (challenge.challengeId !== envelope.challengeId ||
      !sameString(challenge.nonce, envelope.nonce)) return deny('challenge_mismatch')
  if (observedNowMs < challenge.issuedAtMs ||
      observedNowMs >= challenge.expiresAtMs ||
      envelope.signedAtMs < challenge.issuedAtMs ||
      envelope.signedAtMs >= challenge.expiresAtMs ||
      envelope.signedAtMs > observedNowMs + MAX_SIGNED_SKEW_MS ||
      observedNowMs - envelope.signedAtMs > MAX_CHALLENGE_LIFETIME_MS) {
    return deny('expired_or_future')
  }
  const sig=Buffer.from(envelope.signature,'base64url')
  if (sig.length < 8 || sig.length > 80 ||
      sig.toString('base64url') !== envelope.signature) return deny('signature_invalid')
  const { signature: _signature, ...unsigned } = envelope
  try {
    const pub=createPublicKey({
      key: trustedIdentity.publicJwk as import('node:crypto').JsonWebKey,
      format:'jwk',
    })
    if (!verify('sha256',Buffer.from(canonicalDesktopProof(unsigned),'utf8'),
      {key:pub,dsaEncoding:'der'},sig)) return deny('signature_invalid')
  } catch { return deny('signature_invalid') }

  let snapshot: unknown
  try { snapshot=JSON.parse(envelope.snapshotJson) }
  catch { return deny('snapshot_invalid') }
  const diagnostic=inspectDesktopSnapshot(snapshot, observedNowMs)
  const source=record(snapshot)
  if (diagnostic.status !== 'observed' ||
      !source || !safeTimestamp(source.capturedAtMs) ||
      source.capturedAtMs < challenge.issuedAtMs ||
      source.capturedAtMs > envelope.signedAtMs + MAX_SIGNED_SKEW_MS ||
      envelope.signedAtMs - source.capturedAtMs > MAX_SNAPSHOT_LAG_MS) {
    return deny('snapshot_invalid')
  }

  // No "check then set": consumes MUST be one trusted atomic database write.
  // A mere local Set is permitted in synthetic tests only, never in production.
  try {
    const committed=await consume({
      brokerId:envelope.brokerId,hostId:envelope.hostId,
      challengeId:envelope.challengeId,nonceSha256:sha256(envelope.nonce),
      counter:envelope.counter,snapshotSha256:sha256(envelope.snapshotJson),
    })
    if (committed !== true) return deny('replayed_or_unavailable')
  } catch { return deny('replayed_or_unavailable') }
  return {
    status:'verified_diagnostic_only',reason:'ok',signerVerified:true,
    hardwareAttested:false,trustedForRouting:false,dispatchAuthorized:false,
    diagnostic,
  }
}

/**
 * Deliberately blocked integration with the existing *advisory* model router.
 * A signature protects transport, not accuracy of the asserted model health,
 * available credit balance or the authorization to run a worker.
 * A future signed, server-owned capability proof must be reviewed separately.
 */
export async function previewSignedDesktopDiagnostic(
  proofInput: Parameters<typeof verifySignedDesktopEvidence>[0],
  routingRequest: RoutingRequest,
): Promise<Readonly<{
  readonly proof: DesktopProofCheck
  readonly decision: ReturnType<typeof routeModel>
}>> {
  const proof = await verifySignedDesktopEvidence(proofInput)
  // Never forward caller evidence, even if the signature itself verifies.
  return {
    proof,
    decision: routeModel({ ...routingRequest, evidence: [] }),
  }
}
