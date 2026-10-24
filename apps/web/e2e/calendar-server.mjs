import {createServer} from 'vite';
import {randomUUID} from 'node:crypto';
const testPort=Number(process.env.CALENDAR_TEST_PORT||54413);
const root=process.cwd(),users=new Map(),receipts=new Map();let social=true,saveError=false,readError=false,delayDate=null,delayMs=0,pending=false,workflowLinks=false,workflowState='waiting';
const zone='Europe/Stockholm',A='20000000-0000-4000-8000-000000000001';
const seedEvent=(id,title,time,extra={})=>({id,kind:'private',title,description:'',location:'',projectId:null,taskId:null,time,workStatus:null,version:1,status:'scheduled',createdAt:'2026-10-18T12:00:00.000Z',updatedAt:'2026-10-18T12:00:00.000Z',...extra});
const point=(start,end=null)=>({kind:'timed',startUtc:start,endUtc:end,timeZone:zone});
const empty=()=>new Map();
const calendarModel=(user,fromDate,toDateExclusive)=>({range:{fromDate,toDateExclusive,timeZone:zone},entries:[...(users.get(user)??empty()).values()].map(event=>({id:'manual:'+event.id,source:{kind:'manual',eventId:event.id,version:event.version},title:event.title,time:event.time,projectId:event.projectId,status:event.status,editable:true,href:null,pendingChange:null,manualEvent:event,...(event.workflowInstanceId?{linkedWorkflow:{instanceId:workflowState==='missing'?null:event.workflowInstanceId,title:'Familjestunden · 2026-11',tone:workflowState==='missing'?'review':workflowState,label:workflowState==='success'?'Flödet avslutat':workflowState==='review'?'Granskningssteg i flödet':workflowState==='missing'?'Flödet behöver kontrolleras':'Planeringsflöde',planningOnly:true,href:workflowState==='missing'?null:'/releases'}}:{})})).concat(pending?[{id:'social:family:post',source:{kind:'social',projectId:'10000000-0000-4000-8000-000000000001',postId:'10000000-0000-4000-8000-000000000006',revisionId:'10000000-0000-4000-8000-000000000007',sha256:'a'.repeat(64),jobId:'10000000-0000-4000-8000-000000000008'},title:'Familjeinlägg',time:point('2026-10-22T15:00:00.000Z'),projectId:'10000000-0000-4000-8000-000000000001',status:'queued',editable:true,href:'/projects/familje-stunden/social#content',pendingChange:{time:point('2026-10-23T15:00:00.000Z'),reviewHref:'/projects/familje-stunden/social#content'}}]:[]).filter(entry=>{const t=entry.time,date=utc=>new Intl.DateTimeFormat('sv-SE',{timeZone:zone}).format(new Date(utc));return t.kind==='all_day'?t.startDate<toDateExclusive&&t.endDateExclusive>fromDate:date(t.startUtc)<toDateExclusive&&(t.endUtc?date(t.endUtc)>=fromDate:date(t.startUtc)>=fromDate)}),unscheduledTasks:[],workflowOptions:workflowLinks&&workflowState!=='missing'&&user===A?[{id:'60000000-0000-4000-8000-000000000001',projectId:'10000000-0000-4000-8000-000000000001',title:'Familjestunden · 2026-11'}]:[],projects:pending||workflowLinks?[{id:'10000000-0000-4000-8000-000000000001',name:'Familje-Stunden',color:'#d5b185'}]:[],availability:{manual:true,social,workflows:workflowState!=='missing',tasks:true},truncated:{manual:false,social:false,workflows:false,tasks:false}});
const server=await createServer({root,configFile:false,appType:'custom',esbuild:{jsx:'automatic'},css:{postcss:{}},resolve:{alias:[{find:'@/lib/supabase/client',replacement:root+'/e2e/calendar-auth-fixture.ts'},{find:'@',replacement:root}]},server:{host:'127.0.0.1',port:testPort}});
const json=(res,body,status=200)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(body));};
const body=async req=>{let text='';for await(const part of req)text+=part;return JSON.parse(text||'{}');};
server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://127.0.0.1:'+testPort),user=/calendar_test_user=([a-f0-9-]+)/.exec(req.headers.cookie??'')?.[1]??A;
 if(url.pathname.startsWith('/_test/')){
  const input=await body(req);
  if(url.pathname==='/_test/reset'){users.clear();receipts.clear();pending=input.pending===true;workflowLinks=input.workflowLinks===true;workflowState='waiting';social=true;saveError=false;readError=false;delayDate=null;delayMs=0;res.setHeader('Set-Cookie','calendar_test_user='+A+'; Path=/');if(input.geometry){const events=empty();for(const event of [
   seedEvent('10000000-0000-4000-8000-000000000001','Heldag den 25:e',{kind:'all_day',startDate:'2026-10-25',endDateExclusive:'2026-10-26',timeZone:zone}),
   seedEvent('10000000-0000-4000-8000-000000000002','Nattarbete',point('2026-10-22T21:00:00.000Z','2026-10-23T01:00:00.000Z'),{kind:'work_block',workStatus:'planned'}),
   seedEvent('10000000-0000-4000-8000-000000000003','Punkt utan sluttid',point('2026-10-22T12:00:00.000Z')),
   seedEvent('10000000-0000-4000-8000-000000000004','Överlapp A',point('2026-10-22T13:00:00.000Z','2026-10-22T14:00:00.000Z')),
   seedEvent('10000000-0000-4000-8000-000000000005','Överlapp B',point('2026-10-22T13:30:00.000Z','2026-10-22T14:30:00.000Z'))
  ])events.set(event.id,event);users.set(A,events);}}
 if(url.pathname==='/_test/reset'&&input.demo){const events=empty();for(const event of [
 seedEvent('10000000-0000-4000-8000-000000000011','Veckoplanering med Atlas',point('2026-10-19T07:00:00.000Z','2026-10-19T08:00:00.000Z'),{kind:'work_block',workStatus:'planned',projectId:'10000000-0000-4000-8000-000000000001'}),
 seedEvent('10000000-0000-4000-8000-000000000012','Möte med Oscar',point('2026-10-22T12:00:00.000Z','2026-10-22T13:00:00.000Z')),
 seedEvent('10000000-0000-4000-8000-000000000013','Ledig dag',{kind:'all_day',startDate:'2026-10-25',endDateExclusive:'2026-10-26',timeZone:zone})
 ])events.set(event.id,event);users.set(A,events);}
 if(url.pathname==='/_test/workflow-state')workflowState=input.state;
 if(url.pathname==='/_test/errors'){social=input.social!==false;saveError=input.save===true;readError=input.read===true;}
  if(url.pathname==='/_test/delay'){delayDate=input.date;delayMs=input.ms??400;}
  return json(res,{ok:true});
 }
 if(url.pathname==='/api/calendar/production-start'){
  const input=await body(req);return json(res,input.operation==='status'?{ok:true,receipt:null}:{ok:false,code:'configuration'},input.operation==='status'?200:409);
 }
 if(url.pathname==='/api/calendar'){
  if(req.method==='GET'){
   const from=url.searchParams.get('fromDate'),to=url.searchParams.get('toDateExclusive'),snapshot=calendarModel(user,from,to);
   if(delayDate===from)await new Promise(resolve=>setTimeout(resolve,delayMs));
   return json(res,readError?{ok:false,code:'UNAVAILABLE'}:snapshot,readError?503:200);
  }
  if(req.method==='POST'){
   const input=await body(req);if(saveError)return json(res,{ok:false,code:'UNAVAILABLE'},503);
   const key=user+':'+input.idempotencyKey;if(receipts.has(key))return json(res,receipts.get(key));
   const events=users.get(user)??empty(),old=events.get(input.eventId);
   if(input.operation!=='create'&&(!old||old.version!==input.expectedVersion))return json(res,{ok:false,code:'CONFLICT'},409);
   const event=input.operation==='create'?seedEvent(input.eventId,input.draft.title,input.draft.time,input.draft):{...(input.operation==='update'?{...input.draft,id:old.id,createdAt:old.createdAt,updatedAt:old.updatedAt}:old),status:input.operation==='cancel'?'cancelled':input.operation==='restore'?'scheduled':old.status,version:old.version+1};
   events.set(event.id,event);users.set(user,events);const local=event.time.kind==='all_day'?event.time.startDate:new Intl.DateTimeFormat('sv-SE',{timeZone:zone}).format(new Date(event.time.startUtc));const d=new Date(local+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
   const receipt={ok:true,mutationId:randomUUID(),event,calendarHref:'/calendar?week='+d.toISOString().slice(0,10)};receipts.set(key,receipt);return json(res,receipt);
  }
 }
 if(req.method==='GET'&&url.pathname==='/calendar'){res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml(req.url,'<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>Omnira Kalender · förhandsvisning</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#07111b;color:#edf5fa;font-family:system-ui}*{box-sizing:border-box}button,input,select,textarea{font:inherit}</style></head><body><div id="root"></div><script type="module" src="/e2e/calendar-entry.tsx"></script></body></html>'));return;}
 next();
});
await server.listen();
