import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PublicBrokerIdentity } from './types.js'

const execFileAsync = promisify(execFile)
const DEFAULT_HELPER = new URL('../../.native/omnira-broker-identity', import.meta.url).pathname

/** Fixed native identity helper boundary. It exposes no arbitrary command seam. */
export class MacKeychainIdentity {
  constructor(private readonly helperPath = process.env.OMNIRA_BROKER_IDENTITY_HELPER ?? DEFAULT_HELPER) {}

  async generate(identityId: string, allowKeychainFallback = false): Promise<PublicBrokerIdentity> {
    const args = ['generate', '--identity', safeIdentityId(identityId)]
    if (allowKeychainFallback) args.push('--allow-keychain-fallback')
    return this.publicResult(await this.run(args))
  }

  async publicIdentity(identityId: string): Promise<PublicBrokerIdentity> {
    return this.publicResult(await this.run(['public', '--identity', safeIdentityId(identityId)]))
  }

  async sign(identityId: string, payload: string): Promise<string> {
    if (Buffer.byteLength(payload, 'utf8') > 16_384) throw new Error('canonical payload exceeds broker identity limit')
    const value = await this.run(['sign', '--identity', safeIdentityId(identityId), '--payload-base64', Buffer.from(payload).toString('base64')])
    if (typeof value.signature !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(value.signature)) throw new Error('native helper returned invalid signature')
    return value.signature
  }

  async available(identityId: string): Promise<boolean> {
    try { await this.publicIdentity(identityId); return true } catch { return false }
  }

  private async run(args: string[]): Promise<Record<string, unknown>> {
    try {
      const { stdout } = await execFileAsync(this.helperPath, args, { encoding: 'utf8', maxBuffer: 32_768, timeout: 15_000 })
      const parsed = JSON.parse(stdout) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid native helper response')
      return parsed as Record<string, unknown>
    } catch {
      throw new Error('local broker identity operation failed')
    }
  }

  private publicResult(value: Record<string, unknown>): PublicBrokerIdentity {
    const jwk = value.publicJwk
    if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) throw new Error('native helper returned invalid public identity')
    const publicJwk = jwk as Record<string, unknown>
    if (publicJwk.kty !== 'EC' || publicJwk.crv !== 'P-256' || typeof publicJwk.x !== 'string' || typeof publicJwk.y !== 'string') throw new Error('native helper returned unsupported key')
    if (typeof value.identityId !== 'string' || typeof value.keyThumbprint !== 'string' || (value.storage !== 'secure_enclave' && value.storage !== 'keychain')) throw new Error('native helper returned invalid public identity')
    return { identityId: value.identityId, publicJwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y }, keyThumbprint: value.keyThumbprint, storage: value.storage }
  }
}

// Canonical 8-4-4-4-12 UUID with a valid version (1-5) and variant (8/9/a/b) nibble —
// the same family the server boundary accepts (lib/atlas/code-broker/principal.ts).
// Kept local: apps/code-broker cannot import from apps/web.
const IDENTITY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeIdentityId(value: string): string {
  if (typeof value !== 'string' || !IDENTITY_UUID.test(value)) throw new Error('invalid identity id')
  return value
}
