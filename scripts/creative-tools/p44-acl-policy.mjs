// Pure offline policy comparison. Accept only inert sanitized JSON-shaped data.
// No collectors, imports, CLI, logging, ambient identity or authority decisions.
const IDS = ['programData', 'root', 'bin', 'queue', 'input', 'output', 'temp', 'receipts', 'approvals', 'nonces'];
const TRUSTED = ['S-1-5-18', 'S-1-5-32-544'];
const AUTHORITIES = ['ActualWorkerTokenVerified', 'RootAclTrustVerified', 'NetworkEgressVerified',
  'RealHumanApprovalVerified', 'ArbitraryBrokerContainmentVerified', 'GeneralExecutableTrustVerified',
  'CreativeExecutionAuthorized', 'PublishAuthorized', 'ProductionReady'];
// .NET FileSystemRights values, NOT POSIX modes or made-up bit positions.
const FULL = 2032127n;
const RX = 131241n;
const MODIFY = 197055n;
const SYNCHRONIZE = 1048576n;
// FULL includes every recognized individual FileSystemRights bit. BigInt avoids
// JS signed 32-bit coercion. Reject negative, fractional, generic/unknown masks.
function mask(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 4294967295) return null;
  const bits = BigInt(value);
  return (bits & ~FULL) === 0n ? bits : null;
}
function record(value, keys) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && own.every(k => keys.includes(k) &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, k), 'value'));
}
function list(value, max) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === value.length + 1 && keys.every(k => k === 'length' ||
    (/^(0|[1-9][0-9]*)$/.test(String(k)) && Number(k) < value.length &&
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, k), 'value')));
}
function sid(value) {
  if (typeof value !== 'string' || value.length > 184 || !/^S-1-\d{1,15}(?:-\d{1,10}){1,15}$/.test(value)) return false;
  const parts = value.split('-').slice(2);
  return BigInt(parts[0]) <= 281474976710655n && parts.slice(1).every(p =>
    /^(0|[1-9][0-9]*)$/.test(p) && BigInt(p) <= 4294967295n);
}
function workerSid(value) {
  return sid(value) && /^S-1-5-21-(?:[1-9][0-9]*-){3}[1-9][0-9]*$/.test(value);
}
function result() {
  return { schema: 'omnira.creative.p44.offline-result.v1', status: 'unverified',
    needsManualAncestorCheck: true,
    folders: IDS.map(id => ({ id, status: 'unverified' })),
    protectedAclAcceptanceVerified: false, independentOperatorVerified: false, realWorkerTokenVerified: false,
    installationAuthorized: false, creativeExecutionAuthorized: false, workerActivated: false,
    publishAuthorized: false, productionReady: false,
    authorities: Object.fromEntries(AUTHORITIES.map(name => [name, false])) };
}
function folderStatus(f, worker) {
  if (!record(f, ['id', 'state', 'type', 'reparse', 'ownerSid', 'inheritanceProtected', 'aces']) ||
      !IDS.includes(f.id) || !['observed', 'unknown'].includes(f.state)) return 'rejected';
  if (![null, 'directory', 'file'].includes(f.type) || ![null, true, false].includes(f.reparse) ||
      ![null, true, false].includes(f.inheritanceProtected) ||
      (f.ownerSid !== null && !sid(f.ownerSid)) || (f.aces !== null && !list(f.aces, 32))) return 'rejected';
  if (f.type === 'file' || f.reparse === true ||
      (f.ownerSid !== null && !TRUSTED.includes(f.ownerSid)) ||
      (f.id !== 'programData' && f.inheritanceProtected === false)) return 'rejected';
  let unknown = f.state === 'unknown' || f.type === null || f.reparse === null ||
    f.ownerSid === null || f.inheritanceProtected === null || f.aces === null;
  const seen = new Set();
  const rules = f.aces === null ? [] : f.aces;
  for (let index = 0; index < rules.length; index++) {
    const a = rules[index];
    if (!record(a, ['sid', 'type', 'rights', 'inherited', 'inheritanceFlags', 'propagationFlags']) ||
        !sid(a.sid) || a.type !== 'Allow' || typeof a.inherited !== 'boolean' ||
        !Number.isInteger(a.inheritanceFlags) || a.inheritanceFlags < 0 || a.inheritanceFlags > 3 ||
        !Number.isInteger(a.propagationFlags) || a.propagationFlags < 0 || a.propagationFlags > 3 ||
        mask(a.rights) === null || seen.has(a.sid)) return 'rejected';
    seen.add(a.sid); // At most one exact ACE per permitted principal.
    if (a.inherited || a.inheritanceFlags !== 3 || a.propagationFlags !== 0) return 'rejected';
    const bits = mask(a.rights);
    if (TRUSTED.includes(a.sid)) {
      if (bits !== FULL) return 'rejected';
    } else if (a.sid === worker && !['programData', 'approvals', 'nonces'].includes(f.id)) {
      const expected = ['output', 'temp'].includes(f.id) ? MODIFY : RX;
      if (bits !== expected && bits !== (expected | SYNCHRONIZE)) return 'rejected';
    } else return 'rejected';
  }
  if (f.aces !== null) {
    const expected = ['programData', 'approvals', 'nonces'].includes(f.id) ? TRUSTED : [...TRUSTED, worker];
    if (expected.some(s => !seen.has(s)) || seen.size !== expected.length) return 'rejected';
  }
  if (unknown) return 'unverified';
  return f.id === 'programData' ? 'needs-manual-ancestor-check' : 'candidate-match';
}
/** No real ACL proof. Input must be inert data, never Proxy objects or live collectors.
 * Unknown fields are rejected; explicit unknown observations remain unverified.
 * ProgramData's deliberately restrictive fixture is never an ancestor acceptance.
 */
export function evaluateAclSnapshot(snapshot) {
  const out = result();
  try {
    if (!record(snapshot, ['schema', 'worker', 'folders']) ||
        snapshot.schema !== 'omnira.creative.p44.synthetic-acl.v1' ||
        !record(snapshot.worker, ['sid', 'status', 'nonAdmin']) ||
        !workerSid(snapshot.worker.sid) ||
        !['disabled', 'enabled', 'unknown'].includes(snapshot.worker.status) ||
        ![true, false, null].includes(snapshot.worker.nonAdmin) ||
        !list(snapshot.folders, 10) || snapshot.folders.length !== 10) {
      out.status = 'rejected'; return out;
    }
    const w = snapshot.worker;
    const byId = new Map();
    for (let index = 0; index < snapshot.folders.length; index++) {
      const f = snapshot.folders[index];
      if (!record(f, ['id', 'state', 'type', 'reparse', 'ownerSid', 'inheritanceProtected', 'aces']) ||
          !IDS.includes(f.id) || byId.has(f.id)) { out.status = 'rejected'; return out; }
      byId.set(f.id, f);
    }
    out.folders = IDS.map(id => ({ id, status: folderStatus(byId.get(id), w.sid) }));
    out.status = w.status === 'enabled' || w.nonAdmin === false || out.folders.some(f => f.status === 'rejected')
      ? 'rejected'
      : w.status === 'unknown' || w.nonAdmin === null || out.folders.some(f => f.status === 'unverified')
        ? 'unverified' : 'candidate-match';
  } catch {
    // Never leak caller data or exception text; malformed input grants nothing.
    out.status = 'rejected';
  }
  return out;
}
