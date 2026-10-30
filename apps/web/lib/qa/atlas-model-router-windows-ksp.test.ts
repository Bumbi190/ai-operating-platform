import { describe, expect, it } from 'vitest'
import {
  inspectWindowsKspProbe, WINDOWS_KSP_PROBE_VERSION,
} from '@/lib/atlas/model-router/windows-ksp-evidence'

const sample = () => ({
  schemaVersion: WINDOWS_KSP_PROBE_VERSION,
  state: 'observed',
  provider: 'Microsoft Platform Crypto Provider',
  algorithm: 'ECDSA_P256',
  platformProviderOpened: true,
  platformEcdsaP256Supported: true,
  providerOpenError: '0x00000000',
  algorithmQueryError: '0x00000000',
  permanentKeyCreated: false,
  tpmKeyProvisioned: false,
  hardwareAttestation: false,
  note: 'Read-only capability probe only.',
})

describe('Windows TPM P-256 observation never provides broker authority', () => {
  it('recognizes platform capability but never claims a created key or enrollment', () => {
    const res=inspectWindowsKspProbe(sample())
    expect(res.status).toBe('capable_for_operator_review')
    expect(res.providerOpened).toBe(true)
    expect(res.algorithmSupported).toBe(true)
    expect(res.nonExportableKeyVerified).toBe(false)
    expect(res.hardwareKeyCreated).toBe(false)
    expect(res.deviceEnrolled).toBe(false)
    expect(res.privateKeyExported).toBe(false)
    expect(res.ownerApprovalReceived).toBe(false)
    expect(res.brokerRegistrationAuthorized).toBe(false)
    expect(res.executionAuthorized).toBe(false)
  })

  it('rejects purported key creation, export or TPM attestation', () => {
    for (const input of [
      { ...sample(),permanentKeyCreated:true },
      { ...sample(),tpmKeyProvisioned:true },
      { ...sample(),hardwareAttestation:true },
      { ...sample(),ownerApproved:true },
      { ...sample(),privateKey:'secret' },
    ]) {
      const res=inspectWindowsKspProbe(input)
      expect(res.status).toBe('invalid')
      expect(res.executionAuthorized).toBe(false)
    }
  })

  it('refuses any software key store fallback or incorrect algorithm', () => {
    for(const input of [
      {...sample(),provider:'Microsoft Software Key Storage Provider'},
      {...sample(),algorithm:'RSA'},
      {...sample(),algorithm:'ECDSA_P384'},
    ]) {
      expect(inspectWindowsKspProbe(input).status).toBe('invalid')
    }
  })

  it('marks an unavailable native query as unavailable rather than ready', () => {
    const absent={
      ...sample(),state:'unavailable',platformProviderOpened:false,
      platformEcdsaP256Supported:false,
      providerOpenError:'0x80090030',algorithmQueryError:'unavailable',
    }
    const out=inspectWindowsKspProbe(absent)
    expect(out.status).toBe('unavailable')
    expect(out.executionAuthorized).toBe(false)
  })

  it('distinguishes documented NTE_NOT_SUPPORTED from an unknown query error', () => {
    const base={...sample(),platformEcdsaP256Supported:false}
    expect(inspectWindowsKspProbe({
      ...base,algorithmQueryError:'0x80090029',
    }).status).toBe('unsupported')
    expect(inspectWindowsKspProbe({
      ...base,algorithmQueryError:'0x80090026',
    }).status).toBe('unavailable')
    expect(inspectWindowsKspProbe({
      ...base,algorithmQueryError:'unavailable',
    }).status).toBe('unavailable')
  })

  it('rejects internally contradictory results', () => {
    const base=sample()
    for(const input of [
      {...base,platformProviderOpened:false},
      {...base,state:'unavailable'},
      {...base,platformEcdsaP256Supported:false},
      {...base,algorithmQueryError:'0x80090029'},
      {...base,providerOpenError:'0x80090030'},
      {...base,providerOpenError:1234},
    ]) {
      expect(inspectWindowsKspProbe(input).status).toBe('invalid')
    }
  })

  it('refuses malformed, oversized, unexpected or non-object data', () => {
    for(const value of [null,{},[],false,'text',
      {...sample(),schemaVersion:'wrong'},
      {...sample(),state:'ready_to_enroll'},
      {...sample(),note:'x'.repeat(301)},
      {...sample(),platformEcdsaP256Supported:'true'},
      {...sample(),algorithmQueryError:'0x123'},
    ]) {
      const res=inspectWindowsKspProbe(value)
      expect(res.status).toBe('invalid')
      expect(res.brokerRegistrationAuthorized).toBe(false)
    }
  })
})
