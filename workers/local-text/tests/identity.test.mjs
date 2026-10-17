import {test} from 'node:test';import assert from 'node:assert/strict';import {verify,createPublicKey,randomUUID} from 'node:crypto';
const api=await import('../identity.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const contract=await import('../../../packages/local-text-contract/index.mjs');
test('windows_signature_verifies_in_node and private CNG export is denied',{skip:process.platform!=='win32'},async()=>{
 assert.equal(typeof api.createIdentity,'function','missing Windows CNG identity');
 const keyId=randomUUID(),name='Omnira-Atlas-LocalText-test-'+keyId;let created=false;
 try{
  const identity=await api.createIdentity(name);created=true;assert.equal(identity.keyId,keyId);
  const protection=await api.inspectIdentity(name);assert.equal(protection.machineKey,false);assert.equal(protection.privateExportDenied,true);assert.equal(protection.exportPolicy,'None');
  const issuedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+45000).toISOString();const body=Buffer.from('{"text":"Åsa"}');
  const unsigned={version:1,origin:'https://omnira.example',deviceId:randomUUID(),keyId,buildHash:'a'.repeat(64),counter:'1',nonce:randomUUID(),issuedAt,expiresAt,method:'POST',path:'/api/local-text/worker/enroll',bodySha256:contract.sha256(body)};
  const signed=await api.signEnvelope(unsigned,body,name);assert.equal(Buffer.from(signed.signature,'base64url').length,64);
  assert.equal(verify('sha256',contract.workerSigningPayload(unsigned),{key:createPublicKey({key:identity.publicJwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(signed.signature,'base64url')),true);
  assert.equal(verify('sha256',contract.workerSigningPayload({...unsigned,counter:'2'}),{key:createPublicKey({key:identity.publicJwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(signed.signature,'base64url')),false);
 }finally{if(created)await api.deleteTestIdentity(name);}
});
test('helper environment excludes cloud and connector credentials',()=>{
 assert.equal(typeof api.identityEnvironment,'function','missing restricted helper environment');
 const env=api.identityEnvironment({SystemRoot:'C:\\Windows',PATH:'C:\\Windows\\System32',OPENAI_API_KEY:'test-secret',SUPABASE_SERVICE_ROLE_KEY:'test-secret',ANTHROPIC_API_KEY:'test-secret',DESKTOP_COMMANDER_TOKEN:'test-secret'});
 assert.deepEqual(env,{SystemRoot:'C:\\Windows',PATH:'C:\\Windows\\System32'});
});
test('Windows helper native probes work with the restricted environment',{skip:process.platform!=='win32'},async()=>{
 const {execFile}=await import('node:child_process');const result=await new Promise((resolve,reject)=>{const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command','$null=& whoami.exe /user; if ($LASTEXITCODE -ne 0) {exit 1}; Write-Output "NATIVE_PROBE_OK"'],{env:api.identityEnvironment(),timeout:5000},(error,stdout)=>error?reject(error):resolve(stdout.trim()));child.stdin.end();});assert.equal(result,'NATIVE_PROBE_OK');
});
