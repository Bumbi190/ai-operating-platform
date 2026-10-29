import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseOwnerGithubBinding, resolveOwnerGithubReadScope,
  trustedReadOnlyInstallation, singleRepositoryReadGrant,
  matchesGithubRepository, validatesSingleRepositoryTokenReceipt,
} from '../atlas/project-connections/owner-github-catalog.ts'

const owner = '11111111-1111-4111-8111-111111111111'
const stranger = '99999999-9999-4999-8999-999999999999'
const first = '22222222-2222-4222-8222-222222222222'
const second = '33333333-3333-4333-8333-333333333333'
const third = '44444444-4444-4444-8444-444444444444'
const binding = (projectId = first, repositoryId = 1001) => ({
  ownerUserId: owner, projectId,
  projectSlug: projectId === first ? 'first-project' : 'next-project',
  installationId: 544, repositoryId, repositoryOwnerId: 321,
  repositoryOwner: 'ExampleOwner', repositoryName: 'example-repo',
  defaultBranch: 'main', state: 'approved',
})
const request = (projectId = first, bindings = [binding()]) => ({
  authenticatedOwnerUserId: owner, ownedProjectIds: [first, second, third],
  requestedProjectId: projectId, candidateBindings: bindings,
})
function scope() {
  const result = resolveOwnerGithubReadScope(request())
  assert.equal(result.ok, true)
  return result.scope
}
const installation = {
  id: 544, app_id: 55, account: { id: 321, login: 'ExampleOwner', type: 'User' },
  target_id: 321, target_type: 'User', repository_selection: 'all', suspended_at: null,
  events: [], permissions: { contents: 'read', metadata: 'read' },
}
const expected = { appId: 55, installationId: 544, ownerId: 321, ownerLogin: 'ExampleOwner' }
const repo = { id: 1001, owner: { id: 321 }, full_name: 'ExampleOwner/example-repo', default_branch: 'main' }
const token = (s, now = Date.now()) => ({
  repository_selection: 'selected', repositories: [{ id: s.repositoryId }],
  permissions: { contents: 'read', metadata: 'read' }, token: 'synthetic-not-credential',
  expires_at: new Date(now + 45 * 60_000).toISOString(),
})

describe('Atlas dynamic owner GitHub catalog: isolated, read-only and no provider calls', () => {
  it('accepts an owner-approved UUID project/repository binding', () => {
    assert.notEqual(parseOwnerGithubBinding(binding()), null)
  })
  it('resolves multiple existing/new projects without hardcoded slugs', () => {
    const two = { ...binding(second, 1002), repositoryName: 'second-repo' }
    const three = { ...binding(third, 1003), repositoryName: 'new-repo' }
    const catalog = [binding(), two, three]
    for (const [id, repoId] of [[first, 1001], [second, 1002], [third, 1003]]) {
      const found = resolveOwnerGithubReadScope(request(id, catalog))
      assert.equal(found.ok, true)
      assert.equal(found.scope.repositoryId, repoId)
      assert.equal(found.scope.projectId, id)
      assert.equal(found.scope.access, 'read')
    }
  })
  it('never infers project authorization from a wide GitHub installation', () => {
    assert.deepEqual(resolveOwnerGithubReadScope({ ...request(), ownedProjectIds: [] }),
      { ok: false, code: 'not_available' })
  })
  it('refuses different owner identity and foreign-owned project data', () => {
    assert.equal(resolveOwnerGithubReadScope({
      ...request(), authenticatedOwnerUserId: stranger,
    }).ok, false)
    assert.equal(resolveOwnerGithubReadScope(request(first, [
      { ...binding(), ownerUserId: stranger },
    ])).ok, false)
  })
  it('requires exact project UUID, never slug or arbitrary repo URL', () => {
    for (const id of ['first-project', 'ExampleOwner/example-repo', 'https://github.com/x/y', '']) {
      assert.equal(resolveOwnerGithubReadScope(request(id)).ok, false)
    }
  })
  it('fails closed on missing, duplicate or ambiguous registrations', () => {
    assert.equal(resolveOwnerGithubReadScope(request(first, [])).ok, false)
    assert.equal(resolveOwnerGithubReadScope(request(first, [binding(), binding()])).ok, false)
    assert.equal(resolveOwnerGithubReadScope(request(first, [binding(), binding(second)])).ok, false)
  })
  it('ignores unrelated owner rows but rejects malformed owned rows', () => {
    assert.equal(resolveOwnerGithubReadScope(request(first, [
      binding(), { ...binding(second, 1002), ownerUserId: stranger },
    ])).ok, true)
    assert.equal(resolveOwnerGithubReadScope(request(first, [
      binding(), { ...binding(second, 1002), defaultBranch: '../secret' },
    ])).ok, false)
  })
  it('refuses disabled, malformed or path-like binding fields', () => {
    for (const patch of [
      { state: 'disabled' }, { repositoryId: 0 }, { repositoryId: '1234' },
      { repositoryName: '../env' }, { repositoryOwner: 'https://fake' },
      { projectSlug: 'another/slug' }, { installationId: -1 },
      { defaultBranch: 'refs/heads/../main' }, { ownerUserId: undefined },
    ]) assert.equal(parseOwnerGithubBinding({ ...binding(), ...patch }), null)
  })
  it('returns immutable candidate scope, not a token or grant', () => {
    const valid = scope()
    assert.equal(Object.isFrozen(valid), true)
    assert.equal('token' in valid, false)
    assert.equal('privateKey' in valid, false)
  })
  it('verifies parent GitHub App installation permissions and identity', () => {
    assert.equal(trustedReadOnlyInstallation(installation, expected), true)
    assert.equal(trustedReadOnlyInstallation({
      ...installation, repository_selection: 'selected',
    }, expected), true)
    for (const changed of [
      { repository_selection: 'invalid' }, { app_id: 999 }, { id: 999 },
      { account: { ...installation.account, id: 999 } },
      { target_type: 'Organization' }, { suspended_at: '2026-01-01' },
      { events: ['push'] }, { permissions: { contents: 'write', metadata: 'read' } },
      { permissions: { contents: 'read', metadata: 'read', issues: 'read' } },
      { permissions: { metadata: 'read' } },
    ]) assert.equal(trustedReadOnlyInstallation({ ...installation, ...changed }, expected), false)
  })
  it('builds only a single-repo read grant, never an account-wide grant', () => {
    assert.deepEqual(singleRepositoryReadGrant(scope()), {
      repository_ids: [1001], permissions: { contents: 'read' },
    })
    assert.equal(singleRepositoryReadGrant({ ...scope(), access: 'write' }), null)
  })
  it('does not accept a model-built or tampered scope as authorized', () => {
    const valid = scope(), forged = { ...valid, repositoryId: 1002 }
    assert.equal(singleRepositoryReadGrant(forged), null)
    assert.equal(matchesGithubRepository(repo, forged), false)
    assert.equal(validatesSingleRepositoryTokenReceipt(token(valid), forged), false)
  })
  it('checks immutable GitHub numeric repo and owner identity', () => {
    const valid = scope()
    assert.equal(matchesGithubRepository(repo, valid), true)
    for (const changed of [
      { id: 1002 }, { owner: { id: 999 } },
      { full_name: 'Attacker/example-repo' }, { default_branch: 'dev' },
    ]) assert.equal(matchesGithubRepository({ ...repo, ...changed }, valid), false)
  })
  it('rejects broad, foreign-repo or write-capable minted tokens', () => {
    const valid = scope(), receipt = token(valid)
    assert.equal(validatesSingleRepositoryTokenReceipt(receipt, valid), true)
    for (const changed of [
      { repository_selection: 'all' }, { repositories: [{ id: 1001 }, { id: 1002 }] },
      { repositories: [{ id: 1002 }] }, { repositories: undefined },
      { permissions: { contents: 'write', metadata: 'read' } },
      { permissions: { contents: 'read', metadata: 'read', administration: 'read' } },
      { token: '' }, { expires_at: 'invalid' },
    ]) assert.equal(validatesSingleRepositoryTokenReceipt({ ...receipt, ...changed }, valid), false)
  })
  it('rejects expired or unrealistically long-lived tokens', () => {
    const valid = scope(), now = Date.parse('2026-10-29T13:00:00Z')
    assert.equal(validatesSingleRepositoryTokenReceipt(token(valid, now), valid, now), true)
    for (const expiresIn of [2 * 60_000, 3 * 60 * 60_000]) {
      assert.equal(validatesSingleRepositoryTokenReceipt({
        ...token(valid, now), expires_at: new Date(now + expiresIn).toISOString(),
      }, valid, now), false)
    }
  })
})
