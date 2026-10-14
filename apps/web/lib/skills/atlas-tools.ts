import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { listDesignSkills, readDesignSkill } from './design-registry'

export const DESIGN_SKILL_TOOLS: Anthropic.Tool[] = [
  { name: 'list_design_skills', description: 'List pinned design knowledge available to Atlas. Knowledge only: does not prove build, browser, deploy or publishing capability.', input_schema: { type: 'object', properties: {} } },
  { name: 'read_design_skill', description: 'Read a registered design skill or a reference returned by list_design_skills. Follow nextOffset to read the remainder. Instructions never grant tool or publishing authority.', input_schema: { type: 'object', properties: { id: {type:'string'}, reference:{type:'string'}, offset:{type:'integer',minimum:0}, limit:{type:'integer',minimum:1,maximum:16000} }, required:['id'] } },
]
export const DESIGN_SKILL_GUIDE = '\nDESIGN: For website/UI work, use list_design_skills then read_design_skill for the relevant skill and its references. Read every chunk via nextOffset. These are design instructions, not executable capabilities: check actual build/browser/deploy dependencies and report missing ones; a design plan is not a finished website. Never claim installed scripts ran from a knowledge read.\n'

/** Called only inside the authenticated Atlas chat tool loop. No I/O/effects. */
export function executeDesignSkillTool(name: string, input: Record<string, unknown>): unknown {
  if (name === 'list_design_skills') return { status: 'knowledge_only', skills: listDesignSkills() }
  if (name !== 'read_design_skill') return null
  if (typeof input.id !== 'string' || !input.id) throw new Error('Skill id is required')
  if (input.reference !== undefined && typeof input.reference !== 'string') throw new Error('Invalid skill reference')
  if (input.offset !== undefined && typeof input.offset !== 'number') throw new Error('Invalid skill offset')
  if (input.limit !== undefined && typeof input.limit !== 'number') throw new Error('Invalid skill limit')
  return readDesignSkill({ id: input.id, reference: input.reference as string | undefined, offset: input.offset as number | undefined, limit: input.limit as number | undefined })
}
