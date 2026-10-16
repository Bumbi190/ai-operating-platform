import { describe, it, expect } from 'vitest'
import { canCollaborateOnProject as allow } from '@/lib/auth/collaborator-project-permissions'
import { HANDLARBORSEN_PROJECT_ID, HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'
const collaborator = { active: true as const, role: 'collaborator' as const }
const owner = { active: true as const, role: 'owner' as const }
const denied = { active: false as const, role: null }
const hb = { id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG }
const other = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', slug: 'familje-stunden' }
describe('organization collaborator per-project permissions', () => {
  it('may view both Handlarbörsen and other projects', () => {
    expect(allow(collaborator, hb, 'view')).toBe(true)
    expect(allow(collaborator, other, 'view')).toBe(true)
    expect(allow(denied, hb, 'view')).toBe(false)
  })
  it('may operate workflows only for canonical Handlarbörsen identity', () => {
    expect(allow(collaborator, hb, 'operate_workflow')).toBe(true)
    expect(allow(collaborator, other, 'operate_workflow')).toBe(false)
    expect(allow(collaborator, hb, 'propose_workflow')).toBe(true)
    expect(allow(collaborator, other, 'propose_workflow')).toBe(false)
    expect(allow(collaborator, { ...hb, slug: 'another' }, 'operate_workflow')).toBe(false)
    expect(allow(collaborator, { ...hb, id: other.id }, 'operate_workflow')).toBe(false)
  })
  it('grants bounded candidate and history monitoring only on canonical Handlarbörsen', () => {
    for (const action of ['view_competitors', 'record_competitor_evidence'] as const) {
      expect(allow(collaborator, hb, action)).toBe(true)
      expect(allow(collaborator, other, action)).toBe(false)
      expect(allow(collaborator, { ...hb, slug: 'other' }, action)).toBe(false)
      expect(allow(owner, hb, action)).toBe(false) // Owner uses own RLS route
      expect(allow(denied, hb, action)).toBe(false)
    }
  })
  it('never authorizes protected actions on any project', () => {
    for (const action of ['approve','deploy','billing','credentials','manage_members','edit_project'] as const) {
      expect(allow(collaborator, hb, action)).toBe(false)
      expect(allow(collaborator, other, action)).toBe(false)
    }
  })
  it('does not replace Owner action authority or authorize revoked users', () => {
    expect(allow(owner, hb, 'operate_workflow')).toBe(false)
    expect(allow(denied, hb, 'operate_workflow')).toBe(false)
    expect(allow(denied, hb, 'propose_workflow')).toBe(false)
  })
})
