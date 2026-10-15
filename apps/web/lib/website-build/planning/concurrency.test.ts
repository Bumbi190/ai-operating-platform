import {approveTestMockup} from './test-fixture'
import {beforeAll,describe,it,expect} from 'vitest'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {initializeWorkerDb,resetWorkerDb,testSql,TEST_AGENT,TEST_PRINCIPAL,TEST_PROJECT} from '../test-db'
import {saveWebsitePlanRevision,approveWebsitePlan,startApprovedWebsitePlan,setProjectWebsiteBuilder} from './store'
let db:ReturnType<typeof initializeWorkerDb>
beforeAll(()=>{db=initializeWorkerDb();resetWorkerDb()})
const literal=(x:unknown)=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb"
describe('planning concurrency with two real SQL connections',()=>{
 it('both concurrent starts return the same committed session',async()=>{
  const database=process.env.WEBSITE_BUILD_TEST_DATABASE_NAME
  if(!/^website_test_[0-9]+$/.test(database||''))throw Error('Explicit owned test DB required')
  const c=randomUUID();testSql("insert into conversations(id,user_id,project_id) values('"+c+"','"+TEST_PRINCIPAL.userId+"','"+TEST_PROJECT+"');")
  await setProjectWebsiteBuilder(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,agentId:TEST_AGENT})
  const content={title:'Race',purpose:'Visa',audience:'Alla',pages:[{key:'index',title:'Hem',purpose:'Visa'}],design:{style:'Enkel',reference:null},features:[],architecture:'Statisk',steps:['Bygg'],domain:{registrar:'strato' as const,requestedName:null}}
  const plan=await saveWebsitePlanRevision(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,conversationId:c,expectedRevisionId:null,content,idempotencyKey:randomUUID()})
  await approveTestMockup(db,TEST_PRINCIPAL,plan)
  const d=await approveWebsitePlan(db,TEST_PRINCIPAL,{...plan.currentRevision,idempotencyKey:randomUUID()}),input={...plan.currentRevision,decisionId:d.id}
  const child=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',database!])
  let out='',err=''
  child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b)
  const completed=new Promise<void>((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(err)))})
  child.stdin.end("begin; set role service_role; select id from public.projects where id='"+TEST_PROJECT+"' for update; select id from website_build_plans where id='"+plan.ref.planId+"' for update; select pg_advisory_xact_lock(882015); select pg_sleep(1); select website_build_plan_start("+literal(TEST_PRINCIPAL)+","+literal(input)+"); commit;")
  let held=false
  for(let n=0;n<20;n++){if(testSql("select exists(select 1 from pg_locks where locktype='advisory' and objid=882015 and granted);")==='t'){held=true;break}await new Promise(resolve=>setTimeout(resolve,20))}
  expect(held).toBe(true)
  let second:Awaited<ReturnType<typeof startApprovedWebsitePlan>>|null=null
  try{second=await startApprovedWebsitePlan(db,TEST_PRINCIPAL,input)}finally{await completed}
  const first=JSON.parse(out.split('\n').find(s=>s.trim().startsWith('{'))!)
  expect(second?.sessionId).toBe(first.sessionId)
  expect(testSql("select count(*) from website_build_sessions where plan_decision_id='"+d.id+"';")).toBe('1')
  expect(testSql("select count(*) from runs where input->>'sessionId'='"+first.sessionId+"';")).toBe('1')
 },15000)
})
