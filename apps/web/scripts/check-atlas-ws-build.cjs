const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

function validProbe(body, marker) {
  return body?.marker === marker && Array.isArray(body.results)
    && body.results.length === 4
    && [4, 31, 32, 6404].every((length, i) => {
      const row = body.results[i];
      return row?.length === length && row.received === true && row.error === null;
    });
}

async function main() {
  const root = path.resolve(__dirname, '../../..');
  const fixture = path.join(root, '.superpowers/sdd/2026-10-17-atlas-streaming-stt/ws-build-fixture');
  const marker = randomUUID();
  fs.mkdirSync(path.join(fixture, 'app/api/check'), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ private: true }));
  fs.writeFileSync(path.join(fixture, 'next.config.mjs'), "export {default} from '../../../../apps/web/next.config.mjs';\n");
  fs.writeFileSync(path.join(fixture, 'app/layout.js'), "export default function Root({children}){return <html><body>{children}</body></html>}");
  fs.writeFileSync(path.join(fixture, 'app/page.js'), "export default function Page(){return <p>WebSocket build regression</p>}");
  fs.writeFileSync(path.join(fixture, 'app/api/check/route.js'), `
import { Receiver } from 'ws';
export const dynamic = 'force-dynamic';
export function GET() {
  const results = [];
  for (const length of [4, 31, 32, 6404]) {
    let received = false, error = null;
    const receiver = new Receiver({ isServer: true, maxPayload: 6404 });
    receiver.on('message', data => { received = data.length === length && data.every((value, index) => value === index % 251); });
    receiver.on('error', () => {});
    const extended = length >= 126, head = extended ? 8 : 6;
    const frame = Buffer.alloc(head + length), mask = Buffer.from([7, 19, 31, 43]);
    frame[0] = 0x82; frame[1] = 0x80 | (extended ? 126 : length);
    if (extended) frame.writeUInt16BE(length, 2);
    mask.copy(frame, extended ? 4 : 2);
    for (let i = 0; i < length; i++) frame[head + i] = (i % 251) ^ mask[i % 4];
    try { receiver.write(frame); }
    catch (e) { error = e instanceof TypeError && /unmask/.test(e.message) ? 'unmask_not_function' : 'decode_failed'; }
    results.push({ length, received, error }); receiver.destroy();
  }
  return Response.json({ marker: ${JSON.stringify(marker)}, results });
}`);
  const log = fs.createWriteStream(path.join(fixture, 'build.log'));
  const command = path.join(root, 'node_modules/next/dist/bin/next');
  const options = { cwd: root, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] };
  let server;
  try {
    const build = spawn(process.execPath, [command, 'build', fixture], options);
    build.stdout.pipe(log, { end: false }); build.stderr.pipe(log, { end: false });
    const code = await new Promise((resolve, reject) => { build.once('error', reject); build.once('exit', resolve); });
    if (code !== 0) throw new Error('build_failed');
    const reserve = net.createServer();
    await new Promise((resolve, reject) => { reserve.once('error', reject); reserve.listen(0, '127.0.0.1', resolve); });
    const port = reserve.address().port;
    await new Promise(resolve => reserve.close(resolve));
    server = spawn(process.execPath, [command, 'start', fixture, '-H', '127.0.0.1', '-p', String(port)], options);
    server.stdout.pipe(log, { end: false }); server.stderr.pipe(log, { end: false });
    let exited = false;
    const started = new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('startup_timeout')), 15000);
      server.once('error', () => { exited = true; clearTimeout(deadline); reject(new Error('startup_failed')); });
      server.once('exit', () => { exited = true; clearTimeout(deadline); reject(new Error('premature_exit')); });
      server.stdout.on('data', raw => { if (raw.toString().includes('Ready in')) { clearTimeout(deadline); resolve(); } });
    });
    await started;
    if (exited) throw new Error('premature_exit');
    const response = await fetch('http://127.0.0.1:' + port + '/api/check', { signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    if (exited || !response.ok || !validProbe(body, marker)) throw new Error('fixture_check_failed');
    console.log(JSON.stringify({ buildExit: 0, results: body.results, verifiedCurrentBuild: true }));
  } finally {
    server?.stdout.unpipe(log); server?.stderr.unpipe(log);
    server?.kill();
    log.end();
  }
}
module.exports = { validProbe };
if (require.main === module) main().catch(error => {
  console.error(error instanceof Error && ['build_failed', 'startup_timeout', 'startup_failed', 'premature_exit', 'fixture_check_failed'].includes(error.message)
    ? error.message : 'build_check_failed');
  process.exitCode = 1;
});
