import {afterEach, describe, expect, it, vi} from 'vitest'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {handleDealerPilot} from './http'

const origin = 'http://127.0.0.1:19996'
const config = {url:'http://127.0.0.1:54001', anonKey:'synthetic-publishable', origin}
function request(path:string, init:RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (!headers.has('host')) headers.set('host', new URL(origin).host)
  return new Request(origin + path, {...init, headers})
}

describe('customer admin rehearsal HTTP boundary', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('refuses a foreign Host or database before using a connection', async () => {
    const network = vi.fn()
    vi.stubGlobal('fetch', network)
    const wrongHost = await handleDealerPilot(request('/hall/bjorkglantan', {headers:{host:'elsewhere.invalid'}}),config)
    expect(wrongHost.status).toBe(403)
    const remote = await handleDealerPilot(request('/hall/bjorkglantan'),{...config,url:'https://remote.invalid'})
    expect(remote.status).toBe(503)
    expect(network).not.toHaveBeenCalled()
  })

  it.each([null, 'http://example.invalid'])('rejects a form without the precise trusted Origin (%s)', async badOrigin => {
    const network = vi.fn()
    vi.stubGlobal('fetch', network)
    const headers = new Headers()
    if (badOrigin) headers.set('origin',badOrigin)
    const res = await handleDealerPilot(request('/hall/bjorkglantan/login',{method:'POST',headers,body:new URLSearchParams({email:'a@example.invalid',password:'secret'})}),config)
    expect(res.status).toBe(403)
    expect(network).not.toHaveBeenCalled()
  })

  it('checks stored photo bytes on egress even when a direct database client supplied them', async () => {
    const malformed=Buffer.alloc(26)
    malformed.write('RIFF');malformed.writeUInt32LE(18,4);malformed.write('WEBPVP8 ',8)
    const hash=createHash('sha256').update(malformed).digest('hex')
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(malformed.toString('base64'))))
    const res=await handleDealerPilot(request('/hall/bjorkglantan/foto/'+hash),config)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).not.toBe('image/webp')
  })

  it('displays only a decoded, metadata-free image and rechecks visibility on a cache hit', async () => {
    const source=await sharp({create:{width:64,height:40,channels:3,background:'#426652'}})
      .webp().withExif({IFD0:{Artist:'synthetic owner'}}).toBuffer()
    const hash=createHash('sha256').update(source).digest('hex')
    const network=vi.fn().mockResolvedValueOnce(Response.json(source.toString('base64')))
      .mockResolvedValueOnce(Response.json({code:'P0002'},{status:404}))
    vi.stubGlobal('fetch',network)
    const req=()=>request('/hall/bjorkglantan/foto/'+hash)
    const response=await handleDealerPilot(req(),config)
    const pixels=await sharp(Buffer.from(await response.arrayBuffer())).metadata()
    expect(pixels).toMatchObject({width:64,height:40,format:'webp'})
    expect(pixels.exif).toBeUndefined()
    expect((await handleDealerPilot(req(),config)).status).toBe(404)
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('returns the same display bytes after a new upload and after clearing in-memory cache', async () => {
    const pixels=Buffer.from(Array.from({length:256*128*3},(_,i)=>(i*7+(i>>5)*67)&255))
    const source=await sharp(pixels,{raw:{width:256,height:128,channels:3}}).png().toBuffer()
    const fresh=await import('./photo')
    const data=await fresh.displayPhoto(new File([Uint8Array.from(source).buffer],'bil.png',{type:'image/png'}))
    const stored=Buffer.from(data.bytes,'base64')
    const warm=await fresh.galleryPhoto(data.hash,stored)
    vi.resetModules()
    const cold=await (await import('./photo')).galleryPhoto(data.hash,stored)
    expect(warm.equals(cold)).toBe(true)
  })

  it('keeps a logged-out visitor away from draft photos and admin mutations', async () => {
    const network = vi.fn()
    vi.stubGlobal('fetch', network)
    const privatePhoto = await handleDealerPilot(request('/hall/bjorkglantan/foto/'+'0'.repeat(64)+'?utkast=1'),config)
    expect(privatePhoto.status).toBe(401)
    const mutation = await handleDealerPilot(request('/hall/bjorkglantan/admin',{method:'POST',headers:{origin},body:new URLSearchParams({intent:'publish'})}),config)
    expect(mutation.status).toBe(401)
    expect(network).not.toHaveBeenCalled()
  })

  it('protects the page editor and its private preview before contacting the database', async () => {
    const network = vi.fn()
    vi.stubGlobal('fetch',network)
    const base = '/hall/bjorkglantan'
    for (const route of ['/admin/sidan','/preview/sidan']) {
      const result = await handleDealerPilot(request(base+route),config)
      expect(result.status).toBe(303)
      expect(result.headers.get('location')).toBe(base+'/login')
    }
    const post = (route:string) => handleDealerPilot(request(base+route,{method:'POST',headers:{origin},body:new URLSearchParams({intent:'publish',version:'0'})}),config)
    expect((await post('/admin/sidan')).status).toBe(401)
    expect((await post('/preview/sidan')).status).toBe(405)
    expect(network).not.toHaveBeenCalled()
  })
})
