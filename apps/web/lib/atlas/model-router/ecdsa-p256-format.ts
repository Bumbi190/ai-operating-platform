/**
 * Pure ECDSA P-256 signature encoding adapter for future Windows CNG signer.
 *
 * Node's existing Code Broker verifier expects ASN.1 DER. A future Windows
 * native signer must document its actual output format before using this
 * helper. This module NEVER creates/opens a key or authorizes a dispatch.
 *
 * Input is exactly 64 bytes of IEEE P1363 (32-byte big-endian r || s).
 * Output is the canonical DER SEQUENCE of two positive INTEGERs. Strict,
 * fail-closed inputs avoid accidentally treating an arbitrary blob as a key.
 */
export function p256P1363ToDer(input: Uint8Array): Uint8Array {
  if (!(input instanceof Uint8Array) || input.byteLength !== 64) {
    throw new Error('expected a 64-byte P-256 P1363 signature')
  }
  const bytes=Buffer.from(input)
  const encodeInteger=(part: Buffer):Buffer => {
    let first=0
    while(first < part.length-1 && part[first]===0) first++
    let value=part.subarray(first)
    // DER INTEGER is signed: prefix 0x00 if highest bit would be set.
    if ((value[0] & 0x80) !== 0) value=Buffer.concat([Buffer.from([0]),value])
    return Buffer.concat([Buffer.from([0x02,value.length]),value])
  }
  const r=encodeInteger(bytes.subarray(0,32))
  const s=encodeInteger(bytes.subarray(32,64))
  const length=r.length+s.length
  if (length>127) throw new Error('unexpected P-256 DER sequence size')
  return Buffer.concat([Buffer.from([0x30,length]),r,s])
}
