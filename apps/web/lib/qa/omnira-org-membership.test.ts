import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261013193000_omnira_org_memberships.sql'), 'utf8')

describe('Omnira organization membership foundation', () => {
  it('only declares owner and collaborator, with one active owner', () => {
    expect(sql).toContain("role in ('owner','collaborator')")
    expect(sql).toContain('create unique index if not exists omnira_single_active_owner')
    expect(sql).toContain("role = 'owner' and revoked_at is null")
  })
  it('has fail-closed RLS and no authenticated role writes', () => {
    expect(sql).toMatch(/enable row level security/i)
    expect(sql).toMatch(/force row level security/i)
    expect(sql).toMatch(/grant select on public\.omnira_organization_memberships to authenticated/i)
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on public\.omnira_organization_memberships to authenticated/i)
    expect(sql).toContain('user_id = (select auth.uid())')
  })
  it('does not change existing resource access or create users', () => {
    expect(sql).not.toMatch(/create policy[\s\S]*? on public\.projects\b/i)
    expect(sql).not.toMatch(/insert into auth\.users|insert into public\.omnira_organization_memberships/i)
    expect(sql).not.toMatch(/security definer/i)
  })
})
