import { describe, it, expect } from 'vitest'
import { executeDesignSkillTool, DESIGN_SKILL_TOOLS } from '../skills/atlas-tools'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Atlas design knowledge tools', () => {
  it('registers only read tools and returns honest metadata', () => {
    expect(DESIGN_SKILL_TOOLS.map(t=>t.name)).toEqual(['list_design_skills','read_design_skill'])
    const result = executeDesignSkillTool('list_design_skills', {}) as { skills: { status: string }[] }
    expect(result.skills).toHaveLength(9)
    expect(result.skills.every(s=>s.status==='knowledge_only')).toBe(true)
  })
  it('reads actual pinned content with bounded pagination', () => {
    const result = executeDesignSkillTool('read_design_skill',{id:'design-taste-frontend'}) as { text: string; nextOffset: number }
    expect(result.text.length).toBeLessThanOrEqual(16000)
    expect(result.text).toContain('tasteskill v2')
    expect(result.nextOffset).toBe(16000)
  })
  it('rejects invalid tool arguments and unknown references', () => {
    for(const input of [{}, {id:'unknown'}, {id:'impeccable',reference:'../secrets.md'}, {id:'impeccable',offset:'0'}, {id:'impeccable',limit:100000}]) {
      expect(() => executeDesignSkillTool('read_design_skill',input)).toThrow()
    }
    expect(executeDesignSkillTool('publish_design',{})).toBeNull()
  })
  it('is wired into the existing authenticated chat and retains tool-free fast paths', () => {
    const route = readFileSync(resolve(process.cwd(),'app/api/chat/route.ts'),'utf8')
    expect(route).toContain('...DESIGN_SKILL_TOOLS')
    expect(route).toContain('executeDesignSkillTool(name, input)')
    expect(route).toContain('if (!user)')
    expect(route).toContain('(fastPath || staticConversation) ? [] : studioContext ? TOOLS.filter(tool=>STUDIO_TOOL_NAMES.has(tool.name)) : TOOLS')
  })
})


describe('design tool labels', () => {
  it('shows Swedish progress labels for design knowledge reads', async () => {
    const { toolLabel } = await import('../os/chat-shared')
    expect(toolLabel('list_design_skills')).toBe('Listar designfärdigheter')
    expect(toolLabel('read_design_skill')).toBe('Läser designfärdighet')
  })
})
