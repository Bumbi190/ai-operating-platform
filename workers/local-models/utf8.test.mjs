import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {createLoopbackTransport} from './transport.mjs';import {main} from './cli.mjs';
const bad=Buffer.concat([Buffer.from('{"value":"'),Buffer.from([0xc3,0x28]),Buffer.from('"}')]);
test('fatal_utf8_rejects_replacement in loopback responses',async()=>{
 const server=http.createServer((_req,res)=>{res.writeHead(200);res.end(bad);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await assert.rejects(createLoopbackTransport(server.address().port)({path:'/api/version'}),e=>e.code==='INVALID_UTF8'&&e.complete===true);}finally{await new Promise(r=>server.close(r));}
});
test('fatal_utf8_rejects_replacement in stdin before any network',async()=>{
 const bytes=Buffer.concat([Buffer.from('{"version":1,"jobId":"a9048e1d-b7cb-46fc-8f7d-bc6b65e314e7","taskType":"extract","text":"'),Buffer.from([0xc3,0x28]),Buffer.from('"}')]);
 await assert.rejects(main(['run','--candidate','qwen3:8b'],(async function*(){yield bytes;})()),e=>e.code==='INVALID_UTF8');
});
