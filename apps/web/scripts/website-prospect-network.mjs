// Local capture network boundary. Connect only to the exact public IP validated by DNS.
import {lookup} from 'node:dns/promises'
import {isIP, connect} from 'node:net'
import {createServer, request as httpRequest} from 'node:http'

export function isPublicAddress(address) {
  if (isIP(address) !== 4) return false // Fail closed for IPv6 until a pinned IPv6 route is implemented.
  const [a,b,c] = address.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) || (a === 203 && b === 0 && c === 113))
}
export function publicTarget(value) {
  const u = new URL(value)
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password || u.port || !u.hostname.includes('.') || isIP(u.hostname) || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(u.hostname)) throw Error('PUBLIC_URL_REQUIRED')
  return u
}
export async function publicAddress(hostname, resolver = lookup) {
  const addresses = await resolver(hostname, {family:4, all:true, verbatim:true})
  if (!addresses.length || addresses.some(row => !isPublicAddress(row.address))) throw Error('PUBLIC_ADDRESS_REQUIRED')
  return addresses[0].address
}
export async function startCaptureProxy() {
  const sockets = new Set(), cache = new Map()
  let requests = 0, transferred = 0
  const resolve = async hostname => {
    if (++requests > 400) throw Error('CAPTURE_REQUEST_LIMIT')
    if (!cache.has(hostname)) cache.set(hostname, await publicAddress(hostname))
    return cache.get(hostname)
  }
  const track = socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => {})
    socket.setTimeout(25000, () => socket.destroy())
    socket.on('data', chunk => {transferred += chunk.length; if (transferred > 100 * 1024 * 1024) for (const current of sockets) current.destroy()})
  }
  const server = createServer(async (req,res) => {
    try {
      const target = publicTarget(req.url)
      if (target.protocol !== 'http:' || !['GET','HEAD'].includes(req.method)) throw Error('METHOD_DENIED')
      const address = await resolve(target.hostname)
      const upstream = httpRequest({hostname:address,port:80,path:target.pathname+target.search,method:req.method,
        headers:{host:target.host,'user-agent':req.headers['user-agent'] ?? 'OmniraProspectReview/1.0',accept:req.headers.accept ?? '*/*'}}, response => {
        res.writeHead(response.statusCode ?? 502,response.headers); response.pipe(res)
      })
      upstream.on('socket',track); upstream.on('error',()=>{res.writeHead(502);res.end()}); upstream.setTimeout(25000,()=>upstream.destroy()); upstream.end()
    } catch {res.writeHead(403);res.end('Capture target refused')}
  })
  server.on('connect',async(req,client,head)=>{
    try {
      if (!/^[a-z0-9.-]+:443$/i.test(req.url ?? '')) throw Error('CONNECT_TARGET_DENIED')
      const target=publicTarget('https://'+req.url),address=await resolve(target.hostname)
      const upstream=connect({host:address,port:443})
      track(upstream)
      upstream.once('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client)})
      upstream.once('error',()=>client.destroy());client.once('close',()=>upstream.destroy())
    }catch{client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')}
  })
  server.on('connection',track)
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  return {url:'http://127.0.0.1:'+server.address().port,close:async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve))}}
}
