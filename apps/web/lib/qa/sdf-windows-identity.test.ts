import { generateKeyPairSync, createHash, sign } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ execFile: vi.fn(), linked: false, missing: false }))
vi.mock('node:child_process', () => ({ execFile: mock.execFile }))
vi.mock('node:fs', () => ({
  lstatSync: () => { if (mock.missing) throw new Error('missing'); return { isSymbolicLink: () => mock.linked, isFile: () => true, isDirectory: () => true } },
  realpathSync: (path: string) => path,
}))
import { WindowsCngBrokerSigner } from '../../../code-broker/src/identity/windows-cng'
import { createPlatformBrokerSigner } from '../../../code-broker/src/identity/platform-signer'
import { SecureMacBrokerSigner } from '../../../code-broker/src/identity/signer'

const ID = '00000000-0000-4000-8000-000000000001'
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const jwk = pair.publicKey.export({ format: 'jwk' })
const publicJwk = { kty: 'EC', crv: 'P-256', x: jwk.x!, y: jwk.y! }
const thumb = createHash('sha256').update(JSON.stringify({ crv: 'P-256', kty: 'EC', x: jwk.x, y: jwk.y })).digest('base64url')
const good = { identityId: ID, publicJwk, keyThumbprint: thumb, storage: 'windows_cng' }
let output: any
const payload = 'Atlas åäö'
beforeEach(() => {
  output = structuredClone(good); mock.linked = false; mock.missing = false
  mock.execFile.mockReset()
  mock.execFile.mockImplementation((_file, args, _options, callback) => {
    const result = args[1] === 'sign'
      ? { signature: sign('sha256', Buffer.from(payload), { key: pair.privateKey, dsaEncoding: 'der' }).toString('base64url') }
      : output
    callback(null, { stdout: JSON.stringify(result) })
  })
})
describe('Windows broker identity adapter', () => {
  it('selects Windows, preserves Mac and refuses unsupported platforms', () => {
    expect(createPlatformBrokerSigner('win32')).toBeInstanceOf(WindowsCngBrokerSigner)
    expect(createPlatformBrokerSigner('darwin')).toBeInstanceOf(SecureMacBrokerSigner)
    expect(() => createPlatformBrokerSigner('linux')).toThrow('unsupported')
  })
  it('uses the fixed runtime and an argument array for a helper path containing spaces', async () => {
    expect(await new WindowsCngBrokerSigner().generateIdentity(ID)).toEqual(good)
    const [file, args, opts] = mock.execFile.mock.calls[0]
    expect(file).toBe('C:\\Program Files\\dotnet\\dotnet.exe')
    expect(args[0]).toMatch(/OmniraBrokerIdentity\.dll$/)
    expect(args.slice(1)).toEqual(['generate', '--identity', ID])
    expect(opts).toMatchObject({ shell: false, windowsHide: true, timeout: 15000, maxBuffer: 32768 })
  })
  for (const id of ['../x', ID+'\n', ID.toUpperCase().replace('00000000','ABCDEF00'), '00000000-0000-9000-8000-000000000001']) {
    it('rejects invalid UUID before helper invocation: '+JSON.stringify(id), async () => {
      await expect(new WindowsCngBrokerSigner().generateIdentity(id)).rejects.toThrow()
      expect(mock.execFile).not.toHaveBeenCalled()
    })
  }
  it('counts Unicode bytes before any helper invocation', async () => {
    await expect(new WindowsCngBrokerSigner().signCanonicalPayload(ID, 'ö'.repeat(8193))).rejects.toThrow()
    expect(mock.execFile).not.toHaveBeenCalled()
  })
  it('refuses the Mac keychain fallback option', async () => {
    await expect(new WindowsCngBrokerSigner().generateIdentity(ID, { allowKeychainFallback: true })).rejects.toThrow()
    expect(mock.execFile).not.toHaveBeenCalled()
  })
  for (const [name, change] of [
    ['foreign identity', (v:any)=>{v.identityId='00000000-0000-4000-8000-000000000002'}],
    ['forged thumbprint',(v:any)=>{v.keyThumbprint='A'.repeat(43)}],
    ['wrong storage',(v:any)=>{v.storage='secure_enclave'}],
    ['invalid curve point',(v:any)=>{v.publicJwk.x='A'.repeat(43);v.publicJwk.y='A'.repeat(43)}],
    ['private parameter',(v:any)=>{v.publicJwk.d='secret'}],
    ['unknown result field',(v:any)=>{v.other='unexpected'}],
  ] as const) it('rejects '+name, async () => {
    change(output)
    await expect(new WindowsCngBrokerSigner().getPublicIdentity(ID)).rejects.toThrow()
  })
  it('rejects linked helper ancestors before invoking a process', async () => {
    mock.linked = true
    await expect(new WindowsCngBrokerSigner().getPublicIdentity(ID)).rejects.toThrow()
    expect(mock.execFile).not.toHaveBeenCalled()
  })
  it('fails closed when the fixed helper is missing', async () => {
    mock.missing = true
    expect(await new WindowsCngBrokerSigner().verifyLocalIdentityAvailable(ID)).toBe(false)
    expect(mock.execFile).not.toHaveBeenCalled()
  })
  it('redacts helper failures without generating a replacement identity', async () => {
    mock.execFile.mockImplementation((_f,_a,_o,cb)=>cb(new Error('secret provider failure')))
    await expect(new WindowsCngBrokerSigner().getPublicIdentity(ID)).rejects.toThrow('local broker identity operation failed')
    expect(mock.execFile.mock.calls.every(call=>call[1][1]==='public')).toBe(true)
  })
  it('signs only under the verified public identity', async () => {
    expect(await new WindowsCngBrokerSigner().signCanonicalPayload(ID,payload)).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(mock.execFile.mock.calls.map(call=>call[1][1])).toEqual(['public','sign'])
  })
  it('rejects a signature over another payload', async () => {
    await expect(new WindowsCngBrokerSigner().signCanonicalPayload(ID,'another')).rejects.toThrow()
  })
})

import { afterEach } from 'vitest'
import { postEnrollment, postSignedDiagnostic } from '../../../code-broker/src/protocol/http-client'
import { canonicalRequestPayload, sha256Hex } from '../../../code-broker/src/protocol/canonical-request'
import { verifyEs256 } from '@/lib/atlas/code-broker/crypto'
afterEach(() => vi.unstubAllGlobals())
describe('signed diagnostic transport', () => {
  let fetcher: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
  })
  for (const origin of ['https://example.invalid','http://localhost:3000','http://127.0.0.1:3000','http://[::1]:3000']) {
    it('permits explicit HTTPS or loopback: '+origin, async () => {
      await expect(postEnrollment(origin, {})).resolves.toEqual({ok:true})
      expect(fetcher).toHaveBeenCalledTimes(1)
    })
  }
  for (const origin of ['http://example.invalid','https://user:pass@example.invalid','https://example.invalid/subpath','https://example.invalid?x=1','https://example.invalid#x','file:///tmp/x','ftp://example.invalid']) {
    it('refuses unsafe origin before sending: '+origin, async () => {
      await expect(postEnrollment(origin, {})).rejects.toThrow()
      expect(fetcher).not.toHaveBeenCalled()
    })
  }
  it('refuses automatic redirects for enrollment', async () => {
    await postEnrollment('https://example.invalid', {})
    expect(fetcher.mock.calls[0][1].redirect).toBe('error')
  })
  it('signs the exact diagnostic body with server-compatible DER', async () => {
    const signer:any = { signCanonicalPayload: async (_id:string, text:string) => sign('sha256', Buffer.from(text), {key:pair.privateKey,dsaEncoding:'der'}).toString('base64url') }
    await postSignedDiagnostic({origin:'https://example.invalid', brokerId:ID,hostId:ID,protocolVersion:1,
      brokerVersion:'0.1.0',buildSha256:'a'.repeat(64),counter:1,identityId:ID,signer})
    const [url, options]=fetcher.mock.calls[0], h=options.headers
    expect(url.pathname).toBe('/api/atlas/code-work/broker/identity')
    expect(options.body).toBe('{}')
    expect(options.redirect).toBe('error')
    const canonical=canonicalRequestPayload({brokerId:ID,hostId:ID,protocolVersion:1,brokerVersion:'0.1.0',
      buildSha256:'a'.repeat(64),counter:1,jti:h['x-omnira-broker-jti'],timestamp:h['x-omnira-broker-timestamp'],
      method:'POST',path:url.pathname,bodySha256:sha256Hex(options.body)})
    expect(verifyEs256(publicJwk as any,canonical,h['x-omnira-broker-signature'])).toBe(true)
    expect(verifyEs256(publicJwk as any,canonical+'x',h['x-omnira-broker-signature'])).toBe(false)
  })
  it('redacts network errors and never retries a signed request', async () => {
    fetcher.mockRejectedValue(new Error('secret pairing request'))
    await expect(postEnrollment('https://example.invalid',{})).rejects.toThrow('broker protocol unavailable')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
