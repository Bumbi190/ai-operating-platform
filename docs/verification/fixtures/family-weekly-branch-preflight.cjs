'use strict';
/**
 * Fail-closed readiness gate for a temporary Familje-Stunden cloud test branch.
 * Takes read-only Supabase branch and schema-probe snapshots as input.
 * Never reaches a network, fetches keys, creates resources, or writes to a DB.
 */
const fs = require('node:fs');

const REQUIRED_RELATIONS = Object.freeze([
  'public.projects',
  'public.runs',
  'public.social_weekly_preparations',
]);
const COMPLETE_STATUSES = new Set(['MIGRATIONS_DEPLOYED', 'FUNCTIONS_DEPLOYED']);

function evaluateFamilyWeeklyBranchReadiness(input) {
  const fail = reason => ({ ready: false, reason });
  if (!input || typeof input !== 'object') return fail('INVALID_INPUT');
  const { branchId, expectedBranchRef, parentProjectRef, branches, schema } = input;
  if (typeof branchId !== 'string' || !branchId ||
      typeof expectedBranchRef !== 'string' || !expectedBranchRef ||
      typeof parentProjectRef !== 'string' || !parentProjectRef ||
      expectedBranchRef === parentProjectRef) {
    return fail('UNSAFE_OR_MISSING_TARGET');
  }
  if (!Array.isArray(branches)) return fail('NO_BRANCH_LIST_EVIDENCE');
  const branch = branches.find(item => item?.id === branchId);
  if (!branch || branch.project_ref !== expectedBranchRef) {
    return fail('BRANCH_IDENTITY_UNVERIFIED');
  }
  if (branch.parent_project_ref !== parentProjectRef) {
    return fail('WRONG_PARENT_PROJECT');
  }
  if (branch.is_default !== false || branch.persistent !== false ||
      branch.with_data !== false) {
    return fail('NOT_DISPOSABLE_DATALESS_BRANCH');
  }
  if (!COMPLETE_STATUSES.has(branch.status)) {
    return fail('MIGRATIONS_NOT_VERIFIED_COMPLETE');
  }
  if (branch.preview_project_status !== 'ACTIVE_HEALTHY') {
    return fail('BRANCH_SERVICES_NOT_HEALTHY');
  }
  if (!schema || typeof schema !== 'object' ||
      !Number.isInteger(schema.public_tables) || schema.public_tables < REQUIRED_RELATIONS.length) {
    return fail('SCHEMA_NOT_INITIALIZED');
  }
  for (const relation of REQUIRED_RELATIONS) {
    if (schema.relations?.[relation] !== true) {
      return fail('MISSING_REQUIRED_RELATION:' + relation);
    }
    if (schema.rls?.[relation] !== true) {
      return fail('RLS_NOT_ENABLED:' + relation);
    }
  }
  return { ready: true, reason: 'BRANCH_READINESS_VERIFIED' };
}

if (require.main === module) {
  let result;
  try {
    if (process.argv.length !== 3) throw Error('REQUIRE_READONLY_SNAPSHOT_JSON');
    result = evaluateFamilyWeeklyBranchReadiness(
      JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
  } catch {
    result = { ready: false, reason: 'UNREADABLE_OR_MISSING_SNAPSHOT' };
  }
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!result.ready) process.exitCode = 1;
}

module.exports = { evaluateFamilyWeeklyBranchReadiness, REQUIRED_RELATIONS };
