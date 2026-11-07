import {beforeAll,describe,it,expect} from 'vitest'
import {build} from 'esbuild'
import {spawnSync} from 'node:child_process'
let code:string
beforeAll(async()=>{
 const result=await build({stdin:{contents:`export {isNavIntent} from './lib/atlas/nav-intent';export {isCalendarIntent} from './lib/calendar/atlas-tools';export {resolvePlanOperatorIntent} from './lib/website-build/planning/operator-intent'`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',
 plugins:[{name:'test-server-only',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}))}}]})
 code=result.outputFiles[0].text
})
describe('chat intent processing under adversarial repetition',()=>{
 // Run real bundled exports in a bounded subprocess so a regression cannot hang the test worker.
 it.each([
  ['calendar missing speaker',`isCalendarIntent('vad'.repeat(100000))`,false],
  ['calendar missing day',`isCalendarIntent('vad'+'jag'.repeat(100000))`,false],
  ['plan punctuation before a non-confirmation',`resolvePlanOperatorIntent('!'.repeat(300000)+'x',{})`,'ordinary_turn'],
  ['navigation with no destination',`isNavIntent('kan vi gå '+' '.repeat(300000))`,false],
 ])('%s finishes within the subprocess budget',(name,expression,want)=>{
  const result=spawnSync(process.execPath,[],{input:code+'\nprocess.stdout.write(JSON.stringify(module.exports.'+expression+'));',encoding:'utf8',timeout:3000,maxBuffer:1024*1024})
  expect(result.error?.message,name).toBeUndefined()
  expect(result.status,result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toBe(want)
 },10000)
})
