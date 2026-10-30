/**
 * Windows TPM platform provider capability – read-only observation.
 *
 * IMPORTANT: OS capability detection is NOT protected-key proof, key creation
 * consent, broker enrollment, identity authentication or model authorization.
 * This accepts only a deliberately narrow diagnostic schema, and nothing in
 * this module can create/open a private key, sign, dispatch or make a request.
 */
export const WINDOWS_KSP_PROBE_VERSION = 'atlas.windows.ksp_probe.v1' as const

export type WindowsKspDiagnostic = Readonly<{
  status: 'capable_for_operator_review' | 'unavailable' | 'unsupported' | 'invalid'
  providerName: 'Microsoft Platform Crypto Provider'
  algorithm: 'ECDSA_P256'
  providerOpened: boolean
  algorithmSupported: boolean
  nonExportableKeyVerified: false
  hardwareKeyCreated: false
  deviceEnrolled: false
  privateKeyExported: false
  ownerApprovalReceived: false
  brokerRegistrationAuthorized: false
  executionAuthorized: false
  reason: string
}>

const PROVIDER = 'Microsoft Platform Crypto Provider' as const
const ALGORITHM = 'ECDSA_P256' as const
const CODE = /^0x[0-9A-F]{8}$/

const isRecord = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x)

export function inspectWindowsKspProbe(input: unknown): WindowsKspDiagnostic {
  const result = (status: WindowsKspDiagnostic['status'], reason: string,
    providerOpened = false, algorithmSupported = false): WindowsKspDiagnostic => ({
    status,
    providerName: PROVIDER, algorithm: ALGORITHM,
    providerOpened, algorithmSupported,
    nonExportableKeyVerified: false, hardwareKeyCreated: false,
    deviceEnrolled: false, privateKeyExported: false,
    ownerApprovalReceived: false, brokerRegistrationAuthorized: false,
    executionAuthorized: false, reason,
  })

  if (!isRecord(input) || Object.keys(input).sort().join('|') !== [
    'schemaVersion','state','provider','algorithm','platformProviderOpened',
    'platformEcdsaP256Supported','providerOpenError','algorithmQueryError',
    'permanentKeyCreated','tpmKeyProvisioned','hardwareAttestation','note',
  ].sort().join('|') || input.schemaVersion !== WINDOWS_KSP_PROBE_VERSION ||
    input.provider !== PROVIDER || input.algorithm !== ALGORITHM ||
    !['observed','unavailable'].includes(input.state as string) ||
    typeof input.platformProviderOpened !== 'boolean' ||
    typeof input.platformEcdsaP256Supported !== 'boolean' ||
    typeof input.providerOpenError !== 'string' ||
    typeof input.algorithmQueryError !== 'string' ||
    !(CODE.test(input.providerOpenError) || input.providerOpenError === 'unavailable' ||
      input.providerOpenError === 'code_unavailable') ||
    !(CODE.test(input.algorithmQueryError) || input.algorithmQueryError === 'unavailable' ||
      input.algorithmQueryError === 'code_unavailable') ||
    input.permanentKeyCreated !== false || input.tpmKeyProvisioned !== false ||
    input.hardwareAttestation !== false ||
    typeof input.note !== 'string' || input.note.length > 300) {
    return result('invalid','Malformed or privileged Windows key diagnostic refused.')
  }

  const opened=input.platformProviderOpened
  const supported=input.platformEcdsaP256Supported

  if ((input.state === 'observed' && (!opened || input.providerOpenError !== '0x00000000')) ||
      (input.state === 'unavailable' && opened) ||
      (supported && (!opened || input.algorithmQueryError !== '0x00000000')) ||
      (!supported && input.algorithmQueryError === '0x00000000')) {
    return result('invalid','Contradictory Windows CNG status refused.')
  }

  if (!opened) return result('unavailable','Platform provider could not be queried.')
  if (!supported) return input.algorithmQueryError === '0x80090029'
    ? result('unsupported','Native NCrypt reported NTE_NOT_SUPPORTED for P-256.',true)
    : result('unavailable','P-256 algorithm query failed or returned no verified verdict.',true)

  // Only eligible for a later, explicitly owner-approved provisioning review.
  // The resulting TRUE is NEVER a hardware-key certification or dispatch grant.
  return result('capable_for_operator_review',
    'Platform P-256 is supported. No key has been created or registered.',true,true)
}
