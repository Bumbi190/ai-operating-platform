import { createHash, generateKeyPairSync } from 'node:crypto'
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WindowsCngBrokerSigner } from '../../../code-broker/src/identity/windows-cng'
import type { PublicBrokerIdentity } from '../../../code-broker/src/identity/types'
import { verifyEs256 } from '@/lib/atlas/code-broker/crypto'

const required = process.env.SDF_WINDOWS_IDENTITY_REQUIRED === '1'
if (required && process.platform !== 'win32') throw new Error('Windows identity proof requires a Windows host')
const ROOT = resolve(__dirname, '../../../..')
const DOTNET = 'C:\\Program Files\\dotnet\\dotnet.exe'
const HELPER = resolve(ROOT, 'apps/code-broker/.native/windows/OmniraBrokerIdentity.dll')
const SMOKE = resolve(ROOT, 'apps/code-broker/native/windows/smoke/bin/Release/net8.0-windows/Smoke.dll')
const exec = promisify(execFile)

describe.runIf(required && process.platform === 'win32')('real Windows CNG and helper processes', () => {
  let child: ChildProcessWithoutNullStreams | undefined
  let fixture: PublicBrokerIdentity
  let output = ''
  const signer = new WindowsCngBrokerSigner()
  beforeAll(async () => {
    if (!existsSync(HELPER) || !existsSync(SMOKE)) throw new Error('Build Windows helper and smoke prerequisite first')
    child = spawn(DOTNET, [SMOKE, '--fixture'], { shell:false, windowsHide:true, stdio:['pipe','pipe','pipe'] })
    const running = child
    fixture = await new Promise<PublicBrokerIdentity>((accept,reject) => {
      const timer=setTimeout(()=>reject(new Error('native fixture readiness timeout')),10000)
      running.on('error', error=>{clearTimeout(timer);reject(error)})
      running.on('close',()=>{clearTimeout(timer);reject(new Error('native fixture closed before readiness'))})
      running.stdout.on('data',(data:Buffer)=>{
        output+=data.toString('utf8')
        const first=output.indexOf('\n')
        if(first>=0) { clearTimeout(timer); try{accept(JSON.parse(output.slice(0,first)))}catch{reject(new Error('native fixture output invalid'))} }
      })
      running.stderr.resume()
    })
    console.info('native_identity_public_sha256='+createHash('sha256').update(JSON.stringify(fixture)).digest('hex'))
  },15000)
  afterAll(async () => {
    if (!child) return
    const running=child
    const exited = new Promise<number|null>(accept=>running.once('close',code=>accept(code)))
    running.stdin.end('release\n')
    expect(await exited).toBe(0)
    expect(output).toContain('"fixtureRemoved":true')
  },15000)
  it('reopens the same persistent identity through a new native process',async()=>{
    expect(await signer.getPublicIdentity(fixture.identityId)).toEqual(fixture)
  })
  it('produces DER accepted by the actual server verifier',async()=>{
    const text='Atlas verkligt Windowsprov åäö'
    const signature=await signer.signCanonicalPayload(fixture.identityId,text)
    expect(verifyEs256(fixture.publicJwk,text,signature)).toBe(true)
    expect(verifyEs256(fixture.publicJwk,text+'x',signature)).toBe(false)
    const foreign=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'})
    expect(verifyEs256({kty:'EC',crv:'P-256',x:foreign.x!,y:foreign.y!},text,signature)).toBe(false)
  })
  it('refuses duplicate generation and keeps the existing key',async()=>{
    await expect(signer.generateIdentity(fixture.identityId)).rejects.toThrow()
    expect(await signer.getPublicIdentity(fixture.identityId)).toEqual(fixture)
  })
  it('rejects malformed native commands without exposing internals',async()=>{
    for(const args of [['public','--identity','invalid'],['delete','--identity',fixture.identityId]]) {
      try { await exec(DOTNET,[HELPER,...args],{timeout:15000,maxBuffer:32768,windowsHide:true,shell:false}); throw new Error('unexpected success') }
      catch(error:any) { expect(error.code).toBe(1); expect(error.stderr.trim()).toBe('broker_identity_failed') }
    }
  })
  it('proves private export rejection, missing-key safety and fixture cleanup',async()=>{
    const {stdout}=await exec(DOTNET,[SMOKE],{timeout:15000,maxBuffer:32768,windowsHide:true,shell:false})
    const result=JSON.parse(stdout)
    expect(result.passed).toBe(15)
    expect(result.names).toContain('private_export_refused')
    expect(result.names).toContain('missing_identity_not_created')
    expect(result.names).toContain('fixture_key_removed')
  })
})
