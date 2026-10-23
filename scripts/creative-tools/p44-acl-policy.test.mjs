import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAclSnapshot } from './p44-acl-policy.mjs';

const SYSTEM = 'S-1-5-18';
const ADMIN = 'S-1-5-32-544';
const WORKER = 'S-1-5-21-111-222-333-1009'; // Invented, never queried.
const OTHER = 'S-1-5-21-444-555-666-1010';
const ids = ['programData', 'root', 'bin', 'queue', 'input', 'output', 'temp', 'receipts', 'approvals', 'nonces'];
const authorities = ['ActualWorkerTokenVerified', 'RootAclTrustVerified', 'NetworkEgressVerified',
  'RealHumanApprovalVerified', 'ArbitraryBrokerContainmentVerified', 'GeneralExecutableTrustVerified',
  'CreativeExecutionAuthorized', 'PublishAuthorized', 'ProductionReady'];
const gates = ['protectedAclAcceptanceVerified', 'independentOperatorVerified', 'realWorkerTokenVerified',
  'installationAuthorized', 'creativeExecutionAuthorized', 'workerActivated', 'publishAuthorized', 'productionReady'];
function ace(sid, rights) {
  return { sid, type: 'Allow', rights, inherited: false, inheritanceFlags: 3, propagationFlags: 0 };
}
function fixture() {
  return { schema: 'omnira.creative.p44.synthetic-acl.v1',
    worker: { sid: WORKER, status: 'disabled', nonAdmin: true },
    folders: ids.map(id => ({ id, state: 'observed', type: 'directory', reparse: false,
      ownerSid: ADMIN, inheritanceProtected: true,
      aces: [ace(SYSTEM, 2032127), ace(ADMIN, 2032127),
        ...(['programData', 'approvals', 'nonces'].includes(id) ? [] :
          [ace(WORKER, ['output', 'temp'].includes(id) ? 197055 : 131241)])] })) };
}
function checkGates(result) {
  for (const name of gates) assert.equal(result[name], false, name);
  assert.deepEqual(result.authorities, Object.fromEntries(authorities.map(name => [name, false])));
  const serialized = JSON.stringify(result);
  for (const secret of [WORKER, OTHER, SYSTEM, ADMIN, 'C:\\', 'ownerSid', 'aces']) {
    assert.equal(serialized.includes(secret), false, `redaction: ${secret}`);
  }
}
function run(value) {
  const before = structuredClone(value);
  const result = evaluateAclSnapshot(value);
  assert.deepEqual(value, before, 'input remains unchanged');
  checkGates(result);
  return result;
}
test('synthetic candidate never certifies ProgramData or grants authority', () => {
  const r = run(fixture());
  assert.equal(r.status, 'candidate-match');
  assert.deepEqual(r.folders.map(f => f.id), ids);
  assert.equal(r.folders[0].status, 'needs-manual-ancestor-check');
  assert.equal(r.needsManualAncestorCheck, true);
  assert.ok(r.folders.slice(1).every(f => f.status === 'candidate-match'));
});
const cases = [
  ['wrong root owner', s => { s.folders[1].ownerSid = OTHER; }],
  ['wrong ledger owner', s => { s.folders[8].ownerSid = WORKER; }],
  ['inheritance enabled', s => { s.folders[2].inheritanceProtected = false; }],
  ['inherited trusted ACE', s => { s.folders[8].aces[0].inherited = true; }],
  ['inheritance flags', s => { s.folders[9].aces[0].inheritanceFlags = 0; }],
  ['inherit only', s => { s.folders[1].aces[0].propagationFlags = 2; }],
  ['unknown ACE', s => { s.folders[1].aces.push(ace(OTHER, 131241)); }],
  ['extra worker ledger ACE', s => { s.folders[8].aces.push(ace(WORKER, 131241)); }],
  ['nonces worker ACE', s => { s.folders[9].aces.push(ace(WORKER, 197055)); }],
  ['enabled account', s => { s.worker.status = 'enabled'; }],
  ['admin worker', s => { s.worker.nonAdmin = false; }],
  ['malformed SID', s => { s.worker.sid = 'S-1-5-21-nope'; }],
  ['trusted SID impersonation', s => { s.worker.sid = SYSTEM; }],
  ['SID overflow', s => { s.worker.sid = 'S-1-5-21-4294967296-2-3-4'; }],
  ['worker write bin', s => { s.folders[2].aces[2].rights = 197055; }],
  ['worker lacks output modify', s => { s.folders[5].aces[2].rights = 131241; }],
  ['worker lacks temp modify', s => { s.folders[6].aces[2].rights = 131241; }],
  ['unexpected deny', s => { s.folders[2].aces[2].type = 'Deny'; }],
  ['duplicate ACE', s => { s.folders[1].aces.push({ ...s.folders[1].aces[0] }); }],
  ['missing trusted ACE', s => { s.folders[8].aces.pop(); }],
  ['unexpected path ID', s => { s.folders[0].id = 'C:\\unexpected'; }],
  ['extra path property', s => { s.folders[1].path = 'C:\\unexpected'; }],
  ['extra top property', s => { s.installationAuthorized = true; }],
  ['extra identity property', s => { s.worker.extra = true; }],
  ['extra ACE property', s => { s.folders[0].aces[0].extra = true; }],
  ['missing property', s => { delete s.folders[2].ownerSid; }],
  ['missing folder', s => { s.folders.pop(); }],
  ['duplicate folder', s => { s.folders[9] = structuredClone(s.folders[8]); }],
  ['too many folders', s => { s.folders.push(structuredClone(s.folders[0])); }],
  ['too many ACEs', s => { s.folders[1].aces = Array.from({ length: 33 }, () => ace(OTHER, 2)); }],
  ['non-directory', s => { s.folders[1].type = 'file'; }],
  ['reparse', s => { s.folders[0].reparse = true; }],
];
for (const [name, mutate] of cases) test(`rejects ${name}`, () => {
  const s = fixture(); mutate(s);
  assert.equal(run(s).status, 'rejected');
});
for (const right of [2, 4, 16, 256, 64, 65536, 262144, 524288]) {
  for (const id of ['programData', 'bin', 'approvals']) test(`rejects atomic unsafe right ${right} in ${id}`, () => {
    const s = fixture(); s.folders.find(f => f.id === id).aces.push(ace(OTHER, right));
    assert.equal(run(s).status, 'rejected');
  });
  test(`rejects worker atomic unsafe right ${right} in bin`, () => {
    const s = fixture(); s.folders[2].aces[2].rights = 131241 + right;
    assert.equal(run(s).status, 'rejected');
  });
}
for (const rights of [-1, 0, 0.5, NaN, Infinity, 4294967296, 2147483648,
  9007199254740992, '2032127', null, 2032127 + 128 * 1024 * 1024]) {
  test(`rejects invalid mask ${String(rights)}`, () => {
    const s = fixture(); s.folders[0].aces[0].rights = rights;
    assert.equal(run(s).status, 'rejected');
  });
}
test('accepts only documented synchronize additions to worker RX/Modify', () => {
  const s = fixture();
  for (const f of s.folders) for (const a of f.aces) if (a.sid === WORKER) a.rights += 1048576;
  assert.equal(run(s).status, 'candidate-match');
});
for (const mutate of [s => { s.worker.status = 'unknown'; }, s => { s.worker.nonAdmin = null; },
  s => { s.folders[2].state = 'unknown'; }, s => { s.folders[0].ownerSid = null; },
  s => { s.folders[1].aces = null; }, s => { s.folders[1].reparse = null; }]) {
  test('unknown evidence remains unverified, never missing or allowed', () => {
    const s = fixture(); mutate(s); const r = run(s);
    assert.equal(r.status, 'unverified');
    assert.equal(JSON.stringify(r).includes('missing'), false);
  });
}
test('rejects custom array prototypes without invoking inherited iterators', () => {
  for (const where of ['folders', 'aces']) {
    let invoked = 0;
    const s = fixture();
    const items = where === 'folders' ? s.folders : s.folders[2].aces;
    const inherited = Object.create(Array.prototype);
    Object.defineProperty(inherited, Symbol.iterator, {
      get() { invoked++; throw new Error('inherited iterator invoked'); },
    });
    Object.setPrototypeOf(items, inherited);
    const r = evaluateAclSnapshot(s);
    assert.equal(r.status, 'rejected', where); checkGates(r);
    assert.equal(invoked, 0, where);
  }
});
test('rejects array subclasses without invoking overridden iterator', () => {
  let invoked = 0;
  class HostileArray extends Array {
    *[Symbol.iterator]() { invoked++; throw new Error('subclass iterator invoked'); }
  }
  const s = fixture();
  Object.setPrototypeOf(s.folders, HostileArray.prototype);
  const r = evaluateAclSnapshot(s);
  assert.equal(r.status, 'rejected'); checkGates(r);
  assert.equal(invoked, 0);
});
test('forbidden atomic rights on an otherwise permitted worker RX ACE are independently rejected', () => {
  for (const right of [2, 4, 16, 64, 256, 65536, 262144, 524288]) {
    for (const folder of ['root', 'bin', 'queue', 'input', 'receipts']) {
      const s = fixture();
      const node = s.folders.find(f => f.id === folder);
      node.aces[2].rights = 131241 + right;
      assert.equal(run(s).status, 'rejected', folder + ':' + right);
    }
  }
});
test('rejects non-record input and accessors without invoking them', () => {
  for (const value of [null, [], 'snapshot', 42]) assert.equal(run(value).status, 'rejected');
  let calls = 0;
  const s = fixture(); Object.defineProperty(s, 'schema', { get() { calls++; return 'bad'; }, enumerable: true });
  const r = evaluateAclSnapshot(s); assert.equal(r.status, 'rejected'); assert.equal(calls, 0); checkGates(r);
});
