import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const module = await import('./p43-readonly-inventory.mjs').catch(() => ({}));
test('inventory implementation is available', () => assert.equal(typeof module.inventory, 'function'));
const sha = b => createHash('sha256').update(b).digest('hex');
const standard = { status: 'standard', home: 'C:\\fixture', local: 'C:\\fixture\\Local', worker: 'disabled' };
function packet() {
  const nonce = '51fae6e28a794c12a727c558640cf239';
  const manifest = '1ddd5934530ba837d066edf060e4f5d725875b3db0170c902b096e54dec92504';
  return {
    'owner.txt': { status: 'observed', size: 32, sha256: sha(nonce), text: nonce },
    'manifest.sha256': { status: 'observed', size: 64, sha256: sha(manifest), text: manifest },
    'SyntheticLauncher.exe': { status: 'observed', size: 79360, sha256: 'bdcf4c6c765045f07277b8fd002b89931caa97955671721a279255d697ceedc6' },
    'review-manifest.json': { status: 'observed', size: 2352, sha256: manifest },
  };
}
function closed(r) {
  for (const key of ['installationAuthorized', 'workerActivated', 'creativeExecutionAuthorized', 'productionReady',
    'sourceIntegrityVerified', 'authenticated', 'p42NativeVerifierAccepted']) assert.equal(r[key], false);
  assert.equal(Object.keys(r.authorities).length, 9);
  assert.ok(Object.values(r.authorities).every(v => v === false));
  assert.equal(r.protectedRoot.status, 'UNKNOWN');
}
test('exact historical four-entry mocked packet is only observed hash consistency', () => {
  const p = packet();
  assert.equal(module.assessPacket(Object.keys(p), p).status, 'observed_match');
});
test('modified bytes and exact text mismatch refuse consistency', () => {
  const p = packet(); p['SyntheticLauncher.exe'].sha256 = '0'.repeat(64);
  assert.equal(module.assessPacket(Object.keys(p), p).status, 'mismatch');
  const q = packet(); q['owner.txt'].text += '\n';
  assert.equal(module.assessPacket(Object.keys(q), q).status, 'mismatch');
  for (const name of Object.keys(packet())) {
    const changed = packet(); changed[name].sha256 = 'f'.repeat(64);
    assert.equal(module.assessPacket(Object.keys(changed), changed).status, 'mismatch');
    const short = packet(); short[name].size--;
    assert.equal(module.assessPacket(Object.keys(short), short).status, 'mismatch');
  }
});
test('unexpected, missing and duplicate names are untrusted', () => {
  const p = packet();
  for (const names of [[...Object.keys(p), 'secret'], Object.keys(p).slice(1), [...Object.keys(p), 'owner.txt']]) {
    assert.equal(module.assessPacket(names, p).status, 'untrusted');
  }
});
test('missing/unreadable packet retains UNKNOWN error category', () => {
  for (const category of ['not_found', 'access_denied', 'io_error']) {
    const p = packet(); p['owner.txt'] = { status: 'UNKNOWN', category };
    assert.deepEqual(module.assessPacket(Object.keys(p), p), { status: 'UNKNOWN', category });
  }
});
test('elevated, forbidden and unverified sessions refuse before source I/O', async () => {
  for (const status of ['elevated', 'forbidden', 'UNKNOWN']) {
    let reads = 0;
    const r = await module.inventory([], { probe: async () => ({ status }), collect: async () => { reads++; } });
    assert.equal(reads, 0); assert.equal(r.status, 'refused'); closed(r);
  }
});
test('unknown CLI arguments refuse before identity probe or source I/O', async () => {
  const r = await module.inventory(['--help'], { probe: () => assert.fail(), collect: () => assert.fail() });
  assert.equal(r.category, 'invalid_arguments'); closed(r);
});
test('identity probe failure and invalid OS locations refuse before source I/O', async () => {
  for (const probe of [async () => { throw Error('private identity'); }, async () => ({ ...standard, home: '' })]) {
    const r = await module.inventory([], { probe, collect: () => assert.fail('source touched') });
    assert.equal(r.status, 'refused'); closed(r);
  }
});
test('enabled and unavailable worker queries never grant authority', async () => {
  for (const worker of ['enabled', 'UNKNOWN', 'disabled']) {
    const r = await module.inventory([], { probe: async () => ({ ...standard, worker }), collect: async () => ({ packet: { status: 'UNKNOWN', category: 'not_found' } }) });
    assert.equal(r.worker.status, worker); closed(r);
  }
});
test('protected root is uninspected; worker failure category is retained', async () => {
  const r = await module.inventory([], { probe: async () => ({ ...standard, worker: 'UNKNOWN', workerCategory: 'access_denied' }), collect: async () => ({}) });
  assert.equal(r.protectedRoot.category, 'not_inspected');
  assert.equal(r.worker.category, 'access_denied');
});
test('collection cannot overwrite closed authority fields', async () => {
  const r = await module.inventory([], { probe: async () => standard, collect: async () => ({ installationAuthorized: true, authorities: {} }) });
  closed(r);
});
test('changes during bounded reads invalidate otherwise matching bytes', async () => {
  const stat = { dev: 1n, ino: 2n, size: 1n, nlink: 1n, mtimeNs: 1n, ctimeNs: 1n,
    isFile: () => true, isSymbolicLink: () => false };
  let stats = 0, reads = 0;
  const api = { lstat: async () => stat, realpath: async p => p, open: async () => ({
    stat: async () => ({ ...stat, mtimeNs: ++stats === 1 ? 1n : 2n }),
    read: async buffer => { buffer[0] = 65; return { bytesRead: ++reads === 1 ? 1 : 0 }; }, close: async () => {},
  }) };
  assert.equal((await module.observeFile('fixture', 1, false, api)).category, 'changed_identity');
});
test('modified self-owned bytes yield a changed digest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'omnira-p43-test-'));
  const path = join(dir, 'bytes'); await writeFile(path, 'before');
  const before = await module.observeFile(path, 6);
  await writeFile(path, 'after!');
  const after = await module.observeFile(path, 6);
  assert.equal(before.status, 'observed');
  assert.equal(after.status, 'observed');
  assert.match(before.sha256, /^[0-9a-f]{64}$/);
  assert.match(after.sha256, /^[0-9a-f]{64}$/);
  assert.notEqual(before.sha256, after.sha256);
});
test('JSON output is bounded and rejects injected paths, errors and giant strings', () => {
  const s = module.encodeReport({ status: 'secret'.repeat(100000), path: 'C:\\private', authorities: { surprise: true } });
  assert.ok(Buffer.byteLength(s) <= module.MAX_JSON_BYTES);
  assert.ok(!s.includes('private')); closed(JSON.parse(s));
});
test('bounded same-handle reads hash only self-owned fixture bytes; no cleanup', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'omnira-p43-test-'));
  const path = join(dir, 'data'); await writeFile(path, 'fixture');
  const r = await module.observeFile(path, 7, true);
  assert.equal(r.sha256, sha('fixture')); assert.equal(r.text, 'fixture');
  assert.equal((await module.observeFile(path, 6)).category, 'size_bound');
  assert.equal((await module.observeFile(join(dir, 'absent'), 10)).category, 'not_found');
  await link(path, join(dir, 'second'));
  assert.equal((await module.observeFile(path, 10)).category, 'hardlink');
});
test('link/reparse/hardlink and changed identity mocks are rejected', async () => {
  const base = { dev: 1n, ino: 2n, size: 1n, nlink: 1n, mtimeNs: 1n, ctimeNs: 1n,
    isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
  for (const bad of [{ isSymbolicLink: () => true }, { reparse: true }, { nlink: 2n }]) {
    const api = { lstat: async () => ({ ...base, ...bad }) };
    assert.equal((await module.observeFile('fixture', 10, false, api)).status, 'untrusted');
  }
  let closedHandle = false;
  const api = { lstat: async () => base, realpath: async p => p,
    open: async () => ({ stat: async () => ({ ...base, ino: 3n }), close: async () => { closedHandle = true; } }) };
  assert.equal((await module.observeFile('fixture', 10, false, api)).category, 'changed_identity');
  assert.ok(closedHandle);
  const denied = { lstat: async () => { throw Object.assign(new Error('C:\\secret SID'), { code: 'EACCES' }); } };
  assert.deepEqual(await module.observeFile('fixture', 10, false, denied), { status: 'UNKNOWN', category: 'access_denied' });
});
test('CLI emits exactly one redacted report for unknown arguments', () => {
  const r = spawnSync(process.execPath, [new URL('./p43-readonly-inventory.mjs', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), '--unknown'], { encoding: 'utf8' });
  assert.equal(r.status, 2); assert.equal(r.stderr, ''); closed(JSON.parse(r.stdout));
});

const directoryStat = { dev: 1n, ino: 2n, size: 0n, nlink: 1n, mtimeNs: 1n, ctimeNs: 1n,
  isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false };

test('ancestors inspect Windows root and canonical parents before naming descendants', async () => {
  const calls = [];
  const api = {
    lstat: async path => { calls.push(['stat', path]); return directoryStat; },
    realpath: async path => { calls.push(['real', path]); return path; },
  };
  const chain = await module.ancestors('C:\\fixture\\Local', api);
  assert.deepEqual(chain.map(([path]) => path), ['C:\\', 'C:\\fixture', 'C:\\fixture\\Local']);
  const firstStat = calls.filter(([kind]) => kind === 'stat').map(([, path]) => path);
  assert.equal(firstStat[0], 'C:\\');
  for (const [parent, child] of [['C:\\', 'C:\\fixture'], ['C:\\fixture', 'C:\\fixture\\Local']]) {
    assert.ok(calls.findIndex(([kind, path]) => kind === 'real' && path === parent) <
      calls.findIndex(([kind, path]) => kind === 'stat' && path === child));
  }
});

test('ancestor junction and canonical redirect stop before any descendant lookup', async () => {
  for (const mode of ['symlink', 'reparse', 'redirect']) {
    const named = [];
    const api = {
      lstat: async path => {
        named.push(path);
        return { ...directoryStat, ...(path === 'C:\\fixture' ? {
          isSymbolicLink: () => mode === 'symlink', reparse: mode === 'reparse',
        } : {}) };
      },
      realpath: async path => path === 'C:\\fixture' && mode === 'redirect' ? 'C:\\redirect' : path,
    };
    await assert.rejects(module.ancestors('C:\\fixture\\Local\\Temp', api), e => e.untrusted === 'link_or_reparse');
    assert.ok(!named.some(path => path.startsWith('C:\\fixture\\')));
  }
});

test('ancestor depth is bounded before filesystem I/O', async () => {
  let calls = 0;
  await assert.rejects(module.ancestors('C:\\' + Array(33).fill('child').join('\\'), {
    lstat: async () => { calls++; return directoryStat; }, realpath: async path => path,
  }), e => e.untrusted === 'changed_identity');
  assert.equal(calls, 0);
});

// Only simulated Windows metadata and self-owned bytes. Never consult operator sources.
function collectionFixture(names, leaves = {}) {
  const opened = [], inspected = [], enumerations = [];
  const packetPath = 'C:\\fixture\\Local\\Temp\\omnira-launcher-review-51fae6e28a794c12a727c558640cf239';
  const api = {
    lstat: async path => {
      inspected.push(path);
      if (path.includes('\\Projects\\')) throw Object.assign(Error(), { code: 'ENOENT' });
      if (!path.startsWith(packetPath + '\\')) return directoryStat;
      const name = path.slice(packetPath.length + 1);
      assert.ok(Object.hasOwn(module.PACKET, name), 'unknown leaf must never be inspected');
      if (leaves[name] === 'missing') throw Object.assign(Error(), { code: 'ENOENT' });
      return { ...directoryStat, size: BigInt(Buffer.byteLength(leaves[name] || 'x')),
        isFile: () => true, isDirectory: () => false, isSymbolicLink: () => leaves[name] === 'link' };
    },
    realpath: async path => path,
    opendir: async path => {
      assert.equal(path, packetPath);
      const listing = typeof names === 'function' ? names(enumerations.length) : names;
      const reads = []; enumerations.push(reads);
      let index = 0;
      return { read: async () => { reads.push(index); return index < listing.length ? { name: listing[index++] } : null; }, close: async () => {} };
    },
    open: async path => {
      const name = path.slice(packetPath.length + 1);
      opened.push(name);
      assert.ok(Object.hasOwn(module.PACKET, name), 'unknown leaf must never be opened');
      const bytes = Buffer.from(leaves[name] || 'x');
      return { stat: async () => ({ ...directoryStat, size: BigInt(bytes.length) }),
        read: async (buffer, offset, length, position) => ({ bytesRead: bytes.copy(buffer, offset, position, position + length) }),
        close: async () => {} };
    },
  };
  return { api, opened, inspected, enumerations };
}

test('collection preserves fixed-leaf mismatch/link/missing observations with unexpected entries', async () => {
  const known = ['owner.txt', 'SyntheticLauncher.exe', 'review-manifest.json', 'manifest.sha256'];
  for (const names of [[...known, 'never-open-me'], known.slice(1), [...known, ...Array(20).fill('extra')]]) {
    const fixture = collectionFixture(names, { 'owner.txt': 'changed', 'SyntheticLauncher.exe': 'link', 'review-manifest.json': 'missing' });
    const r = await module.collect(standard, fixture.api);
    assert.equal(r.packet.status, 'untrusted'); assert.equal(r.packet.category, 'unexpected_entries');
    assert.ok(r.packet.entries, 'unexpected entries must not suppress fixed-leaf observations');
    assert.deepEqual(Object.keys(r.packet.entries), known);
    assert.equal(r.packet.entries['owner.txt'].status, 'mismatch');
    assert.equal(r.packet.entries['SyntheticLauncher.exe'].category, 'link_or_reparse');
    assert.equal(r.packet.entries['review-manifest.json'].category, 'not_found');
    assert.deepEqual(fixture.opened, ['owner.txt', 'manifest.sha256']);
    assert.equal(fixture.enumerations.length, 2);
    assert.ok(fixture.enumerations.every(reads => reads.length <= 5));
    const encoded = JSON.parse(module.encodeReport({ status: 'observed', ...r }));
    assert.equal(encoded.packet.category, 'unexpected_entries');
    assert.equal(encoded.packet.entries['owner.txt'].status, 'mismatch'); closed(encoded);
  }
});

test('collection retains known matching bytes when unknown entry appears or disappears between listings', async () => {
  const known = ['owner.txt', 'SyntheticLauncher.exe', 'review-manifest.json', 'manifest.sha256'];
  for (const extraFirst of [true, false]) {
    const fixture = collectionFixture(index => (index === 0) === extraFirst ? [...known, 'unknown'] : known, {
      'owner.txt': '51fae6e28a794c12a727c558640cf239',
      'manifest.sha256': '1ddd5934530ba837d066edf060e4f5d725875b3db0170c902b096e54dec92504',
    });
    const r = await module.collect(standard, fixture.api);
    assert.equal(r.packet.status, 'untrusted'); assert.equal(r.packet.category, 'unexpected_entries');
    assert.equal(r.packet.entries['owner.txt'].status, 'observed');
    assert.equal(r.packet.entries['owner.txt'].sha256, '6a7ba5eabce905f229edba44e988c534bf0909d21c33d63aec01750ebba18928');
    assert.equal(r.packet.entries['manifest.sha256'].status, 'observed');
    assert.equal(fixture.opened.length, 4);
  }
});

test('ancestor revalidation rejects a canonical parent substitution before the next child', async () => {
  const named = []; let rootChecks = 0;
  await assert.rejects(module.ancestors('C:\\fixture\\Local', {
    lstat: async path => { named.push(path); return directoryStat; },
    realpath: async path => path === 'C:\\' && ++rootChecks > 1 ? 'D:\\' : path,
  }), e => e.untrusted === 'changed_identity');
  assert.deepEqual(named, ['C:\\', 'C:\\']);
});

test('worker probe pins approved versioned Windows module after identity gates', async () => {
  let command;
  const result = await module.probe(async (executable, args) => {
    assert.equal(executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    command = args.at(-1);
    return { stdout: JSON.stringify({ ...standard, worker: 'UNKNOWN', workerCategory: 'query_unavailable' }), stderr: '' };
  });
  assert.equal(result.worker, 'UNKNOWN');
  assert.ok(command.includes("Import-Module 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules\\Microsoft.PowerShell.LocalAccounts\\1.0.0.0\\Microsoft.PowerShell.LocalAccounts.psd1' -ErrorAction Stop"));
  for (const guard of ['$id.IsSystem', 'IsInRole', '$labels.Count']) assert.ok(command.indexOf(guard) < command.indexOf('Import-Module'));
  assert.ok(command.includes("$worker = 'UNKNOWN'; $workerCategory = 'query_unavailable'"));
  assert.equal((command.match(/Import-Module/g) || []).length, 1);
  for (const status of ['elevated', 'forbidden', 'UNKNOWN']) {
    const r = await module.inventory([], { probe: async () => ({ ...standard, status, worker: 'disabled', installationAuthorized: true }), collect: () => assert.fail('identity bypass') });
    assert.equal(r.status, 'refused'); closed(r); closed(JSON.parse(module.encodeReport(r)));
  }
  const r = await module.inventory([], { probe: async () => result, collect: async () => ({}) });
  assert.equal(r.worker.status, 'UNKNOWN'); assert.equal(r.worker.category, 'query_unavailable'); closed(r);
  closed(JSON.parse(module.encodeReport({ ...r, worker: { status: 'disabled' }, installationAuthorized: true,
    workerActivated: true, creativeExecutionAuthorized: true, productionReady: true,
    authenticated: true, sourceIntegrityVerified: true, p42NativeVerifierAccepted: true,
    authorities: Object.fromEntries(Object.keys(r.authorities).map(name => [name, true])) })));
});
