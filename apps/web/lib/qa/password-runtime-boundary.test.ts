import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {createServer,type Server} from 'node:http'
import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {build} from 'esbuild'
import {chromium,type Browser,type BrowserContext,type Page} from '@playwright/test'

// Actual components, React SSR and Chromium. Only Supabase and Next navigation are
// test doubles; no real identity, password reset email, session or database exists.
const boundary=vi.hoisted(()=>({create:vi.fn(()=>{throw Error('SSR must not initialize auth')})}))
vi.mock('@/lib/supabase/client',()=>({createClient:boundary.create}))
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn()})}))
import ForgotPasswordPage from '@/app/(auth)/forgot-password/page'
import UpdatePasswordPage from '@/app/(auth)/update-password/page'

describe('password pages: real SSR without Supabase configuration',()=>{
  beforeEach(()=>{vi.stubGlobal('React',React);boundary.create.mockClear()})
  afterEach(()=>vi.unstubAllGlobals())
  it.each([['forgot',ForgotPasswordPage],['update',UpdatePasswordPage]] as const)('prerenders %s without creating a client',(_name,Component)=>{
    expect(renderToStaticMarkup(React.createElement(Component))).toContain('<div')
    expect(boundary.create).not.toHaveBeenCalled()
  })
})

describe('password runtime browser regressions with synthetic auth only',()=>{
  let server:Server,browser:Browser,context:BrowserContext,page:Page,origin:string
  let messages:string[],denied:string[]
  const canary='SYNTHETIC-PRIVATE-ERROR-MUST-NOT-ESCAPE'
  const web=resolve(__dirname,'../..')
  beforeAll(async()=>{
    const auth=`
      const call=(method,args)=>{window.__calls.push({method,args});return window.__case;};
      export function createClient(){
        const mode=call('create',[]);
        if(mode==='missing-config')throw Error('${canary}');
        return {auth:{
          async resetPasswordForEmail(email,options){
            const mode=call('reset',[email,options]);
            if(mode==='throw-reset')throw Error('${canary}');
            return {error:mode==='reject-reset'?{message:'Återställningen nekades.'}:null};
          },
          async exchangeCodeForSession(code){
            const mode=call('exchange',[code]);
            if(mode==='throw-exchange')throw Error('${canary}');
            return {data:{session:mode==='exchange'?{id:'synthetic-session'}:null},error:mode==='exchange'?null:{message:'synthetic consumed code'}};
          },
          async getSession(){
            const mode=call('session',[]);
            if(mode==='throw-session')throw Error('${canary}');
            return {data:{session:['no-session','expired-code','session-error'].includes(mode)?null:{id:'synthetic-session'}},error:mode==='session-error'?{message:'${canary}'}:null};
          },
          async updateUser(value){
            const mode=call('update',[value]);
            if(mode==='throw-update')throw Error('${canary}');
            return {error:mode==='reject-update'?{message:'Sessionen har upphört.'}:null};
          }
        }};
      }`
    const result=await build({absWorkingDir:web,bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',logLevel:'silent',
      define:{'process.env.NODE_ENV':'"test"'},stdin:{resolveDir:web,loader:'tsx',contents:`
        import React from 'react';import {createRoot} from 'react-dom/client';
        import Forgot from './app/(auth)/forgot-password/page';import Update from './app/(auth)/update-password/page';
        window.__case=new URLSearchParams(location.search).get('case')||'session';
        window.__calls=[];window.__redirects=[];window.__router={replace:path=>window.__redirects.push(path)};
        createRoot(document.getElementById('root')).render(React.createElement(location.pathname==='/forgot-password'?Forgot:Update));`},
      plugins:[{name:'owned-auth-test-boundaries',setup(b){
        b.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'auth',namespace:'fixture'}))
        b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'fixture'}))
        b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='auth'?auth:'export const useRouter=()=>window.__router;',loader:'js'}))
        b.onResolve({filter:/^@\//},args=>{
          const base=resolve(web,args.path.slice(2)),path=[base+'.ts',base+'.tsx',base+'/index.ts'].find(existsSync)
          if(!path)throw Error('Unresolved owned fixture module')
          return {path}
        })
      }}]})
    const script=result.outputFiles[0].text
    server=createServer((request,response)=>{
      if(request.url?.startsWith('/app.js')){response.setHeader('content-type','application/javascript');response.end(script);return}
      response.setHeader('content-type','text/html; charset=utf-8')
      response.end('<!doctype html><html><body><div id="root"></div><script src="/app.js" defer></script></body></html>')
    })
    await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok))
    const address=server.address();if(!address||typeof address==='string')throw Error('Missing local fixture address')
    origin='http://127.0.0.1:'+address.port
    // GitHub-hosted Ubuntu supplies Chrome; neither download a browser nor skip tests.
    const systemChrome=process.env.HARVEY_PASSWORD_USE_SYSTEM_CHROME==='true'||!existsSync(chromium.executablePath())
    browser=await chromium.launch({headless:true,...(systemChrome?{channel:'chrome' as const}:{})})
  },60000)
  afterAll(async()=>{await browser?.close();if(server)await new Promise<void>((ok,no)=>server.close(error=>error?no(error):ok()))})
  beforeEach(async()=>{
    messages=[];denied=[];context=await browser.newContext()
    await context.route('**/*',route=>{
      if(new URL(route.request().url()).origin===origin)return route.continue()
      denied.push(new URL(route.request().url()).origin);return route.abort('blockedbyclient')
    })
    page=await context.newPage()
    page.on('console',message=>messages.push(message.text()));page.on('pageerror',error=>messages.push(error.message))
  })
  afterEach(async()=>{
    try{expect(messages.join('\n')).not.toContain(canary);expect(await page.content()).not.toContain(canary);expect(denied).toEqual([])}
    finally{await context.close()}
  })
  const visit=async(path:string,mode='session',extra='')=>{await page.goto(origin+path+'?case='+mode+extra);await page.locator('#root > div').waitFor({state:'attached'})}
  const calls=async(method:string)=>page.evaluate(method=>(window as any).__calls.filter((call:any)=>call.method===method),method)
  const redirects=()=>page.evaluate(()=>(window as any).__redirects)
  const passwords=async(password='synthetic-password',confirm=password)=>{
    await page.locator('#password').fill(password);await page.locator('#confirm-password').fill(confirm)
    await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  }
  const waitForm=()=>page.locator('#password').waitFor()

  it('creates forgot-password auth only on submit, preserving the exact recovery destination',async()=>{
    await visit('/forgot-password');expect(await calls('create')).toHaveLength(0)
    await page.locator('#email').fill('test@example.invalid');await page.getByRole('button').click()
    await page.getByText('Kolla din inbox').waitFor()
    expect(await calls('reset')).toEqual([{method:'reset',args:['test@example.invalid',{redirectTo:origin+'/update-password'}]}])
  })
  it.each(['missing-config','throw-reset'])('fails closed on %s without exposing SDK details',async mode=>{
    await visit('/forgot-password',mode);await page.locator('#email').fill('test@example.invalid');await page.getByRole('button').click()
    await page.getByText('Det gick inte att begära lösenordsåterställning. Försök igen senare.').waitFor()
    expect(await page.getByRole('button').isEnabled()).toBe(true);expect(await page.getByText('Kolla din inbox').count()).toBe(0)
    if(mode==='missing-config')expect(await calls('reset')).toHaveLength(0)
  })
  it('handles an explicit reset rejection without displaying success',async()=>{
    await visit('/forgot-password','reject-reset');await page.locator('#email').fill('test@example.invalid');await page.getByRole('button').click()
    await page.getByText('Återställningen nekades.').waitFor();expect(await page.getByRole('button').isEnabled()).toBe(true)
  })
  it('accepts manual PKCE exchange, updates password and preserves an allowed redirect',async()=>{
    await visit('/update-password','exchange','&code=synthetic-code&next=%2Fatlas');await waitForm()
    expect(await calls('exchange')).toEqual([{method:'exchange',args:['synthetic-code']}]);expect(await calls('session')).toHaveLength(0)
    await passwords();await page.getByText('Lösenord uppdaterat').waitFor()
    await vi.waitFor(async()=>expect(await redirects()).toEqual(['/atlas']),{timeout:5000})
    expect(await calls('update')).toHaveLength(1)
  })
  it('preserves auto-consumed PKCE fallback to an existing session',async()=>{
    await visit('/update-password','session','&code=synthetic-consumed-code');await waitForm()
    expect(await calls('exchange')).toHaveLength(1);expect(await calls('session')).toHaveLength(1)
  })
  it('keeps one runtime client across input rerenders for an existing session',async()=>{
    await visit('/update-password');await waitForm();await page.locator('#password').fill('synthetic-password')
    await page.locator('#confirm-password').fill('synthetic-password');expect(await calls('create')).toHaveLength(1)
  })
  it.each([['no-session',''],['expired-code','&code=synthetic-expired-code']])('rejects %s without revealing the form or updating',async(mode,extra)=>{
    await visit('/update-password',mode,extra);await vi.waitFor(async()=>expect(await redirects()).toEqual(['/login']))
    expect(await page.locator('#password').count()).toBe(0);expect(await calls('update')).toHaveLength(0)
  })
  it.each(['missing-config','throw-session','session-error','throw-exchange'])('fails closed during %s session setup',async mode=>{
    await visit('/update-password',mode,mode==='throw-exchange'?'&code=synthetic-code':'')
    await page.getByRole('alert').waitFor();expect(await page.locator('#password').count()).toBe(0);expect(await calls('update')).toHaveLength(0)
  })
  it.each([['short','short','Lösenordet måste vara minst 8 tecken.'],['synthetic-password','different-password','Lösenorden matchar inte.']])('rejects invalid password input %#',async(password,confirm,message)=>{
    await visit('/update-password');await waitForm();await passwords(password,confirm);await page.getByText(message).waitFor()
    expect(await calls('update')).toHaveLength(0)
  })
  it.each(['reject-update','throw-update'])('preserves failure handling for %s without redirecting or success',async mode=>{
    await visit('/update-password',mode);await waitForm();await passwords()
    await page.getByText(mode==='reject-update'?'Sessionen har upphört.':'Det gick inte att uppdatera lösenordet. Försök igen senare.').waitFor()
    expect(await page.getByRole('button').isEnabled()).toBe(true);expect(await redirects()).toEqual([])
    expect(await page.getByText('Lösenord uppdaterat').count()).toBe(0)
  })
  it.each(['https://example.invalid/steal','//example.invalid','javascript:alert(1)'])('rejects an external post-auth destination %#',async next=>{
    await visit('/update-password','session','&next='+encodeURIComponent(next));await waitForm();await passwords()
    await vi.waitFor(async()=>expect(await redirects()).toEqual(['/dashboard']),{timeout:5000})
  })
})
