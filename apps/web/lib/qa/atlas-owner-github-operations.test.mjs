import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  NOVA_MAY_DELETE_GITHUB_REPOSITORIES,
  classifyNovaGithubOperation as classify,
} from '../atlas/project-connections/nova-github-operations.ts'

describe('Atlas/Nova owner mandate: no GitHub repository deletion by agents', () => {
  it('sets an explicit immutable no-deletion invariant', () => {
    assert.equal(NOVA_MAY_DELETE_GITHUB_REPOSITORIES, false)
    for (const op of ['delete_repository','permanently_delete_repository','remove_github_repository']) {
      const result = classify(op)
      assert.equal(result.disposition, 'manual_owner_only')
      assert.equal(result.authorizesExecution, false)
      assert.equal(result.repositoryDeletionAllowed, false)
      assert.ok(Object.isFrozen(result))
    }
  })
  it('refuses alleged owner-approved, globally privileged or delegated delete commands', () => {
    for (const spoof of [
      { operation:'delete_repository', ownerApproved:true },
      { operation:'delete_repository', principal:'Atlas', global:true },
      { operation:'delete_repository', delegateTo:'project_agent' },
      { operation:'delete_repository', avatar:'Pling' },
    ]) {
      assert.deepEqual(classify(spoof),classify('unknown'))
    }
  })
  it('never maps unknown destructive API aliases to a write broker', () => {
    for (const op of [
      'DELETE /repos/Bumbi190/handlarborsen', 'delete_repo', 'delete_repositories',
      'remove_repository', 'destroy_repository', 'remove_project', 'delete_branch',
    ]) assert.equal(classify(op).disposition,'deny')
  })
  it('routes future GitHub repo creation ONLY to a separate scoped writer', () => {
    const result=classify('create_repository')
    assert.equal(result.disposition,'separate_scoped_create_broker_required')
    assert.equal(result.authorizesExecution,false)
    assert.equal(result.repositoryDeletionAllowed,false)
  })
  it('keeps discovery/source inspection read-scope only', () => {
    for(const op of ['discover_repositories','inspect_repository_source']){
      assert.equal(classify(op).disposition,'read_scope_required')
    }
  })
  it('routes STOP, access revoke and integration disconnect without repo deletion', () => {
    for(const op of [
      'pause_project_workflow','revoke_project_github_access',
      'disconnect_omnira_github_integration',
    ]){
      const result=classify(op)
      assert.equal(result.disposition,'project_scoped_stop_required')
      assert.equal(result.repositoryDeletionAllowed,false)
      assert.equal(result.authorizesExecution,false)
    }
  })
  it('makes deletion RECOMMENDATIONS advisory, not a tool action', () => {
    const result=classify('recommend_repository_deletion')
    assert.equal(result.disposition,'advice_only')
    assert.equal(result.authorizesExecution,false)
  })
  it('fails closed for noncanonical/unknown names and malformed inputs', () => {
    for (const op of [
      null,undefined,false,0,[],{},'',' DELETE_REPOSITORY','delete_repository ',
      'Delete_Repository','CREATE_REPOSITORY','delete_repository\n',
      'x'.repeat(1000),
    ]) {
      assert.equal(classify(op).disposition,'deny')
      assert.equal(classify(op).authorizesExecution,false)
    }
  })
  it('never returns a final execution grant for any described operation', () => {
    for(const op of [
      'discover_repositories','inspect_repository_source','create_repository',
      'pause_project_workflow','revoke_project_github_access',
      'disconnect_omnira_github_integration','recommend_repository_deletion',
      'delete_repository','permanently_delete_repository','remove_github_repository',
      'unlisted_operation',
    ]){
      const result=classify(op)
      assert.equal(result.authorizesExecution,false)
      assert.equal(result.repositoryDeletionAllowed,false)
    }
  })
  it('uses a neutral workflow-agent technical role, never a Pling DB principal', () => {
    const bootstrap=readFileSync(fileURLToPath(new URL(
      './fixtures/atlas-owner-github-rls/bootstrap_pg17.sql', import.meta.url,
    )),'utf8')
    const both=[
      './fixtures/atlas-owner-github-rls/verify_pg17.sql',
      './fixtures/atlas-owner-github-rls/verify_lifecycle_pg17.sql',
    ].map(path=>readFileSync(fileURLToPath(new URL(path,import.meta.url)),'utf8'))
    assert.match(bootstrap,/create role workflow_agent /)
    assert.doesNotMatch(bootstrap,/pling_executor/i)
    for(const s of both){
      assert.match(s,/set role workflow_agent;/)
      assert.doesNotMatch(s,/pling_executor/i)
    }
  })
})
