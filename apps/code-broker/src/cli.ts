#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { SecureMacBrokerSigner } from './identity/signer.js'
import { createEnrollmentProof, type EnrollmentPackage } from './identity/enrollment.js'
import { postEnrollment, postSignedDiagnostic } from './protocol/http-client.js'

const args = process.argv.slice(2)
const command = args.shift()
const value = (flag: string) => { const i = args.indexOf(flag); if (i < 0 || !args[i + 1]) throw new Error(`missing ${flag}`); return args[i + 1] }
const signer = new SecureMacBrokerSigner()

async function main() {
  if (command === 'generate') {
    const result = await signer.generateIdentity(value('--identity'), { allowKeychainFallback: args.includes('--allow-keychain-fallback') })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }
  if (command === 'enroll') {
    const enrollment = JSON.parse(await readFile(value('--package'), 'utf8')) as EnrollmentPackage
    const proof = await createEnrollmentProof({ enrollment, identityId: value('--identity'), hostLabel: value('--host-label'),
      localUidHash: value('--local-uid-hash'), osVersion: value('--os-version'),
      brokerVersion: value('--broker-version'), buildSha256: value('--build-sha256'), signer })
    const result = await postEnrollment(value('--origin'), proof)
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }
  if (command === 'diagnostic') {
    const result = await postSignedDiagnostic({ origin: value('--origin'), brokerId: value('--broker-id'),
      hostId: value('--host-id'), protocolVersion: Number(value('--protocol-version')),
      brokerVersion: value('--broker-version'), buildSha256: value('--build-sha256'),
      counter: Number(value('--counter')), identityId: value('--identity'), signer })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }
  throw new Error('usage: generate | enroll | diagnostic')
}

main().catch(() => { process.stderr.write('code-broker command failed\n'); process.exitCode = 1 })
