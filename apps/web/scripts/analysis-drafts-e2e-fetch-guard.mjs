import net from 'node:net'
const allowed = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
const originalFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (!allowed.has(url.hostname)) throw Error('local verification denied external fetch: ' + url.hostname)
  return originalFetch(input, init)
}
const originalConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function(...args) {
  const options = Array.isArray(args[0]) ? args[0] : args
  const first = options[0]
  const host = first && typeof first === 'object' ? first.host || 'localhost'
    : typeof options[1] === 'string' ? options[1] : 'localhost'
  // Named pipes and Unix sockets are local IPC, not external TCP.
  const localIpc = first && typeof first === 'object' && first.path
  if (!localIpc && !allowed.has(host)) throw Error('local verification denied external socket: ' + host)
  return originalConnect.apply(this,args)
}
