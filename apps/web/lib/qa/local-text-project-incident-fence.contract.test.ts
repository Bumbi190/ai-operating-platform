import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * RED FIRST, pending https://github.com/Bumbi190/ai-operating-platform/issues/533.
 *
 * Finds the last source definition of public.local_text_eligible across additive
 * migrations. It deliberately fails on the current production-equivalent SQL.
 * Do not weaken, skip or xfail this test just to merge an unrelated feature.
 * Static source checks do not replace live PostgreSQL integration acceptance.
 */
function latestEligibleSql(): string {
  const dir=resolve(process.cwd(),'supabase/migrations')
  const files=readdirSync(dir).filter(name=>name.endsWith('.sql')).sort()
  let latest:string|null=null
  const pattern=/\bcreate\s+(?:or\s+replace\s+)?function\s+public\.local_text_eligible\s*\(/gi
  for (const file of files) {
    const source=readFileSync(resolve(dir,file),'utf8')
    for (const match of source.matchAll(pattern)) {
      const end=source.indexOf('$$;',match.index)
      if (end<0) throw new Error('INCOMPLETE_LOCAL_TEXT_ELIGIBLE_SQL')
      // Strip single-line comments to avoid accepting a claimed rather than enforced guard.
      latest=source.slice(match.index,end+3)
        .replace(/--[^\r\n]*/g,'')
        .replace(/\s+/g,' ')
        .toLowerCase()
    }
  }
  if (!latest) throw new Error('MISSING_LOCAL_TEXT_ELIGIBLE_SQL')
  return latest
}
describe('RED security contract #533 — an old unknown outcome must block every new device',()=>{
  it('denies execution when ANY open reconcile incident is bound to the same project',()=>{
    const sql=latestEligibleSql()
    expect(sql).toMatch(/\b(?:not\s+)?exists\s*\(\s*select\s+1\s+from\s+public\.local_text_incidents\b/)
    expect(sql).toMatch(/\bproject_id\s*=\s*p_project\b|\bp_project\s*=\s*project_id\b/)
    expect(sql).toMatch(/\bkind\s*=\s*'reconcile'|\bkind\s+in\s*\(\s*'reconcile'/)
    expect(sql).toMatch(/\bstate\s*=\s*'open'/)
  })
})
