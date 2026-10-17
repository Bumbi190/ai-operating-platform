import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './test-utils.mjs';
const mod=await import('./transport.mjs').catch(()=>({}));
test('direct loopback request handles JSON and ignores proxy environment',async t=>{
  const port=await fixture(t,(req,res)=>res.end(JSON.stringify({host:req.headers.host,url:req.url})));
  assert.equal(typeof mod.createLoopbackTransport,'function');
  const out=await mod.createLoopbackTransport(port)({path:'/api/version',method:'GET'});
  assert.equal(out.host,`127.0.0.1:${port}`);assert.equal(out.url,'/api/version');
});
test('headers do not disable total body deadline',async t=>{
  const port=await fixture(t,(_,res)=>{res.writeHead(200);res.write('{');});
  await assert.rejects(()=>mod.createLoopbackTransport(port)({path:'/api/chat',method:'POST',body:{},timeoutMs:60}),/LOCAL_TIMEOUT/);
});
test('caps actual UTF-8 response bytes without trusting content-length',async t=>{
  const port=await fixture(t,(_,res)=>res.end('å'.repeat(70000)));
  await assert.rejects(()=>mod.createLoopbackTransport(port)({path:'/api/chat',method:'POST',body:{}}),/RESPONSE_TOO_LARGE/);
});
test('redirects are rejected without a follow-up request',async t=>{
  let n=0;const port=await fixture(t,(_,res)=>{n++;res.writeHead(302,{location:'http://example.com/'});res.end();});
  await assert.rejects(()=>mod.createLoopbackTransport(port)({path:'/api/version'}),/HTTP_STATUS/);assert.equal(n,1);
});
test('unknown paths and oversize requested limits fail closed',async()=>{
  assert.throws(()=>mod.createLoopbackTransport(123)({path:'http://example.com'}),/INVALID_REQUEST/);
  assert.throws(()=>mod.createLoopbackTransport(123)({path:'/api/chat',maxBytes:131073}),/INVALID_REQUEST/);
});
test('caller abort destroys an in-flight response',async t=>{
  const port=await fixture(t,(_,res)=>res.write('{'));const ac=new AbortController();
  setTimeout(()=>ac.abort(),40);await assert.rejects(()=>mod.createLoopbackTransport(port)({path:'/api/chat',body:{},method:'POST',signal:ac.signal}),/LOCAL_ABORTED/);
});
