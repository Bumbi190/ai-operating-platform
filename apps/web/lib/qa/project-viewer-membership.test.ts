import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261013160000_project_viewer_memberships.sql'), 'utf8')

describe('project viewer membership migration fail-closed contract', () => {
  it('does not modify RLS on existing projects or resource tables', () => {
    expect(sql).not.toMatch(/(?:alter table|create policy)\s+public\.(?!project_viewer_memberships)/i)
    expect(sql).not.toContain('security definer')
    expect(sql).not.toContain('service_role')
  })
  it('restricts grants to membership management without UPDATE', () => {
    expect(sql).toMatch(/enable row level security/i)
    expect(sql).toMatch(/force row level security/i)
    expect(sql).toMatch(/grant select, insert, delete on public\.project_viewer_memberships to authenticated/i)
    expect(sql).not.toMatch(/grant\s+update/i)
    expect(sql).toMatch(/role\s*=\s*'viewer'/i)
  })
  it('requires project ownership to add and revoke memberships', () => {
    expect(sql).toMatch(/for insert to authenticated[\s\S]*?with check[\s\S]*?p\.owner_id\s*=\s*\(select auth\.uid\(\)\)/i)
    expect(sql).toMatch(/for delete to authenticated[\s\S]*?using[\s\S]*?p\.owner_id\s*=\s*\(select auth\.uid\(\)\)/i)
    expect(sql).not.toMatch(/for update to authenticated/i)
  })
  it('is constrained to one viewer role and unique identity per project', () => {
    expect(sql).toMatch(/check\s*\(role\s*=\s*'viewer'\)/i)
    expect(sql).toMatch(/primary key\s*\(project_id, user_id\)/i)
  })
})
