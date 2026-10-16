import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
it('classifies every project consent route as an owned operator boundary',()=>{
 const manifest=JSON.parse(readFileSync('tests/isolation/route-manifest.json','utf8'))
 for(const path of ['/social-connections','/social-connections/[provider]/start','/social-connections/[provider]/callback']){
  const rows=manifest.routes.filter((r:{path:string})=>r.path===path)
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({class:'U',auth:'User',serviceRole:true,scope:'project_id',killSwitch:'na',verified:true})
 }
})
