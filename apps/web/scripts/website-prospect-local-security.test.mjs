import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,rmSync,renameSync,writeFileSync,readFileSync,linkSync,unlinkSync,symlinkSync,openSync,closeSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createServer} from 'node:http'
import {once} from 'node:events'
import * as storage from './customer-storage-stack.mjs'
import childProcess,{spawn} from 'node:child_process'
import {syncBuiltinESMExports} from 'node:module'

// No Docker, hosted endpoints, real credentials, app startup or DB writes.
if(process.platform!=='win32'){
  test('unsupported platforms refuse private I/O and credential transport before creating files',async()=>{
    const directory=path.join(tmpdir(),'omnira-unsupported-'+process.pid+'-'+Date.now())
    assert.equal(existsSync(directory),false)
    await assert.rejects(storage.openPrivateLocalDirectory(directory,{create:true}))
    await assert.rejects(storage.localProspectRequest('create-user',{privateFiles:{},serviceKey:'synthetic',password:'synthetic',email:'webbuilder-review@omnira.local'}))
    assert.equal(existsSync(directory),false)
  })
}else test('private local state and credential transport boundaries',async t=>{
  assert.equal(typeof storage.openPrivateLocalDirectory,'function','A pathname check/read is not a guarded directory capability')
  assert.equal(typeof storage.localProspectRequest,'function')
  const base=mkdtempSync(path.join(tmpdir(),'omnira-private-io-'))
  const root=path.join(base,'approved'),outside=path.join(base,'outside')
  const files=await storage.openPrivateLocalDirectory(root,{create:true})
  t.after(async()=>{await files.close();rmSync(base,{recursive:true,force:true})})
  const normal=JSON.stringify({version:1,password:'synthetic-only-password'})
  const canary='SYNTHETIC_OUTSIDE_NEVER_READ'
  const outsideFiles=await storage.openPrivateLocalDirectory(outside,{create:true})
  try{await outsideFiles.write('runtime-private.json',canary,{exclusive:true})}finally{await outsideFiles.close()}

  await t.test('normal create/read/update and private log append use the held directory',async()=>{
    assert.equal(await files.read('runtime-private.json'),null)
    await files.write('runtime-private.json',normal,{exclusive:true})
    assert.equal(await files.read('runtime-private.json'),normal)
    await assert.rejects(files.write('runtime-private.json','overwrite',{exclusive:true}))
    assert.equal(await files.read('runtime-private.json'),normal)
    const log=files.log();log.end('synthetic local log\n');await once(log,'finish')
    assert.equal(readFileSync(path.join(root,'next-local.log'),'utf8'),'synthetic local log\n')
  })
  await t.test('existing Node-created owner/session files work; an added foreign reader is denied',async()=>{
    const target=path.join(root,'stack-private.json')
    writeFileSync(target,'synthetic legacy file',{mode:0o600})
    assert.equal(await files.read('stack-private.json'),'synthetic legacy file')
    await files.write('stack-private.json','updated owner/session file')
    assert.equal(await files.read('stack-private.json'),'updated owner/session file')
    const script="$p='"+target.replaceAll("'","''")+"';$a=Get-Acl -LiteralPath $p;$sid=[System.Security.Principal.SecurityIdentifier]::new('S-1-1-0');$a.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid,[System.Security.AccessControl.FileSystemRights]::Read,[System.Security.AccessControl.AccessControlType]::Allow));Set-Acl -LiteralPath $p -AclObject $a"
    const changed=childProcess.spawnSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'ignore'})
    assert.equal(changed.status,0)
    await assert.rejects(files.read('stack-private.json'))
    await assert.rejects(files.write('stack-private.json','must not overwrite'))
    assert.equal(readFileSync(target,'utf8'),'updated owner/session file')
    unlinkSync(target)
  })
  await t.test('traversal, absolute paths, alternate streams and non-allowlisted files never return bytes',async()=>{
    for(const name of ['../outside/runtime-private.json',path.join(outside,'runtime-private.json'),'runtime-private.json:stream','.env','id_rsa','scb.env/../runtime-private.json']){
      await assert.rejects(files.read(name));await assert.rejects(files.write(name,'bad'))
    }
    assert.equal(readFileSync(path.join(outside,'runtime-private.json'),'utf8'),canary)
  })
  await t.test('an existing Windows junction cannot grant access outside the root',async()=>{
    const junction=path.join(base,'junction');symlinkSync(outside,junction,'junction')
    await assert.rejects(storage.openPrivateLocalDirectory(junction))
    const nested=path.join(root,'nested');symlinkSync(outside,nested,'junction')
    await assert.rejects(storage.openPrivateLocalDirectory(nested))
    assert.equal(readFileSync(path.join(outside,'runtime-private.json'),'utf8'),canary)
  })
  await t.test('directory/junction replacement cannot redirect an established capability',async()=>{
    let moved=false
    try{renameSync(root,root+'-moved');moved=true}catch{}
    if(moved)symlinkSync(outside,root,'junction')
    try{
      assert.equal(await files.read('runtime-private.json'),normal)
      await files.write('runtime-receipt.json','safe original directory')
      assert.equal(readFileSync(path.join(moved?root+'-moved':root,'runtime-receipt.json'),'utf8'),'safe original directory')
      assert.equal(readFileSync(path.join(outside,'runtime-private.json'),'utf8'),canary)
    }finally{if(moved){unlinkSync(root);renameSync(root+'-moved',root)}}
    const parent=path.join(base,'parent'),child=path.join(parent,'child')
    const pinned=await storage.openPrivateLocalDirectory(child,{create:true})
    await pinned.write('runtime-private.json','original child',{exclusive:true})
    let parentMoved=false
    try{renameSync(parent,parent+'-moved');parentMoved=true}catch{}
    if(parentMoved)symlinkSync(outside,parent,'junction')
    try{assert.equal(await pinned.read('runtime-private.json'),'original child')}
    finally{await pinned.close();if(parentMoved){unlinkSync(parent);renameSync(parent+'-moved',parent)}}
  })
  await t.test('a final-file hardlink is neither read nor overwritten',async()=>{
    const name=path.join(root,'stack-private.json')
    linkSync(path.join(outside,'runtime-private.json'),name)
    await assert.rejects(files.read('stack-private.json'))
    await assert.rejects(files.write('stack-private.json','bad'))
    assert.equal(readFileSync(path.join(outside,'runtime-private.json'),'utf8'),canary)
    unlinkSync(name)
  })
  await t.test('a directory masquerading as a state file and a concurrently writable file are denied',async()=>{
    mkdirSync(path.join(root,'stack-private.json'))
    await assert.rejects(files.read('stack-private.json'))
    rmSync(path.join(root,'stack-private.json'),{recursive:true})
    const writer=openSync(path.join(root,'runtime-private.json'),'r+')
    try{await assert.rejects(files.read('runtime-private.json'));await assert.rejects(files.write('runtime-private.json','bad'))}finally{closeSync(writer)}
    assert.equal(await files.read('runtime-private.json'),normal)
  })
  await t.test('final-file symbolic links and adversarial file replacements never disclose the outside file',async()=>{
    const target=path.join(root,'stack-private.json')
    symlinkSync(path.join(outside,'runtime-private.json'),target,'file')
    await assert.rejects(files.read('stack-private.json'));await assert.rejects(files.write('stack-private.json','bad'))
    unlinkSync(target)
    await files.write('stack-private.json','original-safe-file',{exclusive:true})
    const attacker=spawn(process.execPath,['-e',`const fs=require('fs');const p=process.argv[1],canary=process.argv[2];const until=Date.now()+1500;while(Date.now()<until){try{fs.renameSync(p,p+'.held');fs.linkSync(canary,p);fs.unlinkSync(p);fs.renameSync(p+'.held',p)}catch{try{if(fs.existsSync(p+'.held')){try{fs.unlinkSync(p)}catch{}fs.renameSync(p+'.held',p)}}catch{}}}`,target,path.join(outside,'runtime-private.json')],{stdio:'ignore',windowsHide:true})
    const stopped=once(attacker,'exit')
    for(let n=0;n<100;n++){
      let data
      try{data=await files.read('stack-private.json')}catch{continue}
      assert.ok(data===null||data==='original-safe-file','Outside bytes crossed the file boundary')
    }
    await stopped
    assert.equal(readFileSync(path.join(outside,'runtime-private.json'),'utf8'),canary)
    rmSync(target,{force:true});rmSync(target+'.held',{force:true})
  })
  await t.test('actual starter and storage helper reject malformed private state before any service startup',async()=>{
    const invalid=path.join(base,'invalid-state')
    const state=await storage.openPrivateLocalDirectory(invalid,{create:true})
    await state.write('runtime-private.json','{"password":"SYNTHETIC_MUST_NOT_LOG",broken',{exclusive:true})
    await state.write('stack-private.json','{"secret":"SYNTHETIC_MUST_NOT_LOG",broken',{exclusive:true})
    await state.close()
    const {startLocalProspect}=await import('./website-prospect-local.mjs')
    await assert.rejects(startLocalProspect(['--start','--directory',invalid]),e=>!e.message.includes('SYNTHETIC_MUST_NOT_LOG'))
    await assert.rejects(storage.startCmsStorageStack('http://127.0.0.1:56994',{persistentPath:path.join(invalid,'stack-private.json'),applicationDatabase:true,gatewayPort:56993}),e=>!e.message.includes('SYNTHETIC_MUST_NOT_LOG'))
  })
  await t.test('the storage helper uses the same held directory after a normal-directory replacement, before Docker',async()=>{
    await files.write('stack-private.json','{"original":"malformed"')
    writeFileSync(path.join(outside,'stack-private.json'),JSON.stringify({version:1,id:'omnira-etapp1-11111111-1111-4111-8111-111111111111',siteOrigin:'http://127.0.0.1:56994',password:'a'.repeat(64),secret:'b'.repeat(96)}))
    const originalSpawn=childProcess.spawnSync;let docker=0,moved=false,replaced=false
    childProcess.spawnSync=(...args)=>{if(args[0]==='docker'){docker++;throw Error('Docker must never run in this test')}return originalSpawn(...args)}
    syncBuiltinESMExports()
    try{
      // The pathname may already name a different directory; the capability
      // remains authoritative even when the OS itself prevents a rename.
      await assert.rejects(storage.startCmsStorageStack('http://127.0.0.1:56994',{privateFiles:files,persistentPath:path.join(outside,'stack-private.json'),applicationDatabase:true,gatewayPort:56993}),e=>e.message==='INVALID_LOCAL_STACK_STATE')
      assert.equal(docker,0,'A different pathname bypassed the held directory')
      try{renameSync(root,root+'-held');moved=true}catch{}
      if(moved){renameSync(outside,root);replaced=true}
      await assert.rejects(storage.startCmsStorageStack('http://127.0.0.1:56994',{privateFiles:files,persistentPath:path.join(root,'stack-private.json'),applicationDatabase:true,gatewayPort:56993}),e=>e.message==='INVALID_LOCAL_STACK_STATE')
      assert.equal(docker,0,'Unrelated replacement-directory metadata reached Docker')
      assert.equal(await files.read('runtime-private.json'),normal,'Helper closed or lost the caller capability')
    }finally{
      childProcess.spawnSync=originalSpawn;syncBuiltinESMExports()
      if(replaced)renameSync(root,outside)
      if(moved)renameSync(root+'-held',root)
      rmSync(path.join(root,'stack-private.json'),{force:true})
    }
  })
  await t.test('missing root, UNC/device/relative paths and oversized input fail closed',async()=>{
    for(const dir of [path.join(base,'missing'),'relative','\\\\server\\share','\\\\?\\C:\\private',root+'\\..\\outside'])await assert.rejects(storage.openPrivateLocalDirectory(dir))
    await assert.rejects(files.write('stack-private.json','x'.repeat(1048577)))
    assert.equal(await files.read('stack-private.json'),null)
  })

  let authBehavior='ok',appBehavior='ok',unexpected=0,adminRequests=0,drainRequests=0
  const recipient=createServer((req,res)=>{unexpected++;req.resume();res.end('must not receive credentials')})
  recipient.listen(0,'127.0.0.1');await once(recipient,'listening')
  const attacker='http://127.0.0.1:'+recipient.address().port+'/stolen'
  const auth=createServer(async(req,res)=>{
    adminRequests++;assert.equal(req.url,'/auth/v1/admin/users');assert.equal(req.method,'POST')
    assert.equal(req.headers.apikey,'SYNTHETIC_LOCAL_SERVICE')
    let body='';for await(const chunk of req)body+=chunk
    assert.deepEqual(JSON.parse(body),{email:'webbuilder-review@omnira.local',password:'synthetic-only-password',email_confirm:true})
    if(authBehavior==='redirect'){res.writeHead(307,{location:attacker});res.end()}
    else if(authBehavior==='error'){res.writeHead(503);res.end('SYNTHETIC_SECRET_ERROR_MUST_NOT_LOG')}
    else if(authBehavior==='large'){res.end('x'.repeat(70000))}
    else{res.setHeader('content-type','application/json');res.end('{"id":"11111111-1111-4111-8111-111111111111","discarded":"not returned"}')}
  })
  const app=createServer((req,res)=>{
    if(req.url==='/api/runs/drain'){
      drainRequests++;assert.equal(req.headers.authorization,'Bearer '+'a'.repeat(64))
      if(appBehavior==='redirect'){res.writeHead(307,{location:attacker});res.end()}
      else{res.end('{}')}
    }else if(req.url==='/api/website-build-settings'){assert.equal(req.headers.authorization,undefined);res.writeHead(401);res.end()}
    else {unexpected++;res.end()}
  })
  t.after(async()=>{for(const server of [auth,app,recipient]){server.closeAllConnections();if(server.listening)await new Promise(r=>server.close(r))}})
  // Fixed production-script ports: if another app already owns one, this test
  // fails binding; it never probes or sends credentials to that existing app.
  auth.listen(56993,'127.0.0.1');await once(auth,'listening')
  app.listen(56994,'127.0.0.1');await once(app,'listening')
  const credentials={privateFiles:files,serviceKey:'SYNTHETIC_LOCAL_SERVICE',password:'synthetic-only-password',email:'webbuilder-review@omnira.local'}
  await t.test('legitimate local user creation, auth readiness and drain work',async()=>{
    assert.deepEqual(await storage.localProspectRequest('create-user',credentials),{id:'11111111-1111-4111-8111-111111111111'})
    assert.equal(await storage.localProspectRequest('ready',{privateFiles:files,expectedPid:process.pid}),true)
    assert.equal(await storage.localProspectRequest('drain',{privateFiles:files,expectedPid:process.pid,cronSecret:'a'.repeat(64)}),true)
    assert.equal(adminRequests,1);assert.equal(drainRequests,1)
  })
  await t.test('HTTP destinations cannot be supplied by CLI, file or request payload',async()=>{
    const count=adminRequests+drainRequests
    for(const kind of [attacker,'http://localhost:56993/auth/v1/admin/users','http://127.0.0.2:56993','http://127.0.0.1:1','//evil.invalid'])await assert.rejects(storage.localProspectRequest(kind,credentials))
    assert.equal(adminRequests+drainRequests,count);assert.equal(unexpected,0)
  })
  await t.test('a listener with the wrong expected process receives no HTTP headers or credentials',async()=>{
    const count=adminRequests+drainRequests
    await assert.rejects(storage.localProspectRequest('drain',{privateFiles:files,expectedPid:2147483000,cronSecret:'a'.repeat(64)}))
    assert.equal(adminRequests+drainRequests,count)
    await assert.rejects(storage.localProspectRequest('create-user',{...credentials,privateFiles:{}}))
    assert.equal(adminRequests+drainRequests,count)
  })
  await t.test('auth body and drain authorization are not forwarded on redirects',async()=>{
    authBehavior='redirect';appBehavior='redirect'
    await assert.rejects(storage.localProspectRequest('create-user',credentials))
    await assert.rejects(storage.localProspectRequest('drain',{privateFiles:files,expectedPid:process.pid,cronSecret:'a'.repeat(64)}))
    assert.equal(unexpected,0)
  })
  await t.test('HTTP errors, oversized responses and connection failure expose no credential or response data',async()=>{
    authBehavior='error'
    for(const behavior of ['error','large']){
      authBehavior=behavior
      await assert.rejects(storage.localProspectRequest('create-user',credentials),error=>!JSON.stringify(error,Object.getOwnPropertyNames(error)).includes('SYNTHETIC_')&&!error.message.includes(credentials.password))
    }
    auth.closeAllConnections();await new Promise(r=>auth.close(r))
    await assert.rejects(storage.localProspectRequest('create-user',credentials),error=>!error.message.includes(credentials.password))
    assert.equal(unexpected,0)
  })
  await t.test('a different process taking the approved auth port receives no credential request',async()=>{
    const rogue=spawn(process.execPath,['-e',`require('http').createServer((req,res)=>{process.send('credentials-received');res.end('{}')}).listen(56993,'127.0.0.1',()=>process.send('ready'))`],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']})
    let received=false;rogue.on('message',message=>{if(message==='credentials-received')received=true})
    const exited=once(rogue,'exit')
    try{
      const [ready]=await once(rogue,'message');assert.equal(ready,'ready')
      await assert.rejects(storage.localProspectRequest('create-user',credentials))
      assert.equal(received,false)
    }finally{rogue.kill();await exited}
  })
  await t.test('the started app may serve through its own child process',async()=>{
    app.closeAllConnections();await new Promise(r=>app.close(r))
    const worker=spawn(process.execPath,['-e',`require('http').createServer((req,res)=>{if(req.url==='/api/website-build-settings'){res.writeHead(401);res.end()}else if(req.url==='/api/runs/drain'&&req.headers.authorization==='Bearer '+'a'.repeat(64)){res.end('{}')}else{res.writeHead(403);res.end()}}).listen(56994,'127.0.0.1',()=>process.send('ready'))`],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']})
    const exited=once(worker,'exit')
    try{
      const [ready]=await once(worker,'message');assert.equal(ready,'ready')
      assert.equal(await storage.localProspectRequest('ready',{privateFiles:files,expectedPid:process.pid}),true)
      assert.equal(await storage.localProspectRequest('drain',{privateFiles:files,expectedPid:process.pid,cronSecret:'a'.repeat(64)}),true)
    }finally{worker.kill();await exited}
  })

})
