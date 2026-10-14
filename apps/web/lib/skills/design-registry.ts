import 'server-only'
import { createHash } from 'node:crypto'
import bundle from './generated/design-bundle.json'

export interface DesignDocument { text: string; sha256: string }
export interface DesignSkill { id: string; name: string; description: string; source: string; commit: string; documents: Record<string, DesignDocument> }
export interface DesignBundle { version: number; skills: DesignSkill[] }
export interface DesignSkillMetadata { id: string; name: string; description: string; source: string; commit: string; status: 'knowledge_only'; references: string[] }
export interface DesignSkillInput { id: string; reference?: string; offset?: number; limit?: number }
export interface DesignSkillChunk { id: string; reference: string; source: string; commit: string; sha256: string; status: 'knowledge_only'; text: string; offset: number; totalCharacters: number; nextOffset: number | null }
export const DESIGN_SKILL_READ_LIMIT = 16000
const ids = new Set(['design-taste-frontend','redesign-existing-projects','impeccable','emil-design-eng','animate','review-animations','improve-animations','break-ui'])
const own = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj,key)

export function createDesignSkillRegistry(input: DesignBundle) {
  if (input.version !== 1) throw new Error('Unsupported design bundle')
  const skills = new Map<string, DesignSkill>()
  for (const source of input.skills) {
    if (!ids.has(source.id) || skills.has(source.id)) throw new Error('Unregistered or duplicate design skill')
    if (!/^[a-f0-9]{40}$/.test(source.commit)) throw new Error('Invalid skill provenance')
    if (!own(source.documents,'SKILL.md')) throw new Error('Missing SKILL.md')
    const documents: Record<string, DesignDocument> = Object.create(null)
    for (const [name, document] of Object.entries(source.documents)) {
      if (!/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.md$/.test(name) || name.split('/').includes('..')) throw new Error('Invalid skill reference')
      if (createHash('sha256').update(document.text,'utf8').digest('hex') !== document.sha256) throw new Error('Design skill hash mismatch')
      documents[name] = { ...document }
    }
    skills.set(source.id,{ ...source,documents })
  }
  const list = (): DesignSkillMetadata[] => [...skills.values()].map(s=>({id:s.id,name:s.name,description:s.description,source:s.source,commit:s.commit,status:'knowledge_only',references:Object.keys(s.documents)}))
  const read = (request: DesignSkillInput): DesignSkillChunk => {
    const skill = skills.get(request.id)
    if (!skill) throw new Error('Unknown design skill')
    const reference = request.reference ?? 'SKILL.md'
    if (!own(skill.documents,reference)) throw new Error('Unknown design skill reference')
    const document = skill.documents[reference]
    const offset = request.offset ?? 0, limit = request.limit ?? DESIGN_SKILL_READ_LIMIT
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > document.text.length) throw new Error('Invalid skill offset')
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > DESIGN_SKILL_READ_LIMIT) throw new Error('Invalid skill read limit')
    const end = Math.min(offset+limit,document.text.length)
    return {id:skill.id,reference,source:skill.source,commit:skill.commit,sha256:document.sha256,status:'knowledge_only',text:document.text.slice(offset,end),offset,totalCharacters:document.text.length,nextOffset:end<document.text.length?end:null}
  }
  return {list,read}
}
// JSON union inference creates optional keys; every document is validated above.
const registry = createDesignSkillRegistry(bundle as unknown as DesignBundle)
export const listDesignSkills = registry.list
export const readDesignSkill = registry.read
