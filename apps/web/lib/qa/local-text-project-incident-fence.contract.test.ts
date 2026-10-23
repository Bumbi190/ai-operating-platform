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
/**
 * Conservative source-level lint for the migration acceptance gate.
 * Does NOT prove the semantics of a deployed SQL function (Postgres E2E does).
 * Unlike naive "exists" text scanning, this requires a DENY form and ensures
 * the incident's project, kind and state are all matched on the SAME alias.
 */
function hasOpenIncidentDeny(source: string): boolean {
  const sql=source.replace(/--[^\r\n]*/g,'').replace(/\s+/g,' ').toLowerCase()
  const match=sql.match(/\b(if\s+exists|and\s+not\s+exists)\s*\(\s*select\s+1\s+from\s+public\.local_text_incidents\s+(?:as\s+)?([a-z_][a-z0-9_]*)\s+where\s+([^)]*)\)/)
  if(!match) return false
  const alias=match[2].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  const where=match[3]
  if(!new RegExp('\\b'+alias+'\\.project_id\\s*=\\s*p_project\\b|\\bp_project\\s*=\\s*'+alias+'\\.project_id\\b').test(where)) return false
  if(!new RegExp('\\b'+alias+'\\.kind\\s*=\\s*\\\'reconcile\\\'').test(where)) return false
  if(!new RegExp('\\b'+alias+'\\.state\\s*=\\s*\\\'open\\\'').test(where)) return false
  // An EXISTS lookup without an explicit return-false is only observation.
  if(match[1].startsWith('if')) {
    const after=sql.slice(sql.indexOf(match[0])+match[0].length)
    return /^\s*then\s+return\s+false\s*;/.test(after)
  }
  // AND NOT EXISTS must participate in the actual qualifying expression.
  return /\breturn\s+coalesce\s*\(/.test(sql)
}

describe('RED security contract #533 — an old unknown outcome must block every new device',()=>{
  const predicate="select 1 from public.local_text_incidents i where i.project_id=p_project and i.kind='reconcile' and i.state='open'"
  it('recognizes denial without treating mere observation as a fence',()=>{
    expect(hasOpenIncidentDeny('if exists('+predicate+') then return false; end if;')).toBe(true)
    expect(hasOpenIncidentDeny('return coalesce((select true where true and not exists('+predicate+')),false);')).toBe(true)
    expect(hasOpenIncidentDeny('if exists('+predicate+') then return true; end if;')).toBe(false)
    expect(hasOpenIncidentDeny('if exists('+predicate+') then raise notice \'incident\'; end if;')).toBe(false)
  })
  it('rejects comments, wrong-project lookup and other incident kinds',()=>{
    expect(hasOpenIncidentDeny('-- if exists('+predicate+') then return false;')).toBe(false)
    expect(hasOpenIncidentDeny('if exists('+predicate.replace('i.project_id=p_project','i.project_id=other_project')+') then return false;')).toBe(false)
    expect(hasOpenIncidentDeny('if exists('+predicate.replace("'reconcile'","'offline'")+') then return false;')).toBe(false)
    expect(hasOpenIncidentDeny('if exists('+predicate.replace("'open'","'resolved'")+') then return false;')).toBe(false)
  })
  it('fails against current main until an actually denying project incident guard is added',()=>{
    expect(hasOpenIncidentDeny(latestEligibleSql())).toBe(true)
  })
})
