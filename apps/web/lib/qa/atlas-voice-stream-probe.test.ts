import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { WebSocketServer } from 'ws'
import { describe, expect, it } from 'vitest'
const script = resolve(process.cwd(), 'scripts/probe-atlas-voice-ws.mjs')
function run(origin: string, access?: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(resolveRun => {
    const env = { ...process.env, ATLAS_PROBE_COOKIE: 'operator=dummy', ATLAS_PROBE_ACCESS_URL: access ?? '' }
    execFile(process.execPath, [script, origin], { env, timeout: 35000 }, (error, stdout, stderr) =>
      resolveRun({ code: error ? Number((error as any).code) || 1 : 0, stdout, stderr }))
  })
}
async function badServer(mode: 'good' | 'echo_oversize' | 'ignore_invalid') {
  const server = createServer((_req, response) => { response.writeHead(404); response.end() })
  const wss = new WebSocketServer({ noServer: true })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const address = server.address() as { port: number }
  const origin = 'http://127.0.0.1:' + address.port
  server.on('upgrade', (request, socket, head) => {
    const status = request.headers.origin !== origin ? 403 : request.headers.cookie !== 'operator=dummy' ? 401 : 0
    if (status) { socket.end('HTTP/1.1 ' + status + ' Rejected\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); return }
    wss.handleUpgrade(request, socket, head, ws => {
      const timer = setTimeout(() => ws.terminate(), 5000)
      ws.on('close', () => clearTimeout(timer))
      ws.on('error', () => {})
      ws.on('message', (data, binary) => {
        if (binary && Buffer.from(data as ArrayBuffer).length === 4) { ws.send(data, { binary: true }); return }
        if (mode === 'echo_oversize' && binary) { ws.send(data, { binary: true }); return }
        if (mode !== 'ignore_invalid') ws.terminate()
      })
    })
  })
  return { origin, close: async () => {
    for (const ws of wss.clients) ws.terminate()
    await new Promise<void>(done => wss.close(() => done()))
    await new Promise<void>(done => server.close(() => done()))
  } }
}
describe('the CLI verifier cannot certify a broken or leaking probe', () => {
  it('accepts an actual bounded echo server and prompt invalid-frame rejection', async () => {
    const server = await badServer('good')
    try { const result = await run(server.origin); expect(result.code, result.stderr).toBe(0) }
    finally { await server.close() }
  }, 45000)
  it.each(['echo_oversize', 'ignore_invalid'] as const)('rejects deliberately broken server %s', async mode => {
    const server = await badServer(mode)
    try {
      const result = await run(server.origin)
      expect(result.code).toBe(1)
      const report = JSON.parse(result.stdout)
      expect(report.results.find((x: any) => x.name === 'oversize_rejected').ok).toBe(false)
      if (mode === 'ignore_invalid') expect(report.results.find((x: any) => x.name === 'text_rejected').ok).toBe(false)
    } finally { await server.close() }
  }, 45000)
  it.each(['access', 'base'])('never exposes a malformed private %s URL in errors', async mode => {
    const marker = 'SYNTHETIC_PRIVATE_PROBE_VALUE_84752'
    const result = await run(mode === 'base' ? 'https://[' + marker : 'https://preview.test', mode === 'access' ? 'https://[' + marker : undefined)
    expect(result.code).not.toBe(0)
    expect(result.stdout + result.stderr).not.toContain(marker)
    expect(result.stderr).not.toContain('ERR_INVALID_URL')
  })
})
