// Attended integration checks against website-prospect-local.mjs only.
// The SCB receipt below is an explicit synthetic test fixture, never a real prospect.
import {chromium,expect} from '@playwright/test'
import {createHash,createHmac,randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs'
import {join,isAbsolute} from 'node:path'
import JSZip from 'jszip'

if(!process.argv.includes('--run-synthetic'))throw Error('Explicit --run-synthetic required')
const index=process.argv.indexOf('--directory'),directory=index>=0?process.argv[index+1]:null
if(!directory||!isAbsolute(directory))throw Error('Absolute local --directory required')
const state=JSON.parse(readFileSync(join(directory,'runtime-private.json'),'utf8'))
const base='http://localhost:56994',api='http://127.0.0.1:56993'
if(state.appOrigin!=='http://127.0.0.1:56994'||state.supabaseUrl!==api||!state.initialized||!/^omnira-etapp1-[0-9a-f-]{36}$/.test(state.stackId))throw Error('LOCAL_TARGET_REQUIRED')
const inspected=spawnSync('docker',['inspect',state.stackId+'-db'],{encoding:'utf8',timeout:10000})
if(inspected.status!==0||JSON.parse(inspected.stdout)[0].Config.Labels?.['omnira.etapp1.local']!==state.stackId)throw Error('OWNED_LOCAL_DATABASE_REQUIRED')
const receipt={version:1,startedAt:new Date().toISOString(),dataKind:'synthetic-integration-fixture',sourceSearch:'not exercised by this test',publicCaptureUrl:'https://example.com/',checks:[],completed:false,production:false,outreach:false}
const check=(name,ok)=>{receipt.checks.push({name,passed:Boolean(ok)});if(!ok)throw Error(name)}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let browser,page,stage='launch',model,projectId
const save=()=>writeFileSync(join(directory,'synthetic-integration-receipt.json'),JSON.stringify(receipt,null,2))
const key=()=>randomUUID()
try{
  const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  browser=await chromium.launch({headless:true,...(process.platform==='win32'&&existsSync(chrome)?{executablePath:chrome}:{})})
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  await context.route('**/*',route=>{const u=new URL(route.request().url());return [base,api].includes(u.origin)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort()})
  page=await context.newPage();page.setDefaultTimeout(20000)
  receipt.failedRequests=[]
  page.on('requestfailed',r=>{if(receipt.failedRequests.length<12)receipt.failedRequests.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText})})
  stage='real_login';await page.goto(base+'/build/prospects');await expect(page).toHaveURL(/\/login/)
  await page.locator('input[name="email"]').fill(state.users[0].email)
  await page.locator('input[name="password"]').fill(state.password)
  await page.locator('button[type="submit"]').click()
  await expect(page).not.toHaveURL(/\/login/,{timeout:60000})
  check('real_browser_password_login',(await context.cookies()).some(c=>c.name.startsWith('sb-')))
  async function request(path,body,expected=200){
    const response=await page.request.fetch(base+path,{method:body?'POST':'GET',headers:body?{origin:base,'content-type':'application/json'}:{},...(body?{data:body}:{}),timeout:100000})
    const data=await response.json()
    if(response.status()!==expected){receipt.httpFailure={path,status:response.status(),code:data.code??data.error??null};throw Error('HTTP_STATUS_'+response.status())}
    return data
  }
  stage='create_fixture_project'
  const workspace=await request('/api/website-build/studio',{kind:'new',name:'Etapp 1 – syntetiskt integrationstest',idempotencyKey:key()},201)
  projectId=workspace.projectId;receipt.projectId=projectId
  check('existing_studio_creates_owned_project',typeof projectId==='string')
  await request('/api/website-build/studio/budget',{projectId,monthlySek:0,expectedMonthlySek:null,idempotencyKey:key()})
  check('existing_budget_gate_configured_zero',true)
  const root='/api/website-build/prospects',query='?'+new URLSearchParams({projectId})
  const initial=await request(root+query)
  check('real_local_capture_available',initial.captureAvailable===true)
  receipt.scbSearchAvailable=initial.searchAvailable
  const company={source:'scb',sourceId:'scb/10000001',sourceUrl:'https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/',retrievedAt:new Date().toISOString(),name:'SYNTETISKT TEST – inte ett verkligt prospekt',branchName:'Automatiskt integrationstest',orgnr:'5568357585',cfar:'10000001',city:'Hässleholm',municipalityCode:'1293',sniCodes:['47.811','46.711'],restricted:true,inactive:false}
  const payload=Buffer.from(JSON.stringify({company,userId:state.users[0].id,projectId,expiresAt:Date.now()+30*60*1000})).toString('base64url')
  const sourceReceipt=payload+'.'+createHmac('sha256',state.serviceKey).update('omnira:prospect:scb:v1\0').update(payload).digest('base64url')
  stage='create_synthetic_prospect'
  await request(root,{action:'create',projectId,sourceReceipt:'invalid',idempotencyKey:key()},400)
  check('unsigned_company_receipt_refused',true)
  model=await request(root,{action:'create',projectId,sourceReceipt,idempotencyKey:key()},201)
  const endpoint=root+'/'+model.prospect.prospectId;receipt.prospectId=model.prospect.prospectId
  const firstRevision=model.prospect.revisionId
  const reopened=await request(endpoint+query)
  check('jsonb_roundtrip_keeps_revision_hash',reopened.prospect.sha256===model.prospect.sha256&&reopened.prospect.revisionId===firstRevision)
  async function change(action,extra={},expected=200){const result=await request(endpoint,{action,projectId,expectedRevisionId:model.prospect.revisionId,idempotencyKey:key(),...extra},expected);if(expected===200)model=result;return result}
  await change('approve',{sha256:model.prospect.sha256},409);check('incomplete_prospect_cannot_be_approved',true)
  stage='save_website';await change('website',{url:'https://example.com/'})
  await request(endpoint,{action:'website',projectId,expectedRevisionId:firstRevision,idempotencyKey:key(),url:'https://example.org/'},409)
  check('stale_revision_write_refused',true)
  stage='real_public_site_capture';save();await change('capture')
  check('actual_desktop_mobile_capture_saved',model.prospect.content.capture.images.length===2&&model.prospect.content.capture.engine==='playwright')
  for(const item of model.prospect.content.capture.images){
    const response=await page.request.get(base+endpoint+'/assets/'+item.assetId+query)
    check('private_'+item.viewport+'_bytes_match_asset',response.status()===200&&hash(await response.body())===item.sha256)
  }
  check('three_observed_suggestions',model.suggestions.length===3)
  await change('improvements',{improvements:model.suggestions.slice(0,2)},400)
  check('two_improvements_refused',true)
  const invented=structuredClone(model.suggestions);invented[0].observationIds=['invented-observation']
  await change('improvements',{improvements:invented},400);check('invented_observation_refused',true)
  stage='save_three_improvements';await change('improvements',{improvements:model.suggestions})
  stage='create_company_specific_mockups';await change('design')
  check('three_company_specific_mockups',model.plan.designReview.options.length===3)
  const oldPlan=model.plan
  await request('/api/website-build-plans',{projectId,conversationId:oldPlan.conversationId,expectedRevisionId:oldPlan.currentRevision.revisionId,idempotencyKey:key(),content:{...oldPlan.currentRevision.content,design:{...oldPlan.currentRevision.content.design,style:'Changed outside the prospect by the fixture owner'}}},201)
  model=await request(endpoint+query)
  check('external_plan_edit_invalidates_design',model.designStale===true&&!model.readiness.ready)
  await change('design')
  check('stale_design_can_be_regenerated',model.designStale===false&&model.plan.ref.planId!==oldPlan.ref.planId&&model.plan.currentRevision.content.design.style!=='Changed outside the prospect by the fixture owner')
  const option=model.plan.designReview.options[1]
  const preview=await page.request.get(base+endpoint+'/preview?'+new URLSearchParams({projectId,mockupId:option.id}))
  const mockupHtml=await preview.text();check('mockup_has_fixture_identity',preview.status()===200&&mockupHtml.includes(company.name))
  stage='approve_mockup_and_build';await change('build',{mockupId:option.id,mockupSha256:option.sha256},202)
  let built=false
  for(let n=0;n<60;n++){
    const response=await page.request.post(base+endpoint,{headers:{origin:base},data:{action:'sync-build',projectId,expectedRevisionId:model.prospect.revisionId,idempotencyKey:key()},timeout:30000})
    const data=await response.json()
    if(response.status()===200){model=data;built=true;break}
    if(data.code!=='PROSPECT_BUILD_PENDING'){receipt.buildFailure={status:response.status(),code:data.code??data.error};break}
    await sleep(2000)
  }
  check('canonical_worker_completed_concept',built&&Boolean(model.prospect.content.build))
  stage='verify_export'
  const exported=await page.request.get(base+endpoint+'/export'+query),zipBytes=await exported.body()
  check('existing_export_succeeds',exported.status()===200&&exported.headers()['x-content-sha256']===hash(zipBytes))
  const repeated=await page.request.get(base+endpoint+'/export'+query)
  check('export_checksum_survives_repeat_download',hash(await repeated.body())===hash(zipBytes))
  const zip=await JSZip.loadAsync(zipBytes),indexFile=Object.keys(zip.files).find(p=>/(^|\/)dist\/index.html$/.test(p))
  check('static_export_has_homepage',Boolean(indexFile))
  const html=await zip.file(indexFile).async('string')
  receipt.exportSha256=hash(zipBytes);receipt.artifactSha256=model.prospect.content.build.sha256
  // Keep the synthetic ZIP locally for offline packaging checks, never in the repository.
  const evidenceDirectory=join(directory,'synthetic-evidence');mkdirSync(evidenceDirectory,{recursive:true})
  writeFileSync(join(evidenceDirectory,'concept-export.zip'),zipBytes)
  check('export_contains_company_and_noindex',html.includes(company.name)&&html.includes('noindex'))
  stage='desktop_and_mobile_preview'
  const images=join(directory,'synthetic-evidence');mkdirSync(images,{recursive:true})
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});await page.goto(base+endpoint+'/preview'+query+'&kind=build')
    await expect(page.locator('h1')).toHaveCount(1)
    const metrics=await page.evaluate(()=>({width:innerWidth,documentWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),description:document.querySelectorAll('meta[name="description"]').length,images:[...document.images].every(i=>i.complete&&i.naturalWidth>0)}))
    check('concept_'+width+'_renders_without_overflow',metrics.documentWidth<=metrics.width+1&&metrics.description===1&&metrics.images)
    await page.screenshot({path:join(images,'concept-'+width+'.png'),fullPage:true})
  }
  stage='prospect_board_reopen';await page.goto(base+'/build/prospects')
  await page.locator('div[class*="project"] select').selectOption(projectId)
  await page.getByRole('button',{name:new RegExp(company.name.split(' – ')[0])}).click()
  await expect(page.getByRole('heading',{name:'Konceptet är byggt',exact:true})).toBeVisible()
  check('saved_prospect_reopens_in_real_ui',true)
  const boardMetrics=await page.evaluate(()=>({viewport:innerWidth,contentWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)}))
  check('prospect_board_390_no_horizontal_overflow',boardMetrics.contentWidth<=boardMetrics.viewport+1)
  await page.screenshot({path:join(images,'prospect-board-mobile.png'),fullPage:true})
  const read=await request(endpoint+query)
  check('demo_and_human_review_still_required',!read.readiness.ready&&read.prospect.content.demo===null&&read.prospect.approval===null)
  stage='foreign_owner_boundaries'
  const other=await browser.newContext(),foreign=await other.newPage();await foreign.goto(base+'/login')
  await foreign.locator('input[name="email"]').fill(state.users[1].email);await foreign.locator('input[name="password"]').fill(state.password);await foreign.locator('button[type="submit"]').click();await expect(foreign).not.toHaveURL(/\/login/,{timeout:60000})
  check('foreign_owner_cannot_read_prospect',(await foreign.request.get(base+endpoint+query)).status()===404)
  const asset=model.prospect.content.capture.images[0]
  check('foreign_owner_cannot_read_capture',(await foreign.request.get(base+endpoint+'/assets/'+asset.assetId+query)).status()===404)
  const denied=await page.request.post(base+endpoint,{headers:{origin:'https://foreign.example'},data:{action:'approve',projectId,expectedRevisionId:model.prospect.revisionId,sha256:model.prospect.sha256,idempotencyKey:key()}})
  check('cross_origin_mutation_refused',denied.status()===403)
  receipt.completed=true
}catch(error){
  receipt.failure={stage,message:String(error?.message??'INTEGRATION_FAILED').replace(/(?:eyJ|sb_secret_)[A-Za-z0-9_.-]+/g,'[redacted]').slice(0,800)}
  if(page){
    await page.locator('input[name="password"]').fill('').catch(()=>{})
    receipt.pageDiagnostics=await page.evaluate(()=>({path:location.pathname,stylesheets:[...document.styleSheets].map(s=>s.href),orb:[...document.images].filter(i=>i.className.includes('orbImage')).map(i=>({pointerEvents:getComputedStyle(i).pointerEvents,position:getComputedStyle(i).position,width:i.getBoundingClientRect().width})),alerts:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent)})).catch(()=>null)
    await page.screenshot({path:join(directory,'integration-failure.png'),fullPage:true}).catch(()=>{})
  }
  process.exitCode=1
}
finally{receipt.finishedAt=new Date().toISOString();save();await browser?.close();console.log(JSON.stringify(receipt,null,2))}
