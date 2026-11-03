import assert from 'node:assert/strict'
import {access, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {pilotTarget, reservePilotFiles} from './dealer-customer-pilot.mjs'

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
