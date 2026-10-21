import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { listDesignSkills, readDesignSkill, createDesignSkillRegistry } from '../skills/design-registry'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const fixture = (text = 'A'.repeat(17000)) => ({ version: 1, skills: [{
  id: 'design-taste-frontend', name: 'Taste', description: 'Design',
  source: 'https://github.com/Leonxlnx/taste-skill', commit: 'a'.repeat(40),
  documents: { 'SKILL.md': { text, sha256: sha(text) }, 'references/copy.md': { text: 'Copy', sha256: sha('Copy') } },
}] })

describe('deployable design skill registry', () => {
  it('lists nine pinned skills including UI UX Pro Max as knowledge only', () => {
    const skills = listDesignSkills()
    expect(skills).toHaveLength(9)
    expect(readDesignSkill({id:'ui-ux-pro-max'}).text).toContain('UI/UX Pro Max')
    expect(skills.find(s => s.id === 'impeccable')?.commit).toMatch(/^[a-f0-9]{40}$/)
    expect(skills.every(s => s.status === 'knowledge_only')).toBe(true)
    expect(readDesignSkill({ id: 'impeccable' }).text).toContain('Impeccable')
  })
  it('rejects unknown skill IDs including prototype keys', () => {
    for (const id of ['missing', '__proto__', 'constructor']) expect(() => readDesignSkill({ id })).toThrow()
  })
  it('rejects traversal, absolute paths and nonregistered references', () => {
    const registry = createDesignSkillRegistry(fixture())
    for (const reference of ['../SKILL.md', '/etc/passwd', 'C:/secret.md', 'https://example.com/a.md', 'references/missing.md', '__proto__']) {
      expect(() => registry.read({ id: 'design-taste-frontend', reference })).toThrow()
    }
    expect(registry.read({ id: 'design-taste-frontend', reference: 'references/copy.md' }).text).toBe('Copy')
  })
  it('returns explicit bounded chunks without losing content', () => {
    const registry = createDesignSkillRegistry(fixture())
    const first = registry.read({ id: 'design-taste-frontend' })
    expect(first.text).toHaveLength(16000)
    expect(first.nextOffset).toBe(16000)
    const last = registry.read({ id: 'design-taste-frontend', offset: first.nextOffset! })
    expect(last.text).toHaveLength(1000)
    expect(last.nextOffset).toBeNull()
    expect(first.text + last.text).toBe('A'.repeat(17000))
  })
  it('rejects malformed offsets and over-budget reads', () => {
    const registry = createDesignSkillRegistry(fixture())
    for (const offset of [-1, 0.5, NaN, 17001]) expect(() => registry.read({ id: 'design-taste-frontend', offset })).toThrow()
    for (const limit of [0, 16001, Infinity, 2.5]) expect(() => registry.read({ id: 'design-taste-frontend', limit })).toThrow()
  })
  it('fails closed when packaged content is changed without its hash', () => {
    const bundle = fixture('trusted')
    bundle.skills[0].documents['SKILL.md'].text = 'changed'
    expect(() => createDesignSkillRegistry(bundle)).toThrow(/hash/i)
  })
  it('cannot be mutated through a returned metadata object', () => {
    const registry = createDesignSkillRegistry(fixture('trusted'))
    registry.list()[0].id = 'evil'
    expect(registry.read({ id: 'design-taste-frontend' }).text).toBe('trusted')
  })
})
