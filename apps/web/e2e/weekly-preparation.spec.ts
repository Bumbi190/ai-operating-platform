import {test,expect} from '@playwright/test';
import {contentFixture} from './social-content-fixture';
test('weekly drafts need native editorial review before a separate schedule proposal',async({page})=>{
 await page.clock.install({time:new Date('2026-10-26T10:00:00Z')});
 const model:any=contentFixture('77cda551-57c9-4dc0-b019-1bb6438777f7');model.project.name='Familje-Stunden';model.plannedChannels=[{channel:'facebook',format:'image',purpose:'Family',cadence:'twice_weekly'}];
 const id='10000000-0000-4000-8000-000000000001',rev='20000000-0000-4000-8000-000000000001';
 model.posts=[{id,status:'proposal',decision:null,requirements:[],revision:{id:rev,sequence:1,sha256:'a'.repeat(64),planRevisionId:model.currentPlanRevisionId,draft:{channel:'facebook',format:'image',title:'Atlas veckoförslag',text:'En färgstark lövstund tillsammans.',linkUrl:null,mediaIds:[id],mediaBrief:'Befintlig godkänd lövbild',scheduledAt:'2026-11-03T16:00:00.000Z'},media:[{id,kind:'image',sha256:'b'.repeat(64),mimeType:'image/jpeg',width:320,height:400}],binding:{id,accountId:'12345',label:'Familjekontot'},createdAt:'2026-10-26T10:00:00Z'}}];
 const operations:string[]=[];
 await page.route('**/api/social-content?**',r=>r.fulfill({json:model}));
 await page.route('**/api/social-content',r=>{const body=r.request().postDataJSON();operations.push(body.operation);expect(body.revisionId).toBe(rev);expect(body.sha256).toBe('a'.repeat(64));model.posts[0].status='approved';model.posts[0].decision={id,decision:'approve',revisionId:rev,sha256:'a'.repeat(64),decidedAt:'2026-10-26T10:00:00Z'};return r.fulfill({json:model})});
 await page.route('**/api/social-schedules?**',r=>r.fulfill({json:{projectId:model.project.id,batches:[],monthlyRule:null,monthlySlots:[],releaseEvidence:[],canManage:true,dispatchEnabled:true}}));
 await page.route('**/api/social-schedules',r=>{const body=r.request().postDataJSON();operations.push(body.operation);expect(body.operation).toBe('propose');expect(body.manifest.items[0].revisionId).toBe(rev);return r.fulfill({status:503,json:{code:'UNAVAILABLE'}})});
 await page.route('**/api/social-publications?**',r=>r.fulfill({json:{projectId:model.project.id,postId:id,publication:null,target:null,canRequest:false,blockers:[]}}));
 await page.route('**/api/social-content/media?**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')}));
 await page.goto('/weekly-review');await page.getByRole('button',{name:'Atlas veckoförslag',exact:true}).click();
 await expect(page.getByText('En färgstark lövstund tillsammans.',{exact:true})).toBeVisible();
 await page.getByText('Förbered en vecka från granskade utkast',{exact:true}).click();
 await expect(page.getByText('Sätt önskad tid i utkastet och granska innehållet. Då kan det väljas här.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Godkänn innehållet',exact:true}).click();
 await page.getByRole('checkbox',{name:/Atlas veckoförslag/}).check();
 await page.getByRole('button',{name:'Förbered valda inlägg för granskning'}).click();
 await expect.poll(()=>operations).toEqual(['decide','propose']);
});

