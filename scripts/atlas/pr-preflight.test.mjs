import test from 'node:test'
import assert from 'node:assert/strict'
import { assessPreflight, githubRemote, readWorktrees, words } from './pr-preflight.mjs'

const base = {
  prs: [], worktrees: [], localBranches: [], project: 'Omnira',
  task: 'Review Atlas PR branch preflight and duplicate guard',
  workId: 'ISSUE-565', proposedBranch: 'codex/atlas-branch-preflight-20261028',
  reason: 'No existing active PR owns this isolated policy improvement.',
}
const pr = (number, title, head = 'feat/atlas-branch-preflight-existing') => ({
  number, title, headRefName: head, baseRefName: 'main',
  url: 'https://github.com/example/repo/pull/' + number, body: '',
})
test('unrelated open PR is not automatically reused merely for same project', () => {
  const result = assessPreflight({...base, prs: [pr(5, 'fix(atlas): Notion read formatting', 'fix/notion-text')]})
  assert.equal(result.decision, 'new_branch_approved')
  assert.equal(result.candidates.length, 0)
})
test('an already open PR with matching task requires review instead of branching', () => {
  const result = assessPreflight({...base, prs: [pr(42, 'Atlas PR branch preflight and duplicate guard')]})
  assert.equal(result.decision, 'review_required')
  assert.equal(result.code, 'matching_open_pr')
  assert.equal(result.candidates[0].number, 42)
})
test('stable work ID in PR body is matched before a new branch', () => {
  const existing = {...pr(12, 'Misc UI cleanup', 'fix/safe-ui'), body: 'Work-ID: ISSUE-565'}
  const result = assessPreflight({...base, prs: [existing]})
  assert.equal(result.decision, 'review_required')
  assert.equal(result.candidates[0].number, 12)
})
test('explicit reuse of an open PR returns reuse_existing instead of new branch approval', () => {
  const result = assessPreflight({...base, prs: [pr(6, 'Completely different title')], reusePr: 6})
  assert.equal(result.decision, 'reuse_existing')
  assert.equal(result.candidates[0].number, 6)
})
test('nonexistent requested PR is rejected without creating a branch', () => {
  const result = assessPreflight({...base, prs: [pr(5,'A')], reusePr: 6})
  assert.equal(result.decision, 'review_required')
  assert.equal(result.code, 'requested_pr_not_open')
})
test('branch/worktree reuse blocks a second worktree even when the PR list is empty', () => {
  const result = assessPreflight({...base, worktrees: [{
    path: '/safe/isolated/work', branch: base.proposedBranch, locked: true,
  }]})
  assert.equal(result.decision, 'review_required')
  assert.equal(result.code, 'matching_local_branch')
  assert.equal(result.worktreeMatches[0].locked, true)
})
test('no written reason forbids a new branch', () => {
  assert.equal(assessPreflight({...base, reason: ''}).decision, 'review_required')
})
test('truncated or malformed GitHub PR inventory is fail-closed', () => {
  assert.equal(assessPreflight({...base, prs: Array.from({length:500},(_,i)=>pr(i+1,'A'))}).code, 'incomplete_pr_inventory')
  assert.equal(assessPreflight({...base, prs:[{number:'3',title:'Unknown',headRefName:'x'}]}).code, 'invalid_pr_inventory')
})
test('unsafe work identity or branch name is refused', () => {
  assert.equal(assessPreflight({...base, workId:'issue(565)'}).code, 'invalid_work_identity')
  assert.equal(assessPreflight({...base, proposedBranch:'../../unsafe'}).code, 'invalid_work_identity')
})
test('GitHub HTTPS/SSH remotes are accepted but unrelated hosts are refused', () => {
  assert.equal(githubRemote('https://github.com/Bumbi190/ai-operating-platform.git'), 'bumbi190/ai-operating-platform')
  assert.equal(githubRemote('git@github.com:Bumbi190/ai-operating-platform.git'), 'bumbi190/ai-operating-platform')
  assert.equal(githubRemote('git@example.org:Bumbi190/ai-operating-platform.git'), null)
  assert.equal(githubRemote('https://notgithub.com/Bumbi190/ai-operating-platform.git'), null)
  assert.equal(githubRemote('https://github.com.evil.invalid/Bumbi190/ai-operating-platform.git'), null)
})
test('worktree parser retains a locked branch without touching filesystem', () => {
  const sample = 'worktree /safe/one\nHEAD deadbeef\nbranch refs/heads/feat/one\nlocked explicit_cleanup_only\n\nworktree /safe/two\nHEAD cafebabe\ndetached\n'
  const rows = readWorktrees(sample)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {path:'/safe/one',branch:'feat/one',locked:true})
  assert.equal(rows[1].branch, null)
})
test('task tokenizer normalizes Swedish and punctuation without exposing raw body', () => {
  const result = words('Föreslå BRANCH-preflight för Omnira')
  assert.ok(result.has('foresla'))
  assert.ok(result.has('preflight'))
})
