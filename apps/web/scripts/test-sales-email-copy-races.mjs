import {spawn} from 'node:child_process'
import {readFileSync} from 'node:fs'
export async function emailCopyRaces({container,db,sql}){
 const source=readFileSync(new URL('../supabase/tests/sales_email_copy.sql',import.meta.url),'utf8')
 sql(source.split('set local role service_role;')[0]+'commit;')
 const principal=JSON.parse(source.match(/p jsonb:='([^']+)'/)[1]),seed=JSON.parse(source.match(/v jsonb:='([^']+)'/)[1])
 const q=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb"
 const offer={projectId:seed.projectId,id:'40000000-0000-4000-8000-000000000901',senderEmail:'info@example.se',offerText:'Sex månader kostnadsfritt.',freeMonths:6,productFacts:['Verifierat fixtureunderlag.'],confirmed:true}
 sql('set role service_role;select sales_save_offer('+q(principal)+','+q(offer)+');')
 const initial=JSON.parse(sql('set role service_role;select sales_email_copy_save('+q(principal)+','+q(seed)+');').trim())
 const before=JSON.parse(sql("select jsonb_build_object('contacts',(select md5(jsonb_agg(to_jsonb(c) order by id)::text) from sales_contacts c),'jobs',(select count(*) from sales_jobs),'sends',(select count(*) from sales_send_jobs));"))
 const concurrent=input=>new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',code=>resolve({code,out,err,input}));p.stdin.end('set role service_role;select sales_email_copy_save('+q(principal)+','+q(input)+');')})
 const inputs=[1,2].map(n=>({...seed,expectedPreviousId:initial.id,idempotencyKey:'80000000-0000-4000-8000-00000000090'+n,body:'Concurrent copy '+n}))
 const result=await Promise.all(inputs.map(concurrent)),winner=result.find(r=>r.code===0)
 if(result.filter(r=>r.code===0).length!==1||result.filter(r=>r.err.includes('REVISION_CONFLICT')).length!==1)throw Error('COPY_CAS_RACE')
 const id=JSON.parse(winner.out.trim()).id,retries=await Promise.all([1,2,3].map(()=>concurrent(winner.input)))
 if(retries.some(r=>r.code!==0||JSON.parse(r.out.trim()).id!==id))throw Error('COPY_RETRY_RACE')
 const after=JSON.parse(sql("select jsonb_build_object('contacts',(select md5(jsonb_agg(to_jsonb(c) order by id)::text) from sales_contacts c),'jobs',(select count(*) from sales_jobs),'sends',(select count(*) from sales_send_jobs));"))
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('COPY_RACE_CHANGED_CONTACTS_OR_JOBS')
 if(JSON.parse(sql("select to_jsonb(count(*)) from sales_email_copy_revisions;"))!==2)throw Error('COPY_RACE_DUPLICATE_VERSION')
 console.log('PASS email copy concurrent CAS has one winner; three response retries reuse one version; contacts and jobs unchanged')
}
