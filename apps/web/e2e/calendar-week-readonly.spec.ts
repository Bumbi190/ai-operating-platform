import {test,expect} from '@playwright/test';

const owner='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
function calendar(available=true) {
 return {
  range:{fromDate:'2026-10-19',toDateExclusive:'2026-10-26',timeZone:'Europe/Stockholm'},
  projects:[{id:owner,name:'Ägarprojekt',color:'#b6ddeb'},{id:other,name:'Andra projektet',color:'#b892dd'}],
  entries:[{
   id:'manual:private',source:{kind:'manual',eventId:'private',version:1},
   title:'Privat bokning',projectId:null,status:'scheduled',editable:false,href:null,pendingChange:null,
   time:{kind:'timed',startUtc:'2026-10-19T07:00:00.000Z',endUtc:'2026-10-19T08:00:00.000Z',timeZone:'Europe/Stockholm'}
  }],
  unscheduledTasks:[
   {id:'task-owner',projectId:owner,title:'Granska hemsidan',status:'pending',source:'manual',createdAt:null},
   {id:'task-other',projectId:other,title:'Förbered kampanj',status:'pending',source:'manual',createdAt:null}
  ],
  availability:{manual:available,social:true,workflows:true,tasks:true},
  truncated:{manual:false,social:false,workflows:false,tasks:false}
 };
}
async function setup(page:any,request:any,available=true){
 await request.post('/_test/reset');
 const posts:string[]=[];
 page.on('request',(r:any)=>{if(r.method()==='POST'&&r.url().includes('/api/calendar'))posts.push(r.url());});
 await page.route('**/api/calendar?**',(route:any)=>route.fulfill({json:calendar(available)}));
 await page.goto('/calendar?week=2026-10-19');
 await expect(page.getByRole('heading',{name:'Kalender',exact:true})).toBeVisible();
 return posts;
}
function editor(page:any){
 return page.locator('details').filter({has:page.locator('summary').filter({hasText:'Förslag på veckoplan (granska först)'})});
}
async function openEditor(page:any){
 const e=editor(page);
 await expect(e).toHaveCount(1);
 await e.locator('summary').click();
 await expect(e.locator('summary')).toBeVisible();
 return e;
}

test('desktop: scoped local editing and preflight without booking or write requests',async({page,request})=>{
 await page.setViewportSize({width:1280,height:900});
 const posts=await setup(page,request);
 let e=await openEditor(page);
 await expect(e.getByText('Granska hemsidan')).toBeVisible();
 await expect(e.getByText('Förbered kampanj')).toBeVisible();
 await page.getByLabel('Visa i kalendern').selectOption(owner);
 e=await openEditor(page);
 await expect(e.getByText('Granska hemsidan')).toBeVisible();
 await expect(e.getByText('Förbered kampanj')).toHaveCount(0);
 await e.getByLabel('Flytta Granska hemsidan').fill('2026-10-20T11:00');
 await e.getByRole('button',{name:'Flytta förslag'}).click();
 await expect(e.getByRole('status').filter({hasText:'Förslaget ändrades bara här'})).toBeVisible();
 await e.getByRole('button',{name:'Kontrollera utkast (bokar inget)'}).click();
 await expect(e.getByRole('status').filter({hasText:'Förkontrollen hittade inga lokala konflikter'})).toBeVisible();
 expect(posts).toHaveLength(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(process.env.CALENDAR_WEEK_READONLY_SCREENSHOT_DIR) await page.screenshot({path:process.env.CALENDAR_WEEK_READONLY_SCREENSHOT_DIR+'/week-desktop-1280.png',fullPage:true});
});

test('mobile: private filter hides the editor and project filter remains scoped',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});
 const posts=await setup(page,request);
 let e=await openEditor(page);
 await expect(e.getByRole('button',{name:'Kontrollera utkast (bokar inget)'})).toBeVisible();
 await page.getByLabel('Visa i kalendern').selectOption('private');
 await expect(editor(page)).toHaveCount(0);
 await page.getByLabel('Visa i kalendern').selectOption(other);
 e=await openEditor(page);
 await expect(e.getByText('Förbered kampanj')).toBeVisible();
 await expect(e.getByText('Granska hemsidan')).toHaveCount(0);
 await e.getByLabel('Flytta Förbered kampanj').fill('2026-10-20T12:00');
 await e.getByRole('button',{name:'Flytta förslag'}).click();
 await expect(e.getByRole('status').filter({hasText:'Förslaget ändrades bara här'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(posts).toHaveLength(0);
 if(process.env.CALENDAR_WEEK_READONLY_SCREENSHOT_DIR) await page.screenshot({path:process.env.CALENDAR_WEEK_READONLY_SCREENSHOT_DIR+'/week-mobile-390.png',fullPage:true});
});

test('incomplete source: no edit or preflight controls',async({page,request})=>{
 await setup(page,request,false);
 const e=await openEditor(page);
 await expect(e.getByText('Planeringen är pausad eftersom kalenderns underlag är ofullständigt.')).toBeVisible();
 await expect(e.getByRole('button',{name:'Flytta förslag'})).toHaveCount(0);
 await expect(e.getByRole('button',{name:'Kontrollera utkast (bokar inget)'})).toHaveCount(0);
});
