/** SDF-1C1B: claim-scoped broker credential helper, control-plane forwarding and structural boundary. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BROKER_CLAIM_TOKEN_DOMAIN, brokerClaimTokenHash, brokerClaimTokenMatches,
  isBrokerClaimToken, isBrokerClaimTokenHash, issueBrokerClaimCredential,
} from '@/lib/atlas/code-work/claim-credential/claim-credential'
import { claimCodeWorkRun } from '@/lib/atlas/code-work/claim-credential/claim'
import type { StoredCodeWorkRun } from '@/lib/atlas/code-work/control-plane/types'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))

const ROOT = resolve(__dirname, '../../../..')
const WORK = '30000000-0000-4000-8000-000000000001'
const OTHER_WORK = '30000000-0000-4000-8000-000000000002'
const fixedBytes = (fill: number) => () => Buffer.alloc(32, fill)

function runRow(over: Record<string, unknown> = {}) {
  return {
    work_id: WORK, project_id: 'p', requested_by: 'u', proposal_key_hash: 'k', proposal_fingerprint_hash: 'f',
    admission: {}, admission_hash: 'a', authorization_id: 'z', authorization_expires_at: null, state: 'claimed',
    state_version: 2, authorized_at: null, claim_id: '90000000-0000-4000-8000-000000000001', fence: 1,
    lease_until: '2026-09-24T08:00:00Z', cancel_requested: false, last_receipt_sequence: 3, receipt_chain_head: 'h',
    terminal_at: null, terminal_reason_code: null, created_at: '2026-09-24T07:00:00Z', updated_at: '2026-09-24T07:00:00Z',
    // Even if a database ever returned these, the store must not surface them.
    broker_token_hash: 'd'.repeat(64), broker_token_expires_at: '2026-09-24T08:00:00Z', ...over,
  }
}

describe('SDF-1C1B claim credential helper', () => {
  it('issues 32 random bytes as 43-character canonical unpadded base64url', () => {
    const { token, tokenHash } = issueBrokerClaimCredential(WORK)
    expect(token).toHaveLength(43)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(token).not.toContain('=')
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    expect(isBrokerClaimToken(token)).toBe(true)
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(issueBrokerClaimCredential(WORK).token).not.toBe(token)
    const injected = issueBrokerClaimCredential(WORK, fixedBytes(7))
    expect(injected.token).toBe(Buffer.alloc(32, 7).toString('base64url'))
  })

  it('refuses an entropy source that returns the wrong amount', () => {
    expect(() => issueBrokerClaimCredential(WORK, () => Buffer.alloc(16))).toThrow(/wrong size/)
    expect(() => issueBrokerClaimCredential(WORK, () => 'x' as unknown as Buffer)).toThrow(/wrong size/)
  })

  it('hashes with the documented domain separation, bound to the work id', () => {
    const { token } = issueBrokerClaimCredential(WORK, fixedBytes(1))
    const expected = createHash('sha256')
      .update(`omnira.code_work.broker_claim_token.v1\n${WORK}\n${token}`).digest('hex')
    expect(BROKER_CLAIM_TOKEN_DOMAIN).toBe('omnira.code_work.broker_claim_token.v1')
    expect(brokerClaimTokenHash(WORK, token)).toBe(expected)
    expect(brokerClaimTokenHash(WORK, token)).toBe(brokerClaimTokenHash(WORK.toUpperCase(), token))
    expect(brokerClaimTokenHash(OTHER_WORK, token)).not.toBe(expected)
  })

  it('matches only the exact token for the exact work id', () => {
    const a = issueBrokerClaimCredential(WORK, fixedBytes(1))
    const b = issueBrokerClaimCredential(WORK, fixedBytes(2))
    expect(brokerClaimTokenMatches(WORK, a.token, a.tokenHash)).toBe(true)
    expect(brokerClaimTokenMatches(WORK, b.token, a.tokenHash)).toBe(false)
    expect(brokerClaimTokenMatches(OTHER_WORK, a.token, a.tokenHash)).toBe(false)
  })

  it('fails closed on malformed tokens, work ids and stored hashes', () => {
    const { token, tokenHash } = issueBrokerClaimCredential(WORK, fixedBytes(3))
    const bad: unknown[] = [undefined, null, 42, '', token.slice(1), `${token}A`, `${token.slice(0, 42)}=`, token.replace(/.$/, '!'), ' ' + token.slice(1)]
    for (const value of bad) {
      expect(brokerClaimTokenMatches(WORK, value, tokenHash)).toBe(false)
      expect(isBrokerClaimToken(value)).toBe(false)
    }
    // Non-canonical alias of the same 32 bytes (the 43rd character carries only 4 bits).
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const alias = token.slice(0, 42) + ALPHABET[ALPHABET.indexOf(token[42]) ^ 1]
    expect(alias).not.toBe(token)
    expect(Buffer.from(alias, 'base64url').equals(Buffer.from(token, 'base64url'))).toBe(true)
    expect(isBrokerClaimToken(alias)).toBe(false)
    for (const value of [undefined, null, '', tokenHash.toUpperCase(), tokenHash.slice(1), `${tokenHash}0`, 'g'.repeat(64)]) {
      expect(brokerClaimTokenMatches(WORK, token, value)).toBe(false)
      expect(isBrokerClaimTokenHash(value)).toBe(false)
    }
    expect(brokerClaimTokenMatches('not-a-uuid', token, tokenHash)).toBe(false)
    expect(() => brokerClaimTokenHash('not-a-uuid', token)).toThrow()
    expect(() => brokerClaimTokenHash(WORK, 'short')).toThrow()
  })

  it('compares hashes only through timingSafeEqual at the final seam', () => {
    const source = readFileSync(resolve(ROOT, 'apps/web/lib/atlas/code-work/claim-credential/claim-credential.ts'), 'utf8')
    expect(source).toContain('timingSafeEqual(Buffer.from(actual')
    expect(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).not.toMatch(/(?:actual|expectedHash)\s*[!=]==/)
  })
})

describe('SDF-1C1B control plane forwards only the hash', () => {
  beforeEach(() => { rpc.mockReset() })

  it('the store sends the hash to SQL and never a token, and refuses a malformed hash before any RPC', async () => {
    const { createCodeWorkControlPlaneStore } = await import('@/lib/atlas/code-work/control-plane/store')
    const store = createCodeWorkControlPlaneStore()
    const credential = issueBrokerClaimCredential(WORK, fixedBytes(4))
    rpc.mockResolvedValue({ data: runRow(), error: null })
    await store.claim(WORK, 'broker', 'host', credential.tokenHash)
    expect(rpc).toHaveBeenCalledWith('atlas_code_work_claim', {
      p_work_id: WORK, p_broker_id: 'broker', p_broker_host_id: 'host', p_broker_token_hash: credential.tokenHash,
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(credential.token)
    for (const hash of ['', credential.token, credential.tokenHash.toUpperCase(), credential.tokenHash.slice(1)]) {
      expect(() => store.claim(WORK, 'broker', 'host', hash)).toThrow(/SHA-256 credential hash/)
    }
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('the run model and run reads carry no credential material', async () => {
    const { createCodeWorkControlPlaneStore } = await import('@/lib/atlas/code-work/control-plane/store')
    rpc.mockResolvedValue({ data: runRow(), error: null })
    const run = await createCodeWorkControlPlaneStore().claim(WORK, 'b', 'h', 'e'.repeat(64))
    expect(JSON.stringify(run)).not.toMatch(/token|d{64}|dddddddd/i)
    expect(Object.keys(run)).not.toContain('brokerTokenHash')
    const store = readFileSync(resolve(ROOT, 'apps/web/lib/atlas/code-work/control-plane/store.ts'), 'utf8')
    const columns = store.slice(store.indexOf('const RUN_COLUMNS'), store.indexOf('].join'))
    expect(columns).not.toMatch(/token/)
    expect(readFileSync(resolve(ROOT, 'apps/web/lib/atlas/code-work/control-plane/types.ts'), 'utf8')).not.toMatch(/token/i)
  })

  it('claimCodeWorkRun issues a credential, passes only its hash, and returns the raw token to the caller alone', async () => {
    const seen: unknown[][] = []
    const store = { claim: async (...args: unknown[]) => { seen.push(args); return { ...runFromRow(), claimId: 'c1' } } }
    const result = await claimCodeWorkRun(store as never, { workId: WORK, brokerId: 'b', brokerHostId: 'h' }, fixedBytes(5))
    expect(result.status).toBe('claimed')
    if (result.status !== 'claimed') return
    const token = Buffer.alloc(32, 5).toString('base64url')
    expect(result.claimToken).toBe(token)
    expect(seen[0]).toEqual([WORK, 'b', 'h', brokerClaimTokenHash(WORK, token)])
    expect(JSON.stringify(seen)).not.toContain(token)
    expect(JSON.stringify(result.run)).not.toContain(token)
  })

  it('claimCodeWorkRun returns no credential when SQL settled the run instead of claiming it', async () => {
    const store = { claim: async () => ({ ...runFromRow(), state: 'cancelled', claimId: null }) }
    const result = await claimCodeWorkRun(store as never, { workId: WORK, brokerId: 'b', brokerHostId: 'h' })
    expect(result.status).toBe('not_claimed')
    expect(JSON.stringify(result)).not.toMatch(/claimToken/)
  })

  it('never lets a caller choose claim id, fence, lease or token expiry', () => {
    const input = readFileSync(resolve(ROOT, 'apps/web/lib/atlas/code-work/claim-credential/claim.ts'), 'utf8')
    expect(input).toMatch(/interface CodeWorkClaimInput \{\s*workId: string\s*brokerId: string\s*brokerHostId: string\s*\}/)
    const sql = readFileSync(resolve(ROOT, 'apps/web/supabase/migrations/20260924080000_sdf1c1b_broker_claim_credentials.sql'), 'utf8')
    expect(sql).toMatch(/atlas_code_work_claim\(\s*p_work_id uuid,\s*p_broker_id text,\s*p_broker_host_id text,\s*p_broker_token_hash text\s*\)/)
    expect(sql).not.toMatch(/p_(?:claim_id|fence|lease_until|broker_token_expires_at)\b[^;]*?\)\s*returns public\.atlas_code_work_runs\s*language plpgsql\s*security definer\s*set search_path = ''\s*as \$fn\$\s*declare\s*v_run public\.atlas_code_work_runs;\s*v_expiry timestamptz;\s*v_runtime_cap/)
  })
})

function runFromRow(): StoredCodeWorkRun {
  return {
    workId: WORK, projectId: 'p', requestedBy: 'u', proposalKeyHash: 'k', proposalFingerprintHash: 'f',
    admission: {} as never, admissionHash: 'a', authorizationId: 'z', authorizationExpiresAt: null, state: 'claimed',
    stateVersion: 2, authorizedAt: null, claimId: null, fence: 1, leaseUntil: null, cancelRequested: false,
    lastReceiptSequence: 3, receiptChainHead: 'h', terminalAt: null, terminalReasonCode: null,
    createdAt: 'x', updatedAt: 'x',
  }
}

describe('SDF-1C1B migration and structural boundary', () => {
  const MIGRATIONS = resolve(ROOT, 'apps/web/supabase/migrations')
  const NEW = readFileSync(join(MIGRATIONS, '20260924080000_sdf1c1b_broker_claim_credentials.sql'), 'utf8')
  const executable = NEW.replace(/--.*$/gm, '')

  it('is a new migration that leaves SDF-1B1 history and the receipt/table shape alone', () => {
    const b1 = readFileSync(join(MIGRATIONS, '20260918095827_sdf1b1_code_work_control_plane.sql'), 'utf8')
    expect(b1).toContain('constraint atlas_code_work_runs_token_dormant_check check (')
    expect(b1).toContain("'credentialIssued',false")
    expect(executable).toMatch(/drop constraint atlas_code_work_runs_token_dormant_check/)
    expect(executable).not.toMatch(/create table|alter table (?!public\.atlas_code_work_runs)/i)
    expect(executable).not.toMatch(/\b(?:begin|commit)\s*;/i)
    expect(readdirSync(MIGRATIONS).filter(name => name.includes('sdf1c1b'))).toEqual(['20260924080000_sdf1c1b_broker_claim_credentials.sql'])
  })

  it('removes the credential-less claim outright and keeps the ACL closed', () => {
    expect(executable).toMatch(/drop function public\.atlas_code_work_claim\(uuid, text, text\)/)
    expect(executable).not.toMatch(/create (?:or replace )?function public\.atlas_code_work_claim\(\s*p_work_id uuid,\s*p_broker_id text,\s*p_broker_host_id text\s*\)/)
    expect(executable).toMatch(/revoke all on function public\.atlas_code_work_claim\(uuid, text, text, text\)\s*from public, anon, authenticated, service_role/)
    expect(executable).toMatch(/grant execute on function public\.atlas_code_work_claim\(uuid, text, text, text\) to service_role/)
    expect(executable).toContain("'credentialIssued',true")
    expect(executable).not.toMatch(/'(?:token|tokenHash|brokerTokenHash|credential)'\s*,/)
  })

  it('has no raw-token column and stores only a hash of lowercase SHA-256 form', () => {
    expect(executable).not.toMatch(/add column|broker_token\b|raw_token|claim_token\s+text/i)
    expect(executable).toContain("broker_token_hash ~ '^[a-f0-9]{64}$'")
    expect(executable).toContain('broker_token_expires_at = lease_until')
  })

  it('adds no route, no broker CLI command and no execution/model code', () => {
    const api = resolve(ROOT, 'apps/web/app/api/atlas/code-work')
    expect(readdirSync(join(api, 'broker')).sort()).toEqual(['enroll', 'identity'])
    for (const name of ['claim', 'heartbeat', 'discover', 'context', 'evidence', 'transition', 'execute', 'preflight']) {
      expect(existsSync(join(api, name)), name).toBe(false)
      expect(existsSync(join(api, 'broker', name)), `broker/${name}`).toBe(false)
    }
    const cli = readFileSync(resolve(ROOT, 'apps/code-broker/src/cli.ts'), 'utf8')
    expect(cli).toContain("throw new Error('usage: generate | enroll | diagnostic')")
    expect(cli).not.toMatch(/claim|heartbeat|discover/i)
    const dir = resolve(ROOT, 'apps/web/lib/atlas/code-work/claim-credential')
    const files = readdirSync(dir).filter(name => statSync(join(dir, name)).isFile())
    expect(files.sort()).toEqual(['claim-credential.ts', 'claim.ts'])
    const source = files.map(name => readFileSync(join(dir, name), 'utf8')).join('\n')
    expect(source).not.toMatch(/child_process|\b(?:spawn|exec|execFile|fork)\s*\(|from ['"](?:node:)?fs['"]|\bfetch\s*\(|@anthropic-ai|from ['"]openai['"]/)
    expect(source).not.toMatch(/git\s+(?:worktree|commit|push|merge)|gh\s+pr|vercel\s+(?:deploy|promote)|apply[_-]?patch|command[_-]?runner/i)
    expect(source).not.toMatch(/console\.|logger|process\.env/)
    // Nothing else in the application imports the helper: it has no caller yet (Phase 1C2).
    const importers: string[] = []
    const walk = (directory: string) => {
      for (const name of readdirSync(directory)) {
        if (['node_modules', '.next', 'qa'].includes(name)) continue
        const path = join(directory, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(?:ts|tsx)$/.test(name) && /claim-credential\//.test(readFileSync(path, 'utf8')) && !path.includes('/code-work/claim-credential/')) importers.push(path)
      }
    }
    for (const part of ['app', 'lib', 'components']) walk(resolve(ROOT, 'apps/web', part))
    expect(importers).toEqual([])
  })

  it('stays wired into the SDF-1C workflow with explicit anti-skip floors', () => {
    const workflow = readFileSync(resolve(ROOT, '.github/workflows/sdf1c-trusted-broker-boundary.yml'), 'utf8')
    expect(workflow).toContain('lib/qa/sdf1c-broker-claim-credential.test.ts')
    expect(workflow).toContain('lib/qa/sdf1c-broker-claim-credential-sql.test.ts')
    expect(workflow).toMatch(/\['sdf1c-broker-claim-credential\.test\.ts', \d+\]/)
    expect(workflow).toMatch(/\['sdf1c-broker-claim-credential-sql\.test\.ts', \d+\]/)
    expect(workflow).toContain('ATLAS_SQL_TEST_REQUIRED: 1')
  })
})
