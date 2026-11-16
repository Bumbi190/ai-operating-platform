import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideManualBedrockAuthorization } from '../../lib/ai/bedrock-pilot/operator-decision.ts'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const projectId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const user='user-1'
const operator={ok:true,userId:user}
const projectAccess={ok:true,userId:user,allowedProjectIds:[projectId]}

test('same verified operator and same owned project allowed for minting',()=>{
  assert.deepEqual(decideManualBedrockAuthorization(projectId,operator,projectAccess),{allowed:true})
})
test('unverified operator refused even if user owns project',()=>{
  assert.equal(decideManualBedrockAuthorization(projectId,{ok:false,reason:'not_platform_operator'},projectAccess).reason,'operator_required')
})
test('unauthenticated operator refused',()=>{
  assert.equal(decideManualBedrockAuthorization(projectId,{ok:false,reason:'unauthenticated'},projectAccess).allowed,false)
})
test('project access unavailable refused',()=>{
  assert.equal(decideManualBedrockAuthorization(projectId,operator,{ok:false}).reason,'project_access_unavailable')
})
test('different session identities refused (TOCTOU/race)',()=>{
  assert.equal(decideManualBedrockAuthorization(projectId,operator,{...projectAccess,userId:'user-2'}).reason,'identity_mismatch')
})
test('project ownership is necessary beyond operator status',()=>{
  assert.equal(decideManualBedrockAuthorization(projectId,operator,{...projectAccess,allowedProjectIds:[]}).reason,'project_not_owned')
})
test('invalid ID and unrelated projects rejected',()=>{
  assert.equal(decideManualBedrockAuthorization('anything',operator,projectAccess).reason,'invalid_project')
  assert.equal(decideManualBedrockAuthorization('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeef',operator,projectAccess).reason,'project_not_owned')
})
test('server-boundary source is backed by real session and private WeakMap, not user body',()=>{
  const here=dirname(fileURLToPath(import.meta.url))
  const file=readFileSync(resolve(here,'../../lib/ai/bedrock-pilot/operator-grant.ts'),'utf8')
  assert.match(file,/resolvePlatformOperator\(/)
  assert.match(file,/resolveProjectAccess\(/)
  assert.match(file,/decideManualBedrockAuthorization\(/)
  assert.match(file,/const minted = new WeakMap<object, string>\(\)/)
  assert.match(file,/minted\.set\(grant, projectId\)/)
  assert.match(file,/minted\.get\(value\) === projectId/)
  assert.ok(!file.includes('request.json()'))
  const adapter=readFileSync(resolve(here,'../../lib/ai/bedrock-pilot/governed-client.ts'),'utf8')
  const proof=adapter.indexOf('assertManualBedrockOperatorGrant(ctx.operatorGrant, request.projectId)')
  const sts=adapter.indexOf('obtainPreviewCredentials(')
  const budget=adapter.indexOf('return withGovernedSpend(')
  assert.ok(proof>0 && sts>proof && budget>sts)
  assert.equal(adapter.includes('operatorApprovalVerified'),false)
})
