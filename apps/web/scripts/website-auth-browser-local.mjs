// Test-only host browser. Real login/Studio UI, cookies, Next routes and owned local backend.
import {chromium,expect} from '@playwright/test';
export async function runBrowserAcceptance({password,a,b,ready}){
 const base='http://127.0.0.1:54394',api='http://127.0.0.1:54393',checks=[];
 let browser,stage='launch',page;const authStatuses=[];let studioState=null;
 const check=(name,ok)=>{checks.push({name,passed:Boolean(ok)});if(!ok)throw Error(name);};
 try{
  browser=await chromium.launch({headless:true});
  const contexts=[];
  const context=async()=>{
   const c=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(c);
   await c.route('**/*',route=>{const u=new URL(route.request().url());return [base,api].includes(u.origin)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
   return c;
  };
  const owner=await context();page=await owner.newPage();page.on('response',r=>{if(r.url().includes('/auth/v1/token'))authStatuses.push(r.status());});
  page.setDefaultTimeout(15000);
  stage='unauthenticated_redirect';await page.goto(base+'/build');await expect(page).toHaveURL(/\/login/);check(stage,true);
  stage='incorrect_password';await page.locator('input[name="email"]').fill(a.email);await page.locator('input[name="password"]').fill('incorrect-synthetic-password');
  await page.locator('button[type="submit"]').click();await expect(page.getByText(/Fel e-post eller/)).toBeVisible();check(stage,true);
  stage='password_login';await page.locator('input[name="password"]').fill(password);await page.locator('button[type="submit"]').click();
  await expect(page.getByRole('heading',{name:'Bygg med Atlas',exact:true})).toBeVisible({timeout:30000});check(stage,true);
  check('browser_received_auth_cookie',(await owner.cookies()).some(c=>c.name.startsWith('sb-')));
  const target=base+'/build?'+new URLSearchParams({project:ready.projectSlug,conversation:ready.conversationId,session:ready.sessionId});
  stage='owner_studio_state';await page.goto(target);await expect(page.getByRole('heading',{name:'Bygg med Atlas',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Arkitekturplan',exact:true})).toHaveCount(1);
  const modelResponse=await page.request.get(base+'/api/website-build/studio'+new URL(target).search),model=await modelResponse.json();
  studioState={http:modelResponse.status(),state:model.state,conversation:model.conversation?.state};
  check('browser_studio_model_ready',modelResponse.status()===200&&model.state==='ok'&&model.session?.status==='ready'&&model.selected?.slug===ready.projectSlug);check(stage,true);
  stage='owner_reload';await page.reload();await expect(page.getByRole('region',{name:'Arkitekturplan',exact:true})).toHaveCount(1);check(stage,true);
  for(const width of [1440,390]){
   stage='studio_viewport_'+width;await page.setViewportSize({width,height:900});
   if(width===390)await page.getByRole('tab',{name:'Preview',exact:true}).click();
   await expect(page.getByRole('region',{name:'Preview',exact:true})).toBeVisible();
   await expect(page.locator('iframe').first()).toBeVisible();
   await expect(page.frameLocator('iframe').first().locator('h1').first()).toBeVisible();
   check(stage,true);
  }
  await page.setViewportSize({width:1440,height:900});
  stage='browser_refresh';
  const cookies=(await owner.cookies()).filter(c=>c.name.startsWith('sb-')),name=cookies[0].name.replace(/\.\d+$/,'');
  const old=cookies.sort((a,b)=>a.name.localeCompare(b.name)).map(c=>c.value).join('');
  if(!old.startsWith('base64-'))throw Error('UNEXPECTED_SSR_COOKIE');
  const session=JSON.parse(Buffer.from(old.slice(7),'base64url').toString('utf8'));session.expires_at=Math.floor(Date.now()/1000)-60;
  const stale='base64-'+Buffer.from(JSON.stringify(session)).toString('base64url');
  await owner.clearCookies();const chunks=Array.from({length:Math.ceil(stale.length/3000)},(_,i)=>({name:stale.length<=3000?name:name+'.'+i,value:stale.slice(i*3000,(i+1)*3000),domain:'127.0.0.1',path:'/',sameSite:'Lax'}));await owner.addCookies(chunks);
  await page.goto(target);await expect(page.getByRole('heading',{name:'Bygg med Atlas',exact:true})).toBeVisible();
  // Middleware refresh is server-side, so cookie rotation/persistence is the browser-visible contract.
  const after=(await owner.cookies()).filter(c=>c.name===name||c.name.startsWith(name+'.')).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>c.value).join('');
  check('browser_refresh_cookie_rotated',after.length>0&&after!==stale);
  await page.reload();await expect(page.getByRole('region',{name:'Arkitekturplan',exact:true})).toHaveCount(1);check('browser_refreshed_session_survives_reload',true);
  stage='foreign_browser_login';const other=await context(),foreign=await other.newPage();foreign.setDefaultTimeout(15000);await foreign.goto(base+'/login');
  await foreign.locator('input[name="email"]').fill(b.email);await foreign.locator('input[name="password"]').fill(password);await foreign.locator('button[type="submit"]').click();await expect(foreign.getByRole('heading',{name:'Bygg med Atlas',exact:true})).toBeVisible({timeout:30000});check(stage,true);
  stage='foreign_studio_hidden';const response=await foreign.goto(target);check(stage,response?.status()===404);
  return {completed:true,checks};
 }catch(error){
  return {completed:false,checks,failure:stage,pagePath:page?new URL(page.url()).pathname:null,authStatuses,studioState};
 }finally{if(browser)await browser.close();}
}
