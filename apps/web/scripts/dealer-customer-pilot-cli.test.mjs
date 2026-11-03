import assert from 'node:assert/strict'
import {access, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises'
import net from 'node:net'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {Duplex,PassThrough} from 'node:stream'
import test from 'node:test'
import {createPilotControl, pilotTarget, requestPilotStop, reservePilotFiles} from './dealer-customer-pilot.mjs'

test('serve and stop share a private directory per allowed port', () => {
  const home=tmpdir()
  const original=pilotTarget(['--serve'],home)
  assert.equal(original.localUrl,'http://127.0.0.1:19996')
  assert.equal(original.qaPath,path.join(home,'Omnira','WebStudio','kundadmin-prov'))
  assert.equal(pilotTarget(['--stop'],home).controlFile,original.controlFile)
  assert.equal(pilotTarget(['--test'],home).mode,'--test')
  const parallel=pilotTarget(['--serve','--port','19997'],home)
  assert.equal(parallel.localUrl,'http://127.0.0.1:19997')
  assert.equal(parallel.qaPath,path.join(home,'Omnira','WebStudio','kundadmin-prov-19997'))
  assert.equal(parallel.accessFile,path.join(parallel.qaPath,'Testinloggning.txt'))
  assert.equal(pilotTarget(['--stop','--port','19997'],home).controlFile,parallel.controlFile)
  assert.equal(pilotTarget(['--serve','--port','19996'],home).accessFile,original.accessFile)
})

test('invalid arguments cannot select a network endpoint or state path', () => {
  for(const args of [[],['--unknown'],['--test','--port','19997'],['--serve','--port'],
    ['--serve','--port','65535'],['--stop','--port','019997'],['--stop','--port','19997','extra'],
    ['--serve','--port','../kundadmin-prov'],['--serve','--host','localhost'],['--port','19997','--serve']]){
    assert.throws(()=>pilotTarget(args,tmpdir()),/Usage/)
  }
})

test('a rehearsal reserves both private files exclusively and removes only its own files', async t => {
  const home=await mkdtemp(path.join(tmpdir(),'dealer-pilot-cli-'))
  t.after(()=>rm(home,{recursive:true,force:true}))
  const target=pilotTarget(['--serve','--port','19997'],home)
  const owner=await reservePilotFiles(target)
  await owner.control.writeFile('fixture control')
  await owner.access.writeFile('fixture access')
  await assert.rejects(reservePilotFiles(target),{code:'EEXIST'})
  assert.equal(await readFile(target.controlFile,'utf8'),'fixture control')
  assert.equal(await readFile(target.accessFile,'utf8'),'fixture access')
  await owner.release()
  await assert.rejects(access(target.controlFile),{code:'ENOENT'})
  await writeFile(target.accessFile,'pre-existing access')
  await assert.rejects(reservePilotFiles(target),{code:'EEXIST'})
  await assert.rejects(access(target.controlFile),{code:'ENOENT'})
  assert.equal(await readFile(target.accessFile,'utf8'),'pre-existing access')
  await rm(target.accessFile)
  const next=await reservePilotFiles(target)
  await rename(target.accessFile,path.join(target.qaPath,'old-access'))
  await writeFile(target.accessFile,'replacement')
  await next.release()
  assert.equal(await readFile(target.accessFile,'utf8'),'replacement')
  await assert.rejects(access(target.controlFile),{code:'ENOENT'})
})

test('a private-file stop acknowledges its own open run, with no connection or secret', async t => {
  const home=await mkdtemp(path.join(tmpdir(),'dealer-pilot-stop-'))
  t.after(()=>rm(home,{recursive:true,force:true}))
  const primary=pilotTarget(['--serve'],home), alternate=pilotTarget(['--serve','--port','19997'],home)
  const first=await reservePilotFiles(primary), second=await reservePilotFiles(alternate)
  const called=[]
  const watcherA=await createPilotControl(first.control,()=>called.push('primary'))
  const watcherB=await createPilotControl(second.control,()=>called.push('alternate'))
  try{
    assert.doesNotMatch(await readFile(alternate.controlFile,'utf8'),/token|password/i)
    // A path replacement cannot cause the first instance to acknowledge another run.
    await rename(primary.controlFile,path.join(primary.qaPath,'previous-control'))
    await writeFile(primary.controlFile,'{"protocol":2,"request":0,"ack":0}\n',{mode:0o600})
    await Promise.all([requestPilotStop(alternate),requestPilotStop(alternate)])
    assert.deepEqual(called,['alternate'])
    assert.match(await readFile(primary.controlFile,'utf8'),/"request":0,"ack":0/)
  }finally{
    await Promise.all([watcherA.close(),watcherB.close()])
    await Promise.all([first.release(),second.release()])
  }
})

test('malformed, oversized and stale legacy controls never reach an endpoint', async t => {
  const home=await mkdtemp(path.join(tmpdir(),'dealer-pilot-stale-'))
  t.after(()=>rm(home,{recursive:true,force:true}))
  const target=pilotTarget(['--serve','--port','19997'],home), files=await reservePilotFiles(target)
  try{
    for(const data of ['{"runId":"x","token":"x"}','x'.repeat(300)]){
      await writeFile(target.controlFile,data)
      await assert.rejects(requestPilotStop(target),/Invalid private trial control/)
    }
    const sample=JSON.stringify({runId:'01234567-1234-4abc-89ef-0123456789ab',token:'c'.repeat(64)})
    await writeFile(target.controlFile,sample)
    const old=new Date(Date.now()-3*3600000)
    await files.control.utimes(old,old)
    await assert.rejects(requestPilotStop(target),/Expired legacy trial control/)
    // Even valid legacy data cannot direct a request to another port.
    await writeFile(target.controlFile,sample)
    await assert.rejects(requestPilotStop({...target,port:29997}),/Invalid legacy trial port/)
  }finally{await files.release()}
})

test('legacy compatibility checks the established peer before writing the bearer', async t => {
  const home=await mkdtemp(path.join(tmpdir(),'dealer-pilot-peer-'))
  t.after(()=>rm(home,{recursive:true,force:true}))
  const target=pilotTarget(['--serve','--port','19997'],home), files=await reservePilotFiles(target)
  try{
    const sample={runId:'01234567-1234-4abc-89ef-0123456789ab',token:'f'.repeat(64)}
    await files.control.writeFile(JSON.stringify(sample))
    const socket=new PassThrough()
    Object.assign(socket,{localAddress:'127.0.0.1',remoteAddress:'192.0.2.1',remotePort:19997})
    const write=t.mock.method(socket,'write',()=>assert.fail('A mismatched peer must never receive a header'))
    t.mock.method(net,'createConnection',options=>{
      assert.deepEqual([options.host,options.localAddress,options.port,options.family],['127.0.0.1','127.0.0.1',19997,4])
      queueMicrotask(()=>socket.emit('connect'))
      return socket
    })
    await assert.rejects(requestPilotStop(target),/Invalid legacy trial peer/)
    assert.equal(write.mock.callCount(),0)
  }finally{await files.release()}
})

test('an HTTP 204 from a reused loopback port cannot acknowledge a stale private file', async t => {
  const home=await mkdtemp(path.join(tmpdir(),'dealer-pilot-false-ack-'))
  t.after(()=>rm(home,{recursive:true,force:true}))
  const target=pilotTarget(['--stop','--port','19997'],home), files=await reservePilotFiles(target)
  try{
    const record=JSON.stringify({runId:'01234567-1234-4abc-89ef-0123456789ab',token:'d'.repeat(64)})
    await files.control.writeFile(record)
    let replies=0
    t.mock.method(net,'createConnection',()=>{
      const socket=new Duplex({read(){},write(_bytes,_encoding,done){
        replies++
        this.push(Buffer.from('HTTP/1.1 204 No Content\r\n\r\n'));this.push(null);done()
      }})
      Object.assign(socket,{localAddress:'127.0.0.1',remoteAddress:'127.0.0.1',remotePort:19997})
      queueMicrotask(()=>socket.emit('connect'))
      return socket
    })
    await assert.rejects(requestPilotStop(target),/did not retire its private control file/)
    assert.equal(replies,1)
    assert.equal(await readFile(target.controlFile,'utf8'),record)
  }finally{await files.release()}
})
