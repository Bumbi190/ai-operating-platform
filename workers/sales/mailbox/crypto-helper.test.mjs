import test from 'node:test'
import assert from 'node:assert/strict'
import {webcrypto,createHash} from 'node:crypto'
import {handle} from './crypto-helper.mjs'
const context={projectId:'10000000-0000-4000-8000-000000000001',workerId:'60000000-0000-4000-8000-000000000001',mailboxId:'80000000-0000-4000-8000-000000000001',setupId:'70000000-0000-4000-8000-000000000001',email:'info@example.se',expiresAt:'2099-10-17T13:00:00Z'}
async function seal(c,jwk,password){const subtle=webcrypto.subtle,label=new TextEncoder().encode(`OmniraSales/strato/v1\n${c.projectId}\n${c.workerId}\n${c.setupId}\n${c.kid}`),key=await subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']),iv=webcrypto.getRandomValues(new Uint8Array(12)),rsa=await subtle.importKey('jwk',jwk,{name:'RSA-OAEP',hash:'SHA-256'},false,['wrapKey']);return {format:'sales-strato-envelope-v1',wrappedKey:Buffer.from(await subtle.wrapKey('raw',key,rsa,{name:'RSA-OAEP',label})).toString('base64url'),iv:Buffer.from(iv).toString('base64url'),ciphertext:Buffer.from(await subtle.encrypt({name:'AES-GCM',iv,additionalData:label,tagLength:128},key,Buffer.from(JSON.stringify({email:c.email,password})))).toString('base64url')}}
test('real crypto interoperability and strict context/email/size checks',async()=>{
 const key=handle({action:'generate'});assert.ok(Buffer.byteLength(key.privateKey)<=2560);const pub=handle({action:'public',privateKey:key.privateKey});const c={...context,kid:pub.kid},password='synthetic Å🔑';const envelope=await seal(c,pub.jwk,password)
 assert.deepEqual(handle({action:'open',privateKey:key.privateKey,context:c,envelope}),{email:c.email,password})
 for(const field of ['projectId','workerId','setupId','kid','email'])assert.throws(()=>handle({action:'open',privateKey:key.privateKey,context:{...c,[field]:field==='email'?'other@example.se':'0'.repeat(64)},envelope}))
 for(const changed of [{...envelope,iv:envelope.iv+'='},{...envelope,ciphertext:'A'.repeat(6000)},{...envelope,wrappedKey:'AA'}])assert.throws(()=>handle({action:'open',privateKey:key.privateKey,context:c,envelope:changed}))
 assert.throws(()=>handle({action:'open',privateKey:'A'.repeat(2561),context:c,envelope}))
 for(const invalid of ['','\0bad','å'.repeat(1025)]){const sealed=await seal(c,pub.jwk,invalid);assert.throws(()=>handle({action:'open',privateKey:key.privateKey,context:c,envelope:sealed}))}
})
