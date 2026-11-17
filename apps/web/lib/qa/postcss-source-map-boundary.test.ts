import {afterEach,describe,expect,it} from 'vitest'
import {createRequire} from 'node:module'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const require=createRequire(import.meta.url)
const consumers=[
 ['app',require.resolve('postcss')],
 ['Next',createRequire(require.resolve('next/package.json')).resolve('postcss')],
 ['workspace',createRequire(new URL('../../../../package.json',import.meta.url)).resolve('postcss')],
] as const
const directories:string[]=[]
afterEach(()=>{for(const dir of directories.splice(0))rmSync(dir,{recursive:true,force:true})})
describe.each(consumers)('%s PostCSS treats untrusted CSS source maps as untrusted input',(_consumer,modulePath)=>{
 it('does not disclose an absolute external source map when from is unset',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'omnira-postcss-boundary-'));directories.push(dir)
  const marker='SYNTHETIC_MAP_CONTENT_MUST_STAY_LOCAL'
  const filename=join(dir,'outside.map')
  writeFileSync(filename,JSON.stringify({version:3,file:'source.css',sources:['input.scss'],sourcesContent:[marker],names:[],mappings:'AAAA'}))
  const postcss=require(modulePath)
  const input='a{color:red}/*# sourceMappingURL='+filename.replaceAll('\\','/')+' */'
  let output
  try{output=await postcss([]).process(input,{map:{inline:false,annotation:false}})}
  catch(error){expect(String(error)).not.toContain(marker);return}
  expect(output.css).toContain('a{color:red}')
  expect(output.map?.toString()??'').not.toContain(marker)
 })
 it('still processes owned CSS and emits a source map',async()=>{
  const postcss=require(modulePath)
  const output=await postcss([{postcssPlugin:'owned-test',Declaration(declaration:{prop:string;value:string}){if(declaration.prop==='color')declaration.value='blue'}}]).process('a{color:red}',{from:'owned.css',map:{inline:false,annotation:false}})
  expect(output.css).toBe('a{color:blue}')
  expect(output.map?.toJSON().sources).toEqual(['owned.css'])
 })
})
