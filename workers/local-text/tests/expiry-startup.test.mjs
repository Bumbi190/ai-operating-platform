import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';import path from 'node:path';import {execFile} from 'node:child_process';import {createJournal} from '../journal.mjs';import {main as supervisorMain} from '../supervisor.mjs';import {identityEnvironment} from '../identity.mjs';
test('real Windows paused startup erases expired DPAPI content and preserves the unknown lock', {skip:process.platform!=='win32'},async()=>{
 const id=randomUUID(),state=fileURLToPath(new URL('../.local-state/'+id,import.meta.url)),runtime=await mkdtemp(path.join(tmpdir(),'omnira-expiry-test-'));await mkdir(state,{recursive:true});
 const configFile=path.join(state,'config.json'),journalFile=path.join(state,'attempt.dpapi.json'),lock=path.join(runtime,'job.lock'),bytes='{"state":"uncertain","attemptId":"test-attempt"}';
 const config={version:1,deviceId:id,runtimeHash:'a'.repeat(64),runtimeDir:runtime,journalFile,counterFile:path.join(state,'counter.json')};
 const journal=createJournal(journalFile),raw={version:1,phase:'physical_unknown',claim:{jobId:randomUUID(),attemptId:randomUUID(),inputHash:'b'.repeat(64),task:{text:'SYNTHETIC_RAW_SOURCE'}},expiresAt:'2026-10-16T00:00:00Z',payload:{result:'SYNTHETIC_RAW_RESULT'}};
 try{
  await writeFile(configFile,JSON.stringify(config));await writeFile(lock,bytes);await journal.write(raw);
  const helper=fileURLToPath(new URL('../scripts/start-worker.ps1',import.meta.url));
  const output=await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',helper,'-ConfigPath',configFile,'-NodePath',process.execPath,'-ParentProcessId',String(process.pid)],{env:identityEnvironment(),timeout:30000},(error,stdout)=>error?reject(error):resolve(stdout)));
  assert.equal(JSON.parse(output).status,'needs_input');assert.equal((await journal.read()).phase,'expired_hold');assert.equal(await readFile(lock,'utf8'),bytes);assert.ok(!JSON.stringify(await journal.read()).includes('SYNTHETIC_RAW'));
  // Even a retained explicit stop marker allows content-only maintenance; it
  // starts no owned runtime/session and never clears the existing physical hold.
  await journal.write(raw);await writeFile(path.join(state,'stop.request'),'stop\n');const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),200);
  try{assert.equal((await supervisorMain(['--config',configFile],controller.signal)).status,'paused')}finally{clearTimeout(timer)}
  assert.equal((await journal.read()).phase,'expired_hold');assert.equal(await readFile(lock,'utf8'),bytes);
 }finally{await rm(state,{recursive:true,force:true});await rm(runtime,{recursive:true,force:true})}
});
