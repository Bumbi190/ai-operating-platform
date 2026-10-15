import {approveTestMockup} from './test-fixture'
import {beforeAll,it,expect} from 'vitest'
import JSZip from 'jszip'
import {initializeWorkerDb,testSql,TEST_PROJECT,TEST_PRINCIPAL,TEST_AGENT} from '../test-db'
import {saveWebsitePlanRevision,setProjectWebsiteBuilder,approveWebsitePlan,startApprovedWebsitePlan,setOperatorProjectRoot,readProjectWebsiteBuilder} from './store'
import {exportWebsiteProject} from '../project-export'
import {compileWebsiteArtifact} from '../artifact'
let db:ReturnType<typeof initializeWorkerDb>;beforeAll(()=>{db=initializeWorkerDb()})
it('a newer unapproved plan and changed default directory cannot rewrite the exported approved project',async()=>{
 const conversationId=crypto.randomUUID();testSql("insert into conversations(id,user_id,project_id) values('"+conversationId+"','"+TEST_PRINCIPAL.userId+"','"+TEST_PROJECT+"');")
 await setProjectWebsiteBuilder(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,agentId:TEST_AGENT})
 const original={title:'Godkänd originalplan',purpose:'Visa caféet',audience:'Gäster',pages:[{key:'index',title:'Hem',purpose:'Visa'}],design:{style:'Lugn',reference:null},features:[],architecture:'Statisk',steps:['Bygg'],domain:{registrar:'strato' as const,requestedName:'original.se'}}
 const plan=await saveWebsitePlanRevision(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,conversationId,expectedRevisionId:null,content:original,idempotencyKey:crypto.randomUUID()})
 await approveTestMockup(db,TEST_PRINCIPAL,plan)
 const decision=await approveWebsitePlan(db,TEST_PRINCIPAL,{...plan.currentRevision,idempotencyKey:crypto.randomUUID()})
 const session=await startApprovedWebsitePlan(db,TEST_PRINCIPAL,{...plan.currentRevision,decisionId:decision.id})
 const artifact=compileWebsiteArtifact({format:'static-website.v1',title:'Webb',pages:[{key:'index',title:'Hem',bodyHtml:'<h1>Original</h1>',css:'',behaviors:[]}]})
 testSql("update runs set status='running',claim_id=gen_random_uuid(),lease_until=now()+interval '5 minutes' where id=(select current_run_id from website_build_sessions where id='"+session.sessionId+"');")
 const writer=JSON.parse(testSql("select jsonb_build_object('projectId',s.project_id,'sessionId',s.id,'runId',r.id,'claimId',r.claim_id,'generation',s.generation,'designVersion',1) from website_build_sessions s join runs r on r.id=s.current_run_id where s.id='"+session.sessionId+"';"))
 const revision=JSON.parse(testSql("select website_build_commit_revision('"+JSON.stringify(writer)+"','"+JSON.stringify(artifact).replaceAll("'","''")+"');"))
 await saveWebsitePlanRevision(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,conversationId,planId:plan.ref.planId,expectedRevisionId:plan.currentRevision.revisionId,content:{...original,title:'Ny ej godkänd plan'},idempotencyKey:crypto.randomUUID()})
 const before=await readProjectWebsiteBuilder(db,TEST_PRINCIPAL,TEST_PROJECT)
 await setOperatorProjectRoot(db,TEST_PRINCIPAL,{os:'windows',root:'D:\\Nya projekt',targetId:null})
 expect((await readProjectWebsiteBuilder(db,TEST_PRINCIPAL,TEST_PROJECT)).location).toEqual(before.location)
 const zip=await JSZip.loadAsync(await exportWebsiteProject(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,sessionId:session.sessionId},revision.id,artifact))
 const base=Object.keys(zip.files).find(p=>p.endsWith('/project.json'))!.replace(/project\.json$/,'')
 const pinned=JSON.parse(await zip.file(base+'plans/v1.json')!.async('string')),manifest=JSON.parse(await zip.file(base+'project.json')!.async('string'))
 expect(pinned.content.title).toBe(original.title);expect(pinned.sha256).toBe(plan.currentRevision.sha256);expect(zip.file(base+'plans/v2.json')).toBeNull()
 expect(manifest.plan.number).toBe(1);expect(manifest.location).toEqual(before.location);expect(manifest.physicalDirectoryCreated).toBe(false)
 await expect(exportWebsiteProject(db,{...TEST_PRINCIPAL,userId:'20000000-0000-4000-8000-000000000002'},{projectId:TEST_PROJECT,sessionId:session.sessionId},revision.id,artifact)).rejects.toMatchObject({code:'NOT_FOUND'})
})
