import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
it('classifies the real social launch API as a private owned user boundary',()=>{
 const manifest=JSON.parse(readFileSync(resolve(process.cwd(),'tests/isolation/route-manifest.json'),'utf8'))
 const entries=manifest.routes.filter((r:{path:string})=>r.path==='/social-launch')
 expect(entries).toHaveLength(1)
 expect(entries[0]).toMatchObject({class:'U',auth:'User',serviceRole:true,scope:'project_id',killSwitch:'na',verified:true})
 const route=readFileSync(resolve(process.cwd(),'app/api/social-launch/route.ts'),'utf8')
 expect(route).toContain('export const GET=socialLaunchApi');expect(route).toContain('export const POST=socialLaunchApi')
})
