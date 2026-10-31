const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createServer}=require('node:http')
const {spawn}=require('node:child_process')
const {mkdtemp,writeFile,readFile,rm}=require('node:fs/promises')
const {tmpdir}=require('node:os')
const {join}=require('node:path')
const {WebSocketServer}=require('ws')
test('blocks actual Node SDK, node-fetch, Edge, HTTP, HTTPS, redirect and WebSocket transports before connection',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'reference-guard-'))
 let forbiddenConnections=0
 const blocked=createServer((req,res)=>res.end('owned negative probe'));blocked.on('connection',()=>forbiddenConnections++)
 const allowed=createServer((req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{location:'http://127.0.0.1:'+blocked.address().port+'/redirect-target'}).end();return}
  res.setHeader('content-type','application/json');res.end(req.url.startsWith('/v1/messages')?'{"id":"fixture"}':'"owned"')
 })
 const ws=new WebSocketServer({server:allowed});ws.on('connection',socket=>socket.close())
 const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r))
 await listen(blocked);await listen(allowed)
 const good='http://127.0.0.1:'+allowed.address().port,bad='http://127.0.0.1:'+blocked.address().port
 const log=join(temp,'denied.log');await writeFile(log,'')
 const code=`
 const {EdgeRuntime}=require('next/dist/compiled/edge-runtime')
 const nodeFetch=require('node-fetch')
 const http=require('node:http'),https=require('node:https'),WS=require('ws')
 const Anthropic=require('@anthropic-ai/sdk').default
 const good=process.env.GOOD,bad=process.env.BAD,runtime=new EdgeRuntime()
 const edge=url=>runtime.evaluate('fetch('+JSON.stringify(url)+').then(r=>r.text())')
 const httpRead=(mod,url)=>new Promise((resolve,reject)=>{const r=mod.get(url,response=>{response.resume();response.on('end',resolve)});r.on('error',reject)})
 const socket=url=>new Promise((resolve,reject)=>{const ws=new WS(url);ws.once('open',()=>{ws.close();resolve()});ws.once('error',reject)})
 ;(async()=>{
 // Controls prove the real transports are available and receive allowed local bytes.
 if(await (await nodeFetch(good)).text()!=='"owned"')throw Error('node-fetch control')
 if(await edge(good)!=='"owned"')throw Error('Edge control')
 const sdk=new Anthropic({apiKey:'fixture',baseURL:good,maxRetries:0})
 if((await sdk.messages.create({model:'fixture',max_tokens:1,messages:[{role:'user',content:'synthetic'}]})).id!=='fixture')throw Error('SDK control')
 await httpRead(http,good);await socket(good.replace('http:','ws:'))
 const cases={
 native:()=>fetch(bad),nodeFetch:()=>nodeFetch(bad),edge:()=>edge(bad),
 sdk:()=>new Anthropic({apiKey:'fixture',baseURL:bad,maxRetries:0}).messages.create({model:'fixture',max_tokens:1,messages:[{role:'user',content:'synthetic'}]}),
 http:()=>httpRead(http,bad),https:()=>httpRead(https,bad.replace('http:','https:')),
 redirect:()=>nodeFetch(good+'/redirect'),edgeRedirect:()=>edge(good+'/redirect'),
 websocket:()=>socket(bad.replace('http:','ws:'))}
 const results={}
 for(const [name,run]of Object.entries(cases)){try{await run();results[name]=false}catch{results[name]=true}}
 process.stdout.write(JSON.stringify(results))
 })().catch(error=>{process.stderr.write(error.message);process.exitCode=1})
 `
 try{
  const child=spawn(process.execPath,['--require',join(__dirname,'fetch-guard.cjs'),'-e',code],{
   env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,GOOD:good,BAD:bad,ATLAS_REFERENCE_FETCH_ORIGINS:JSON.stringify([good]),ATLAS_REFERENCE_FETCH_DENIED:log},
   stdio:['ignore','pipe','pipe']})
  let output='',error='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>error+=x)
  const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})
  assert.equal(exit,0,error)
  const results=JSON.parse(output)
  assert.deepEqual(results,{native:true,nodeFetch:true,edge:true,sdk:true,http:true,https:true,redirect:true,edgeRedirect:true,websocket:true})
  assert.equal(forbiddenConnections,0,'No transport may connect even to the owned negative-probe server')
  assert.ok((await readFile(log,'utf8')).includes('127.0.0.1'))
 }finally{
  ws.close();allowed.closeAllConnections();blocked.closeAllConnections()
  await Promise.all([new Promise(r=>allowed.close(r)),new Promise(r=>blocked.close(r))])
  await rm(temp,{recursive:true,force:true})
 }
})
