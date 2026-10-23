// Fixed passive observations only. This is deliberately NOT the P42 native verifier.
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { win32, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = value => createHash('sha256').update(value).digest('hex');
const NONCE = '51fae6e28a794c12a727c558640cf239';
const MANIFEST = '1ddd5934530ba837d066edf060e4f5d725875b3db0170c902b096e54dec92504';
export const PACKET = Object.freeze(Object.fromEntries(Object.entries({
  'owner.txt': { size: 32, sha256: sha(NONCE), text: NONCE },
  'SyntheticLauncher.exe': { size: 79360, sha256: 'bdcf4c6c765045f07277b8fd002b89931caa97955671721a279255d697ceedc6' },
  'review-manifest.json': { size: 2352, sha256: MANIFEST },
  'manifest.sha256': { size: 64, sha256: sha(MANIFEST), text: MANIFEST },
}).map(([key, value]) => [key, Object.freeze(value)])));
const PHOTO = Object.freeze({
  cli: { relative: 'photocraft/portable/photocraft-0.10.0-windows-x64-portable/photocraft-cli.exe', sha256: '109a13782578b03f56d7f3180b3729d9555ece5e936baeb5672ec2dcb28fbf51' },
  zip: { relative: 'photocraft/photocraft-0.10.0-windows-x64-portable.zip', sha256: '66b7e47d66589eb6947c8d7417c80fa44621cf83823ffdc47f42024eb03bd5d2' },
});
const AUTHORITY_NAMES = ['ActualWorkerTokenVerified', 'RootAclTrustVerified', 'NetworkEgressVerified',
  'RealHumanApprovalVerified', 'ArbitraryBrokerContainmentVerified', 'GeneralExecutableTrustVerified',
  'CreativeExecutionAuthorized', 'PublishAuthorized', 'ProductionReady'];
export const MAX_JSON_BYTES = 8192;
const statuses = ['UNKNOWN', 'untrusted', 'mismatch', 'observed', 'observed_match'];
const categories = ['not_found', 'access_denied', 'io_error', 'size_bound', 'hardlink', 'link_or_reparse',
  'changed_identity', 'unexpected_entries', 'identity_unavailable', 'identity_refused', 'invalid_arguments', 'internal_error',
  'not_inspected', 'query_unavailable'];
const unknown = category => ({ status: 'UNKNOWN', category });
function errorCategory(e) {
  return e?.code === 'ENOENT' ? 'not_found' : ['EACCES', 'EPERM'].includes(e?.code) ? 'access_denied' : 'io_error';
}
function base() {
  return { schema: 'omnira.creative.p43-readonly-inventory.v1', status: 'refused',
    installationAuthorized: false, workerActivated: false, creativeExecutionAuthorized: false, productionReady: false,
    authorities: Object.fromEntries(AUTHORITY_NAMES.map(name => [name, false])),
    protectedRoot: unknown('not_inspected'), worker: { status: 'UNKNOWN', category: 'not_inspected' },
    packet: unknown('identity_unavailable'), photocraft: { cli: unknown('identity_unavailable'), zip: unknown('identity_unavailable') },
    sourceIntegrityVerified: false, authenticated: false, p42NativeVerifierAccepted: false,
    gaps: ['protected_root_not_inspected', 'native_reparse_and_sharing_guarantees_unavailable',
      'mutable_sources_not_authenticated', 'installed_trust_unverified', 'worker_token_unverified',
      'ledger_unverified', 'network_unverified', 'human_approval_unverified'] };
}
// Construct output from an allowlist, never serialize exceptions, names, paths or tool output.
function observation(value) {
  const out = { status: statuses.includes(value?.status) ? value.status : 'UNKNOWN' };
  if (categories.includes(value?.category)) out.category = value.category;
  if (Number.isSafeInteger(value?.size) && value.size >= 0 && value.size <= 268435456) out.size = value.size;
  if (typeof value?.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256)) out.sha256 = value.sha256;
  return out;
}
export function encodeReport(input) {
  const r = base();
  if (input?.status === 'observed') r.status = 'observed';
  if (categories.includes(input?.category)) r.category = input.category;
  r.worker.status = ['disabled', 'enabled'].includes(input?.worker?.status) ? input.worker.status : 'UNKNOWN';
  if (categories.includes(input?.worker?.category)) r.worker.category = input.worker.category;
  else if (r.worker.status !== 'UNKNOWN') delete r.worker.category;
  r.packet = observation(input?.packet);
  if (input?.packet?.entries) r.packet.entries = Object.fromEntries(Object.keys(PACKET).map(name => [name, observation(input.packet.entries[name])]));
  r.photocraft = Object.fromEntries(['cli', 'zip'].map(key => [key, observation(input?.photocraft?.[key])]));
  const result = JSON.stringify(r) + '\n';
  return Buffer.byteLength(result) <= MAX_JSON_BYTES ? result : JSON.stringify(base()) + '\n';
}

// No PATH lookup, environment-selected executable, profile, shell or downloaded code.
// Alternate Windows locations are unsupported: a failed fixed tool => refusal.
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const PROBE = String.raw`
$ErrorActionPreference = 'Stop'
try {
 $id = [Security.Principal.WindowsIdentity]::GetCurrent()
 $principal = [Security.Principal.WindowsPrincipal]::new($id)
 if ($id.IsSystem -or $id.User.Value -in @('S-1-5-18','S-1-5-19','S-1-5-20') -or $id.Name -match '\\omnira-media-worker$' -or $id.ImpersonationLevel -ne 'None') { '{"status":"forbidden"}'; exit }
 if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { '{"status":"elevated"}'; exit }
 $system = [Environment]::SystemDirectory
 $groups = & ($system + '\whoami.exe') /groups /fo csv /nh 2>$null
 if ($LASTEXITCODE -ne 0) { throw 'identity' }
 $labels = @([regex]::Matches(($groups -join "\n"), 'S-1-16-\d+') | ForEach-Object { $_.Value })
 if ($labels.Count -ne 1 -or $labels[0] -ne 'S-1-16-8192') { '{"status":"forbidden"}'; exit }
 $worker = 'UNKNOWN'; $workerCategory = 'query_unavailable'
 try {
  Import-Module 'C:\Windows\System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.LocalAccounts\1.0.0.0\Microsoft.PowerShell.LocalAccounts.psd1' -ErrorAction Stop
  $account = Microsoft.PowerShell.LocalAccounts\Get-LocalUser -Name 'omnira-media-worker' -ErrorAction Stop
  if ($account.Enabled -eq $false) { $worker = 'disabled' } elseif ($account.Enabled -eq $true) { $worker = 'enabled' }
 } catch { if ($_.Exception -is [UnauthorizedAccessException] -or $_.Exception.NativeErrorCode -eq 5) { $workerCategory = 'access_denied' } }
 @{status='standard'; home=[Environment]::GetFolderPath('UserProfile'); local=[Environment]::GetFolderPath('LocalApplicationData'); worker=$worker; workerCategory=$workerCategory} | ConvertTo-Json -Compress
} catch { '{"status":"UNKNOWN"}' }
`;
export async function probe(run = promisify(execFile)) {
  if (process.platform !== 'win32') return { status: 'UNKNOWN' };
  try {
    const { stdout, stderr } = await run(POWERSHELL,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PROBE],
      { timeout: 10000, maxBuffer: 16384, windowsHide: true, encoding: 'utf8',
        env: { ...process.env, PATH: 'C:\\Windows\\System32',
          PSModulePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules' } });
    if (stderr.trim()) return { status: 'UNKNOWN' };
    return JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
  } catch { return { status: 'UNKNOWN' }; }
}
function same(a, b) {
  return ['dev', 'ino', 'size', 'nlink', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);
}
function unsafe(s, directory = false) {
  if (s.isSymbolicLink() || s.reparse === true) return 'link_or_reparse';
  if (!(directory ? s.isDirectory() : s.isFile())) return 'link_or_reparse';
  if (!directory && s.nlink !== 1n) return 'hardlink';
  if (!s.ino || !s.dev) return 'changed_identity';
}
function refuse(category) { return { status: 'untrusted', category }; }
export async function observeFile(path, bound, text = false, api = fs) {
  let handle;
  try {
    const before = await api.lstat(path, { bigint: true });
    const bad = unsafe(before); if (bad) return refuse(bad);
    if (before.size < 0n || before.size > BigInt(bound)) return unknown('size_bound');
    if (resolve(await api.realpath(path)).toLowerCase() !== resolve(path).toLowerCase()) return refuse('link_or_reparse');
    handle = await api.open(path, 'r');
    if (!same(before, await handle.stat({ bigint: true }))) return refuse('changed_identity');
    const hash = createHash('sha256'), chunks = [];
    const buffer = Buffer.alloc(65536); let total = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, bound - total + 1), total);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > bound) return unknown('size_bound');
      hash.update(buffer.subarray(0, bytesRead));
      if (text) chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    if (BigInt(total) !== before.size || !same(before, await handle.stat({ bigint: true })) ||
        !same(before, await api.lstat(path, { bigint: true }))) return refuse('changed_identity');
    return { status: 'observed', size: total, sha256: hash.digest('hex'), ...(text ? { text: Buffer.concat(chunks).toString('utf8') } : {}) };
  } catch (e) { return unknown(errorCategory(e)); }
  finally { if (handle) await handle.close().catch(() => {}); }
}
function unexpectedNames(names) {
  return names.length !== 4 || new Set(names).size !== 4 || names.some(name => !Object.hasOwn(PACKET, name));
}
function assessEntry(entry, pin) {
  if (entry?.status !== 'observed') return entry || unknown('io_error');
  if (entry.size !== pin.size || entry.sha256 !== pin.sha256 || (pin.text && entry.text !== pin.text)) return { ...entry, status: 'mismatch' };
  return entry;
}
export function assessPacket(names, entries) {
  if (unexpectedNames(names)) return refuse('unexpected_entries');
  for (const [name, pin] of Object.entries(PACKET)) {
    const entry = assessEntry(entries[name], pin);
    if (entry.status !== 'observed') return observation(entry);
  }
  return { status: 'observed_match' };
}
// Plan names lexically with Windows semantics before I/O; inspect root FIRST.
// Recheck canonical ancestors before descendants. These checks do not pin directories
// or exclude hostile concurrent substitution between any two Node operations.
export async function ancestors(path, api = fs) {
  const paths = []; let current = win32.resolve(path);
  for (let i = 0; i < 32; i++) {
    paths.unshift(current);
    if (current === win32.parse(current).root) break;
    current = win32.dirname(current);
  }
  if (paths[0] !== win32.parse(paths[0]).root) throw Object.assign(new Error(), { untrusted: 'changed_identity' });
  const chain = [];
  for (const current of paths) {
    if (!await unchanged(chain, api)) throw Object.assign(new Error(), { untrusted: 'changed_identity' });
    const stat = await api.lstat(current, { bigint: true });
    const bad = unsafe(stat, true); if (bad) throw Object.assign(new Error(), { untrusted: bad });
    if (win32.resolve(await api.realpath(current)).toLowerCase() !== current.toLowerCase()) throw Object.assign(new Error(), { untrusted: 'link_or_reparse' });
    chain.push([current, stat]);
  }
  return chain;
}
async function unchanged(chain, api = fs) {
  for (const [path, stat] of chain) {
    const now = await api.lstat(path, { bigint: true });
    if (unsafe(now, true) || !same(stat, now) ||
        win32.resolve(await api.realpath(path)).toLowerCase() !== path.toLowerCase()) return false;
  }
  return true;
}
async function namesAt(path, api = fs) {
  const names = [], dir = await api.opendir(path);
  try {
    for (let i = 0; i < 5; i++) { const entry = await dir.read(); if (!entry) break; names.push(entry.name); }
  } finally { await dir.close(); }
  return names;
}
export async function collect(identity, api = fs) {
  const packetPath = win32.join(identity.local, 'Temp', `omnira-launcher-review-${NONCE}`);
  let packet, unexpected = false;
  const entries = {};
  try {
    const chain = await ancestors(packetPath, api), names = await namesAt(packetPath, api);
    unexpected = unexpectedNames(names);
    for (const [name, pin] of Object.entries(PACKET)) {
      if (!await unchanged(chain, api)) throw Object.assign(new Error(), { untrusted: 'changed_identity' });
      entries[name] = assessEntry(await observeFile(win32.join(packetPath, name), pin.size, !!pin.text, api), pin);
    }
    if (!await unchanged(chain, api)) throw Object.assign(new Error(), { untrusted: 'changed_identity' });
    const after = await namesAt(packetPath, api);
    unexpected ||= unexpectedNames(after);
    packet = { ...(unexpected ? refuse('unexpected_entries') :
      JSON.stringify(names.sort()) !== JSON.stringify(after.sort()) ? refuse('changed_identity') : assessPacket(names, entries)), entries };
  } catch (e) {
    packet = { ...(unexpected ? refuse('unexpected_entries') : e.untrusted ? refuse(e.untrusted) : unknown(errorCategory(e))),
      ...(Object.keys(entries).length ? { entries } : {}) };
  }
  const photocraft = {};
  for (const [key, pin] of Object.entries(PHOTO)) {
    const path = win32.join(identity.home, 'Projects', 'Omnira', 'External', 'ArtCraft', pin.relative);
    try {
      const chain = await ancestors(win32.dirname(path), api);
      let result = await observeFile(path, 268435456, false, api);
      if (!await unchanged(chain, api)) result = refuse('changed_identity');
      if (result.status === 'observed') result.status = result.sha256 === pin.sha256 ? 'observed_match' : 'mismatch';
      photocraft[key] = result;
    } catch (e) { photocraft[key] = e.untrusted ? refuse(e.untrusted) : unknown(errorCategory(e)); }
  }
  return { packet, photocraft };
}
export async function inventory(args = [], dependencies = {}) {
  const r = base();
  if (args.length) return { ...r, category: 'invalid_arguments' };
  let identity;
  try { identity = await (dependencies.probe || probe)(); } catch { return { ...r, category: 'identity_unavailable' }; }
  if (identity?.status !== 'standard') return { ...r, category: identity?.status === 'UNKNOWN' ? 'identity_unavailable' : 'identity_refused' };
  if (![identity.home, identity.local].every(p => typeof p === 'string' && /^[A-Za-z]:\\/.test(p) && !p.includes('\0') && p.length < 512)) return { ...r, category: 'identity_unavailable' };
  try {
    const observations = await (dependencies.collect || collect)(identity);
    return { ...r, packet: observations.packet, photocraft: observations.photocraft, status: 'observed',
      worker: { status: ['disabled', 'enabled'].includes(identity.worker) ? identity.worker : 'UNKNOWN',
        ...(identity.worker === 'UNKNOWN' ? { category: categories.includes(identity.workerCategory) ? identity.workerCategory : 'query_unavailable' } : {}) } };
  } catch { return { ...r, category: 'internal_error' }; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await inventory(process.argv.slice(2)).catch(() => ({ ...base(), category: 'internal_error' }));
  process.stdout.write(encodeReport(report));
  process.exitCode = report.status === 'refused' ? 2 : 0;
}
