'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateFamilyWeeklyBranchReadiness: evaluate, REQUIRED_RELATIONS } =
  require('./family-weekly-branch-preflight.cjs');

const branchId = 'c5d5d7b3-5dd1-4302-88df-7a69528ec95b';
const branchRef = 'qyhtteyycyieptjfjouy';
const parentRef = 'iboepohjwrhtgshrqaol';

function fixture() {
  return {
    branchId,
    expectedBranchRef: branchRef,
    parentProjectRef: parentRef,
    branches: [{
      id: branchId,
      project_ref: branchRef,
      parent_project_ref: parentRef,
      name: 'family-weekly-auth-e2e-20261029-temp',
      is_default: false,
      persistent: false,
      with_data: false,
      status: 'FUNCTIONS_DEPLOYED',
      preview_project_status: 'ACTIVE_HEALTHY',
    }],
    schema: {
      public_tables: 9,
      relations: Object.fromEntries(REQUIRED_RELATIONS.map(r => [r, true])),
      rls: Object.fromEntries(REQUIRED_RELATIONS.map(r => [r, true])),
    },
  };
}
function rejected(input, reason) {
  assert.deepEqual(evaluate(input), {ready: false, reason});
}

test('passes only a disposable, data-less, healthy branch with real RLS prerequisites', () => {
  assert.deepEqual(evaluate(fixture()),
    {ready: true, reason: 'BRANCH_READINESS_VERIFIED'});
});
test('fails if branch migrations failed: observed cloud failure', () => {
  const f = fixture();
  f.branches[0].status = 'MIGRATIONS_FAILED';
  f.schema.public_tables = 0;
  f.schema.relations = {};
  rejected(f, 'MIGRATIONS_NOT_VERIFIED_COMPLETE');
});
test('fails on zero relations even if branch mistakenly claims healthy', () => {
  const f = fixture();
  f.schema.public_tables = 0;
  rejected(f, 'SCHEMA_NOT_INITIALIZED');
});
test('never accepts production as the branch', () => {
  const f = fixture();
  f.expectedBranchRef = parentRef;
  rejected(f, 'UNSAFE_OR_MISSING_TARGET');
});
test('fails if the parent identity differs', () => {
  const f = fixture();
  f.branches[0].parent_project_ref = 'unrelated';
  rejected(f, 'WRONG_PARENT_PROJECT');
});
test('fails if branch id or ref is not exact', () => {
  const f = fixture();
  f.branches[0].project_ref = 'another';
  rejected(f, 'BRANCH_IDENTITY_UNVERIFIED');
});
test('fails closed when branch list is absent', () => {
  const f = fixture();
  delete f.branches;
  rejected(f, 'NO_BRANCH_LIST_EVIDENCE');
});
test('fails closed for persistent, default, or production-data branches', () => {
  for (const [key, val] of [['persistent', true], ['is_default', true], ['with_data', true]]) {
    const f = fixture();
    f.branches[0][key] = val;
    rejected(f, 'NOT_DISPOSABLE_DATALESS_BRANCH');
  }
});
test('fails while migrations are still applying', () => {
  const f = fixture();
  f.branches[0].status = 'CREATING_PROJECT';
  rejected(f, 'MIGRATIONS_NOT_VERIFIED_COMPLETE');
});
test('requires a healthy branch service', () => {
  const f = fixture();
  f.branches[0].preview_project_status = 'PAUSED';
  rejected(f, 'BRANCH_SERVICES_NOT_HEALTHY');
});
test('checks each canonical relationship by exact schema-qualified name', () => {
  for (const relation of REQUIRED_RELATIONS) {
    const f = fixture();
    f.schema.relations[relation] = false;
    rejected(f, 'MISSING_REQUIRED_RELATION:' + relation);
  }
});
test('requires RLS on every exposed required table', () => {
  for (const relation of REQUIRED_RELATIONS) {
    const f = fixture();
    f.schema.rls[relation] = false;
    rejected(f, 'RLS_NOT_ENABLED:' + relation);
  }
});
test('missing or malformed schema evidence never grants readiness', () => {
  const f = fixture();
  delete f.schema;
  rejected(f, 'SCHEMA_NOT_INITIALIZED');
  rejected(null, 'INVALID_INPUT');
});
