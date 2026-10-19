import {it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
function run(args:string[]){return spawnSync(process.execPath,[resolve('../../node_modules/tsx/dist/cli.mjs'),'--tsconfig','scripts/tsconfig.operator.json','scripts/the-prompt-prepare-film.ts',...args],{cwd:process.cwd(),env:{NODE_ENV:'test',PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NO_COLOR:'1'},encoding:'utf8',timeout:15000})}
it('operator help requires no credentials or database access',()=>{const r=run(['--help']);expect(r.status).toBe(0);expect(r.stdout).toContain('Read-only film preparation');expect(r.stderr).toBe('')})
it.each([{args:['--apply']},{args:['--unknown','value']},{args:[]},{args:['--help','--apply']}])('operator refuses unsupported/incomplete arguments $args',({args})=>{const r=run(args);expect(r.status).toBe(1);expect(r.stderr.trim()).toBe('INVALID_BODY');expect(r.stdout).toBe('')})

import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const validArgs=['--project','a8a1b1f6-c222-4893-9399-b1fb3bc2fa52','--post','22222222-2222-4222-8222-222222222222','--revision','33333333-3333-4333-8333-333333333333','--sha256','a'.repeat(64),'--brief','not-a-file','--operator-jwt-file','not-a-token-file']
it.each(['--project','--post','--revision','--sha256'])('rejects malformed %s before reading files or credentials',flag=>{
 const args=[...validArgs];args[args.indexOf(flag)+1]='invalid'
 const r=run(args);expect(r.status).toBe(1);expect(r.stderr.trim()).toBe('INVALID_BODY');expect(r.stdout).toBe('')
})
it.each([{}, {kind:'the-prompt-film-brief-v1',rightsVerified:true}])('rejects malformed brief schema before reading credentials: %j',brief=>{
 const dir=mkdtempSync(join(tmpdir(),'omnira-film-cli-'))
 try{const path=join(dir,'brief.json');writeFileSync(path,JSON.stringify(brief));const args=[...validArgs];args[args.indexOf('--brief')+1]=path
 const r=run(args);expect(r.status).toBe(1);expect(r.stderr.trim()).toBe('INVALID_BODY');expect(r.stdout).toBe('')}
 finally{rmSync(dir,{recursive:true,force:true})}
})
