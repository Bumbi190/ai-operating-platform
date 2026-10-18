import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
export const DIGEST='a'.repeat(64);
export const JOB={version:1,jobId:'e4c307d1-56cf-4d52-8592-c0dfbb149837',taskType:'classify',text:'Bil säljes.',labels:['bil','annat']};
export const SNAPSHOT={candidateId:'qwen3:8b',modelDigest:DIGEST,serverVersion:'0.40.5',supportsNoThink:true,quantization:'Q4_K_M'};
export async function fixture(t, handler) {
  const server=http.createServer(handler); const sockets=new Set(); server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));});
  return server.address().port;
}
export async function temp(t) {const d=await mkdtemp(path.join(tmpdir(),'atlas-local-'));t.after(()=>rm(d,{recursive:true,force:true}));return d;}
export function ollamaFixture(onChat=()=>({label:'bil'}), mutate=()=>{}) {
  return async(req,res)=>{
    let raw='';for await(const c of req)raw+=c; const body=raw?JSON.parse(raw):{};
    const table={ '/api/version':{version:'0.40.5'}, '/api/tags':{models:[{name:'qwen3:8b',digest:DIGEST}]}, '/api/show':{capabilities:['completion','thinking'],details:{quantization_level:'Q4_K_M',format:'gguf'}}, '/api/ps':{models:[]} };
    let value=table[req.url];
    if(req.url==='/api/chat') {const content=await onChat(body,req,res);if(res.writableEnded)return;value={model:'qwen3:8b',done:true,done_reason:'stop',message:{role:'assistant',content:JSON.stringify(content)},eval_count:10,prompt_eval_count:20};}
    mutate(req.url,value);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
  };
}
