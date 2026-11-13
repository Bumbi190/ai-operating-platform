import {test} from 'node:test'
import assert from 'node:assert/strict'
import {request} from 'node:http'
import {isPublicAddress,publicTarget,publicAddress,startCaptureProxy} from './website-prospect-network.mjs'
test('capture DNS boundary rejects private, loopback, metadata, reserved and mapped addresses',()=>{
  for(const value of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','0.0.0.0','198.18.0.1','192.0.2.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::1','::ffff:127.0.0.1'])assert.equal(isPublicAddress(value),false,value)
  assert.equal(isPublicAddress('93.184.216.34'),true)
})
test('non-web schemes, credentials, explicit ports and IP literals are rejected before DNS',()=>{
  for(const value of ['file:///a','http://127.0.0.1','http://2130706433','http://0x7f000001','http://[::1]','https://u:p@dealer.se','https://dealer.se:444','http://a.internal/'])assert.throws(()=>publicTarget(value))
})
test('mixed public/private DNS answers fail closed; the selected address is pinned',async()=>{
  await assert.rejects(publicAddress('dealer.se',async()=>[{address:'93.184.216.34'},{address:'10.0.0.1'}]))
  assert.equal(await publicAddress('dealer.se',async()=>[{address:'93.184.216.34'}]),'93.184.216.34')
})
test('actual proxy refuses a private HTTP target and a private CONNECT target',async()=>{
  const proxy=await startCaptureProxy()
  try{
    const status=await new Promise((resolve,reject)=>{const req=request(proxy.url,{path:'http://127.0.0.1:80/',method:'GET'},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end()})
    assert.equal(status,403)
    const connected=await new Promise((resolve,reject)=>{const req=request(proxy.url,{method:'CONNECT',path:'127.0.0.1:443'});req.on('connect',(res,socket)=>{socket.destroy();resolve(res.statusCode)});req.on('error',reject);req.end()})
    assert.equal(connected,403)
  }finally{await proxy.close()}
})
