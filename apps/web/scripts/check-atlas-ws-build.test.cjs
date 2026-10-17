const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validProbe } = require('./check-atlas-ws-build.cjs');
const marker = 'current-build';
const complete = () => ({ marker, results: [4, 31, 32, 6404].map(length => ({ length, received: true, error: null })) });
test('accepts exactly the current build and all four complete decode checks', () => assert.equal(validProbe(complete(), marker), true));
test('rejects an otherwise successful stale server response', () => assert.equal(validProbe({ ...complete(), marker: 'old-build' }, marker), false));
test('rejects empty or missing results', () => {
  assert.equal(validProbe({ marker, results: [] }, marker), false);
  assert.equal(validProbe({ marker }, marker), false);
});
test('rejects missing, duplicate, failed or malformed decode results', () => {
  for (const change of [
    body => body.results.pop(),
    body => { body.results[3].length = 32; },
    body => { body.results[3].received = false; },
    body => { body.results[3].error = 'unmask_not_function'; },
    body => { body.results[3].received = 'true'; },
  ]) { const body = complete(); change(body); assert.equal(validProbe(body, marker), false); }
});
