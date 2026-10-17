import WebSocket from 'ws'
import { timingSafeEqual } from 'node:crypto'

// This verifier never prints URLs, cookies, credentials or handshake headers.
async function main() {
  const base = new URL(process.argv[2] ?? '')
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('invalid_origin')
  const endpoint = new URL('/api/atlas/voice-pilot/stream', base)
  endpoint.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  const cookie = process.env.ATLAS_PROBE_COOKIE
  if (!cookie) throw new Error('operator_session_required')
  const access = process.env.ATLAS_PROBE_ACCESS_URL ? new URL(process.env.ATLAS_PROBE_ACCESS_URL) : null
  if (access) {
    if (access.origin !== base.origin || access.username || access.password) throw new Error('invalid_access_origin')
    endpoint.search = access.search
  }
  async function probe(name, { auth = true, origin = base.origin, payload = null, expectedStatus = null, waitDeadline = false, expectReject = false } = {}) {
    return new Promise(resolve => {
      let done = false, echoed = false, openedAt = 0, status = null, rejectionTimer
      const ws = new WebSocket(endpoint, {
        headers: { ...(auth ? { Cookie: cookie } : {}), ...(origin === null ? {} : { Origin: origin }) },
        handshakeTimeout: 12000,
      })
      const timer = setTimeout(() => finish(false), 14000)
      function finish(ok) {
        if (done) return
        done = true; clearTimeout(timer); clearTimeout(rejectionTimer)
        ws.on('error', () => {})
        ws.terminate()
        resolve({ name, ok, ...(status === null ? {} : { status }) })
      }
      ws.on('unexpected-response', (_request, response) => {
        status = response.statusCode; response.resume(); finish(status === expectedStatus)
      })
      ws.on('open', () => {
        openedAt = Date.now()
        if (expectedStatus !== null) { finish(false); return }
        if (expectReject) rejectionTimer = setTimeout(() => finish(false), 2500)
        if (payload !== null) ws.send(payload, { binary: typeof payload !== 'string' })
      })
      ws.on('message', (data, binary) => {
        // A rejection probe must never accept an echo, even an exact one.
        if (expectReject || !Buffer.isBuffer(payload) || data.length !== payload.length || !binary || !timingSafeEqual(data, payload)) { finish(false); return }
        echoed = true
        if (!waitDeadline) finish(true)
      })
      ws.on('close', () => finish(expectedStatus === null && openedAt > 0 && (expectReject
        ? !echoed && Date.now() - openedAt < 2500
        : waitDeadline && echoed && Date.now() - openedAt >= 4500 && Date.now() - openedAt < 9000)))
      ws.on('error', () => finish(false))
    })
  }
  const results = []
  results.push(await probe('no_session', { auth: false, expectedStatus: 401 }))
  results.push(await probe('wrong_origin', { origin: 'https://invalid.example', expectedStatus: 403 }))
  results.push(await probe('missing_origin', { origin: null, expectedStatus: 403 }))
  results.push(await probe('binary_echo_and_deadline', { payload: Buffer.from([0, 255, 33, 18]), waitDeadline: true }))
  results.push(await probe('oversize_rejected', { payload: Buffer.alloc(6405), expectReject: true }))
  results.push(await probe('text_rejected', { payload: 'synthetic probe', expectReject: true }))
  console.log(JSON.stringify({ kind: 'atlas_voice_ws_probe', results }))
  if (results.some(result => !result.ok)) process.exitCode = 1
}
main().catch(() => {
  // Node URL/constructor errors can carry private input; emit no raw error.
  console.error('atlas_voice_probe_setup_failed')
  process.exitCode = 1
})
