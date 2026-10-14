import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const IDS = ['design-taste-frontend','redesign-existing-projects','impeccable','emil-design-eng','animate','review-animations','improve-animations','break-ui']
export function buildDesignBundle(root) {
  const lock = JSON.parse(readFileSync(resolve(root,'docs/skills/design-bundle.lock.json'),'utf8'))
  if (lock.version !== 1 || lock.skills.length !== IDS.length || new Set(lock.skills.map(s=>s.id)).size !== IDS.length) throw Error('Unexpected skill manifest')
  const skills = lock.skills.map(skill => {
    if (!IDS.includes(skill.id) || skill.installedPath !== '.agents/skills/'+skill.id) throw Error('Unregistered skill')
    if (!/^[a-f0-9]{40}$/.test(skill.commit) || !/^https:\/\/github\.com\/(Leonxlnx\/taste-skill|pbakaus\/impeccable|emilkowalski\/skills)$/.test(skill.source)) throw Error('Invalid provenance')
    const base = resolve(root,skill.installedPath), documents = {}
    for (const file of skill.files) {
      const target = resolve(base,file.path)
      if (!target.startsWith(base+sep)) throw Error('Path escapes skill')
      const bytes = readFileSync(target), actual = createHash('sha256').update(bytes).digest('hex')
      if (actual !== file.sha256) throw Error('Hash mismatch: '+skill.id+'/'+file.path)
      if (file.path.endsWith('.md') && !file.path.startsWith('evals/') && !file.path.startsWith('scripts/') && file.path !== 'README.md') documents[file.path] = { text: bytes.toString('utf8'), sha256: actual }
    }
    const main = documents['SKILL.md']?.text
    if (!main || !main.startsWith('---') || !main.includes('name: '+skill.id)) throw Error('Invalid skill identity')
    return { id: skill.id, name: skill.id, description: main.match(/^description:\s*(.+)$/m)?.[1] ?? skill.id, source: skill.source, commit: skill.commit, documents }
  })
  return {version:1,skills}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)),'../../..')
  const bundle = buildDesignBundle(root)
  const target = resolve(root,'apps/web/lib/skills/generated/design-bundle.json')
  mkdirSync(dirname(target),{recursive:true}); writeFileSync(target,JSON.stringify(bundle)+'\n')
  console.log(JSON.stringify({skills:bundle.skills.length,documents:bundle.skills.reduce((n,s)=>n+Object.keys(s.documents).length,0),target}))
}
