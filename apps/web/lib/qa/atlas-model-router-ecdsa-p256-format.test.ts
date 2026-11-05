import { generateKeyPairSync, sign, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { p256P1363ToDer } from '@/lib/atlas/model-router/ecdsa-p256-format'

describe('P-256 P1363 to DER format adapter for future Windows signer', () => {
  it('converts 20 different ephemeral in-memory ECDSA signatures to verifier-compatible DER', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec',{namedCurve:'prime256v1'})
    for(let i=0;i<20;i++) {
      const payload=Buffer.from('omnira synthetic desktop proof #'+i)
      const raw=sign('sha256',payload,{key:privateKey,dsaEncoding:'ieee-p1363'})
      expect(raw.length).toBe(64)
      const der=p256P1363ToDer(raw)
      expect(der[0]).toBe(0x30)
      expect(verify('sha256',payload,{key:publicKey,dsaEncoding:'der'},der)).toBe(true)
      expect(verify('sha256',payload,{key:publicKey,dsaEncoding:'der'},
        Buffer.concat([der.subarray(0,der.length-1),Buffer.from([der[der.length-1]^1])]))).toBe(false)
    }
  })
  it('uses shortest DER positive signed integers and adds sign padding when required', () => {
    const raw=Buffer.alloc(64,0)
    raw[0]=0x80
    raw[63]=0x01
    const der=Buffer.from(p256P1363ToDer(raw))
    expect(der[0]).toBe(0x30)
    expect(der[2]).toBe(0x02)
    expect(der[3]).toBe(33)
    expect(der[4]).toBe(0)
    expect(der[5]).toBe(0x80)
    expect(der[37]).toBe(0x02)
    expect(der[38]).toBe(1)
    expect(der[39]).toBe(1)
  })
  it('rejects zero-size, wrong curve widths and foreign types', () => {
    for(const sample of [
      Buffer.alloc(0),Buffer.alloc(63),Buffer.alloc(65),
      Buffer.alloc(72),Buffer.from([1]),'secret',null,undefined,
    ]) {
      expect(() => p256P1363ToDer(sample as Uint8Array)).toThrow()
    }
  })
  it('cannot sign or generate any protected key: conversion changes only bytes', () => {
    const original=Buffer.alloc(64,7)
    const copy=Buffer.from(original)
    const der=p256P1363ToDer(original)
    expect(original).toEqual(copy)
    expect(der).not.toEqual(original)
  })
})
