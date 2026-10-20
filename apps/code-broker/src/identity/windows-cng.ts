import { execFile } from 'node:child_process'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { BrokerSigner, PublicBrokerIdentity } from './types.js'

const execFileAsync = promisify(execFile)
const RUNTIME = 'C:\\Program Files\\dotnet\\dotnet.exe'
const HELPER = fileURLToPath(new URL('../../.native/windows/OmniraBrokerIdentity.dll', import.meta.url))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const B64URL32 = /^[A-Za-z0-9_-]{43}$/
const FAILED = 'local broker identity operation failed'

function identityId(id: string): void {
  if (typeof id !== 'string' || id.length !== 36 || !UUID.test(id)) throw new Error('invalid identity id')
}
function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).sort().join(',') === [...expected].sort().join(',')
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
/** Fixed invocation/reparse checks. Full executable ACL trust is a later host-qualification gate. */
function checkHelperFile(path: string): void {
  let current = path
  if (realpathSync(path).toLowerCase() !== path.toLowerCase()) throw new Error(FAILED)
  if (!lstatSync(path).isFile()) throw new Error(FAILED)
  for (;;) {
    const st = lstatSync(current)
    if (st.isSymbolicLink()) throw new Error(FAILED)
    const parent = dirname(current)
    if (parent === current || parent === '.') break
    current = parent
  }
}

/** Windows current-user CNG adapter. No caller chooses a helper, key store or executable. */
export class WindowsCngBrokerSigner implements BrokerSigner {
  async generateIdentity(id: string, options?: { allowKeychainFallback?: boolean }): Promise<PublicBrokerIdentity> {
    identityId(id)
    if (options?.allowKeychainFallback === true) throw new Error('keychain fallback unsupported on Windows')
    return this.publicResult(await this.run(['generate', '--identity', id]), id)
  }
  async getPublicIdentity(id: string): Promise<PublicBrokerIdentity> {
    identityId(id)
    return this.publicResult(await this.run(['public', '--identity', id]), id)
  }
  async signCanonicalPayload(id: string, payload: string): Promise<string> {
    identityId(id)
    if (typeof payload !== 'string' || Buffer.byteLength(payload, 'utf8') > 16384) throw new Error('canonical payload exceeds broker identity limit')
    const publicIdentity = await this.getPublicIdentity(id)
    const result = await this.run(['sign', '--identity', id, '--payload-base64', Buffer.from(payload, 'utf8').toString('base64')])
    if (!exactKeys(result, ['signature']) || typeof result.signature !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(result.signature)) throw new Error(FAILED)
    try {
      const signature = Buffer.from(result.signature, 'base64url')
      if (signature.toString('base64url') !== result.signature || !verify('sha256', Buffer.from(payload, 'utf8'), {
        key: createPublicKey({ key: { ...publicIdentity.publicJwk }, format: 'jwk' }), dsaEncoding: 'der',
      }, signature)) throw new Error(FAILED)
      return result.signature
    } catch { throw new Error(FAILED) }
  }
  async verifyLocalIdentityAvailable(id: string): Promise<boolean> {
    try { await this.getPublicIdentity(id); return true } catch { return false }
  }
  private async run(args: string[]): Promise<Record<string, unknown>> {
    try {
      checkHelperFile(RUNTIME); checkHelperFile(HELPER)
      const { stdout } = await execFileAsync(RUNTIME, [HELPER, ...args], {
        shell: false, windowsHide: true, encoding: 'utf8', timeout: 15000, maxBuffer: 32768,
      })
      const value: unknown = JSON.parse(stdout)
      if (!record(value)) throw new Error(FAILED)
      return value
    } catch { throw new Error(FAILED) }
  }
  private publicResult(value: Record<string, unknown>, id: string): PublicBrokerIdentity {
    try {
      if (!exactKeys(value, ['identityId', 'publicJwk', 'keyThumbprint', 'storage']) || value.identityId !== id || value.storage !== 'windows_cng') throw new Error(FAILED)
      const jwk = value.publicJwk
      if (!record(jwk) || !exactKeys(jwk, ['kty', 'crv', 'x', 'y']) || jwk.kty !== 'EC' || jwk.crv !== 'P-256') throw new Error(FAILED)
      for (const coordinate of [jwk.x, jwk.y]) {
        if (typeof coordinate !== 'string' || !B64URL32.test(coordinate) || Buffer.from(coordinate, 'base64url').toString('base64url') !== coordinate) throw new Error(FAILED)
      }
      const publicJwk = { kty: 'EC' as const, crv: 'P-256' as const, x: jwk.x as string, y: jwk.y as string }
      createPublicKey({ key: publicJwk, format: 'jwk' })
      const thumb = createHash('sha256').update(JSON.stringify({ crv: 'P-256', kty: 'EC', x: publicJwk.x, y: publicJwk.y })).digest('base64url')
      if (value.keyThumbprint !== thumb) throw new Error(FAILED)
      return { identityId: id, publicJwk, keyThumbprint: thumb, storage: 'windows_cng' }
    } catch { throw new Error(FAILED) }
  }
}
