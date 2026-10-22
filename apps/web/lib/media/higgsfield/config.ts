import { HiggsfieldError } from './types'

export const HIGGSFIELD_MCP_URL = 'https://mcp.higgsfield.ai/mcp'
export const HIGGSFIELD_ISSUER = 'https://clerk.higgsfield.ai'
export const HIGGSFIELD_CALLBACK_PATH = '/api/media/higgsfield/oauth/callback'
export const MAX_PROVIDER_BYTES = 1024 * 1024

export type ConfigResult =
  | { ok: true; redirectUri: string; encryptionConfigured: true }
  | { ok: false; code: 'disabled' | 'not_configured' }

export function encryptionKey(env: Record<string,string|undefined> = process.env): Buffer {
  const raw=env.MEDIA_PROVIDER_OAUTH_ENCRYPTION_KEY ?? ''
  const key=Buffer.from(raw,'base64')
  if (key.length!==32 || key.toString('base64')!==raw) throw new HiggsfieldError('not_configured')
  return key
}
export function resolveHiggsfieldConfig(env: Record<string,string|undefined> = process.env): ConfigResult {
  if (env.HIGGSFIELD_MCP_ENABLED!=='true' && env.HIGGSFIELD_MCP_ENABLED!=='1') return {ok:false,code:'disabled'}
  try {
    encryptionKey(env)
    const uri=new URL(env.HIGGSFIELD_OAUTH_REDIRECT_URI ?? '')
    const local=env.NODE_ENV==='development' && ['localhost','127.0.0.1'].includes(uri.hostname)
    if ((uri.protocol!=='https:' && !(local && uri.protocol==='http:')) || uri.username || uri.password || uri.search || uri.hash || uri.pathname!==HIGGSFIELD_CALLBACK_PATH) throw new Error()
    return {ok:true,redirectUri:uri.href,encryptionConfigured:true}
  } catch { return {ok:false,code:'not_configured'} }
}
export function requireHiggsfieldConfig() {
  const config=resolveHiggsfieldConfig()
  if (!config.ok) throw new HiggsfieldError(config.code)
  return config
}
export function assertHiggsfieldUrl(value:string|URL, purpose:'resource'|'issuer'): URL {
  try {
    const url=new URL(value)
    const origin=purpose==='resource' ? new URL(HIGGSFIELD_MCP_URL).origin : HIGGSFIELD_ISSUER
    if(url.origin!==origin || url.username || url.password || url.hash) throw new Error()
    return url
  } catch { throw new HiggsfieldError('invalid_endpoint') }
}

/** Pin all SDK traffic, prevent authenticated discovery, bound bodies and time. */
export function createHiggsfieldFetch(delegate:typeof fetch=fetch,budgetMs=25000):typeof fetch {
  const deadline=Date.now()+budgetMs
  return async (input,init) => {
    const original=new Request(input,init)
    const purpose=original.url.startsWith(new URL(HIGGSFIELD_MCP_URL).origin+'/')?'resource':'issuer'
    const url=assertHiggsfieldUrl(original.url,purpose)
    const discovery=url.pathname.includes('/.well-known/') || url.pathname==='/oauth/register'
    if(discovery && original.headers.has('authorization')) throw new HiggsfieldError('invalid_endpoint')
    const remaining=Math.min(10000,deadline-Date.now())
    if(remaining<=0) throw new HiggsfieldError('provider_unavailable')
    const signal=AbortSignal.any([original.signal,AbortSignal.timeout(remaining)])
    const request=new Request(original,{redirect:'error',signal,credentials:'omit'})
    try {
      const response=await delegate(request)
      if(response.status>=300 && response.status<400) throw new HiggsfieldError('invalid_endpoint')
      if(Number(response.headers.get('content-length')??0)>MAX_PROVIDER_BYTES) throw new HiggsfieldError('invalid_response')
      if(!response.body) return response
      const reader=response.body.getReader()
      let size=0
      const capped=new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const {done,value}=await reader.read()
            if(done) {controller.close();return}
            size+=value.byteLength
            if(size>MAX_PROVIDER_BYTES) {await reader.cancel();controller.error(new HiggsfieldError('invalid_response'));return}
            controller.enqueue(value)
          } catch {controller.error(new HiggsfieldError('provider_unavailable'))}
        },
        cancel(reason) {return reader.cancel(reason)},
      })
      const result=new Response(capped,{status:response.status,statusText:response.statusText,headers:response.headers})
      // MCP SSE remains streaming; JSON is bounded before callers see it.
      if(response.headers.get('content-type')?.includes('text/event-stream')) return result
      const bytes=await result.arrayBuffer()
      return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers})
    } catch(error) {
      if(error instanceof HiggsfieldError) throw error
      throw new HiggsfieldError('provider_unavailable')
    }
  }
}
