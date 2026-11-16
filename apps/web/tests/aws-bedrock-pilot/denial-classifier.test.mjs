import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyBedrockAccessDenial } from '../../app/api/bedrock-pilot-converse/diagnostics.ts'

const cases = [
  ['User is not authorized to perform: bedrock:InvokeModel because no identity-based policy allows the bedrock:InvokeModel action', 'missing_identity_allow'],
  ['An explicit deny in a service control policy prevents invocation', 'explicit_deny'],
  ['Model is not available for this account. Contact AWS Sales.', 'account_entitlement_restriction'],
  ['Not authorized to perform bedrock:InvokeModel on resource model', 'iam_model_authorization'],
  ['Model access is denied for this AWS account', 'model_access_restriction'],
  ['Model access is denied due to required AWS Marketplace actions: aws-marketplace:Subscribe', 'marketplace_entitlement'],
  ['Unexpected AWS raw error requestId=abc123 secretKey=SHOULD_NOT_LEAK', 'unknown_access_denial'],
]
for (const [message, expected] of cases) {
  test('safe classification: ' + expected, () => {
    const result = classifyBedrockAccessDenial(new Error(message))
    assert.equal(result, expected)
    assert.equal(result.includes('abc123'), false)
    assert.equal(result.includes('SHOULD_NOT_LEAK'), false)
    assert.match(result, /^[a-z_]+$/)
  })
}
test('null or non-Error is safe', () => {
  assert.equal(classifyBedrockAccessDenial(null), 'unknown_access_denial')
})
