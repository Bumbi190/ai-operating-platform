// Only probes initialize + tools/list. No media edit or tool invocation.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const lock = JSON.parse(readFileSync(new URL('./artcraft-lock.json', import.meta.url), 'utf8'));
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = process.env.OMNIRA_ARTCRAFT_ROOT ??
  join(homedir(), 'Projects', 'Omnira', 'External', 'ArtCraft');
const scratch = join(root, '_atlas_test_only');
for (const dir of ['input', 'output', 'film-data']) mkdirSync(join(scratch, dir), { recursive: true });
const servers = [
  ['photocraft', join(root, 'photocraft', 'portable', 'photocraft-0.10.0-windows-x64-portable', 'photocraft-cli.exe'),
    ['mcp', '--automation-read-root', join(scratch, 'input'), '--automation-write-root', join(scratch, 'output')]],
  ['filmcraft', join(root, 'filmcraft', 'portable', 'filmcraft-0.9.0-windows-x64-portable', 'filmcraft-cli.exe'),
    ['--data-dir', join(scratch, 'film-data'), 'mcp']],
];
function probe(name, bin, args) {
  return new Promise((resolve) => {
    if (!existsSync(bin)) return resolve({ name, ok: false, error: 'binary missing' });
    const fingerprint = createHash('sha256').update(readFileSync(bin)).digest('hex');
    if (fingerprint !== lock[name]?.sha256) return resolve({ name, ok: false, error: 'unexpected binary sha256' });
    const child = spawn(bin, args, { cwd: scratch, windowsHide: true, shell: false, stdio: ['pipe','pipe','pipe'] });
    let finished = false, buffer = '', stderr = '';
    const finish = (obj) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill();
      resolve({ name, ...obj });
    };
    const send = (x) => child.stdin.write(JSON.stringify(x) + '\n');
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), 18000);
    child.on('error', e => finish({ ok: false, error: String(e.message) }));
    child.on('exit', code => { if (!finished) finish({ ok: false, error: 'exit ' + code + ': ' + stderr.slice(-250) }); });
    child.stderr.on('data', c => { stderr = (stderr + c).slice(-500); });
    child.stdout.on('data', c => {
      buffer += c.toString('utf8');
      if (buffer.length > 1048576) return finish({ ok: false, error: 'oversized response' });
      while (buffer.includes('\n')) {
        const i = buffer.indexOf('\n');
        const raw = buffer.slice(0,i).trim(); buffer = buffer.slice(i+1);
        if (!raw.startsWith('{')) continue;
        let msg;
        try { msg = JSON.parse(raw); } catch { continue; }
        if (msg.id === 1 && msg.error) return finish({ ok: false, error: JSON.stringify(msg.error).slice(0,350) });
        if (msg.id === 1 && msg.result) {
          send({ jsonrpc:'2.0', method:'notifications/initialized' });
          send({ jsonrpc:'2.0', id:2, method:'tools/list', params:{} });
        }
        if (msg.id === 2) {
          if (msg.error) return finish({ ok:false, error:JSON.stringify(msg.error).slice(0,350) });
          const tools = msg.result?.tools || [];
          return finish({ ok:true, toolCount: tools.length, sample: tools.slice(0,15).map(t=>t.name) });
        }
      }
    });
    send({ jsonrpc:'2.0', id:1, method:'initialize', params:{
      protocolVersion:'2024-11-05', capabilities:{},
      clientInfo:{name:'atlas-creative-discovery',version:'0.1.0'},
    } });
  });
}
for (const server of servers) {
  const result = await probe(...server);
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
