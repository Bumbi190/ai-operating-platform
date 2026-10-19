import {it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
function run(args:string[]){return spawnSync(process.execPath,[resolve('../../node_modules/tsx/dist/cli.mjs'),'--tsconfig','scripts/tsconfig.operator.json','scripts/the-prompt-prepare-film.ts',...args],{cwd:process.cwd(),env:{NODE_ENV:'test',PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NO_COLOR:'1'},encoding:'utf8',timeout:15000})}
it('operator help requires no credentials or database access',()=>{const r=run(['--help']);expect(r.status).toBe(0);expect(r.stdout).toContain('Read-only film preparation');expect(r.stderr).toBe('')})
it.each([{args:['--apply']},{args:['--unknown','value']},{args:[]},{args:['--help','--apply']}])('operator refuses unsupported/incomplete arguments $args',({args})=>{const r=run(args);expect(r.status).toBe(1);expect(r.stderr.trim()).toBe('INVALID_BODY');expect(r.stdout).toBe('')})
