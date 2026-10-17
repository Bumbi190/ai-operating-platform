import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {writeFile,readFile} from 'node:fs/promises';import path from 'node:path';
import {temp,fixture} from '../test-utils.mjs';
import {promisify} from 'node:util';import {execFile} from 'node:child_process';
const windows=process.platform==='win32';const dir=path.dirname(fileURLToPath(import.meta.url));
const ps=(script)=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8'});
const quote=s=>"'"+s.replaceAll("'","''")+"'";
test('PowerShell runtime scripts have valid AST',{skip:!windows},()=>{
  for(const f of ['runtime-lib.ps1','runtime.ps1','preflight.ps1']) {const r=ps(`$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile(${quote(path.join(dir,f))},[ref]$tokens,[ref]$errors) | Out-Null; if ($errors.Count) { Write-Error ($errors | Out-String); exit 1 }; if (!(Test-Path ${quote(path.join(dir,f))})) { exit 2 }`);assert.equal(r.status,0,r.stderr);}
});
test('wrong artifact SHA is rejected without executing or modifying artifact',{skip:!windows},async t=>{
  const d=await temp(t);const f=path.join(d,'artifact.zip');await writeFile(f,'tiny-test');const r=ps(`. ${quote(path.join(dir,'runtime-lib.ps1'))}; try { Assert-ArtifactHash -Artifact ${quote(f)} -ExpectedSha256 '${'0'.repeat(64)}'; exit 2 } catch { if ($_.Exception.Message -eq 'ARTIFACT_HASH_MISMATCH') { exit 0 }; exit 3 }`);assert.equal(r.status,0,r.stderr);assert.equal(await readFile(f,'utf8'),'tiny-test');
});
test('official checksum parser accepts ./ prefix but rejects a changed artifact hash',{skip:!windows},()=>{
  const good='5134ce7e3bc8e94d0494721c799ec293b429450d0c52461b0ee3647dd3bb4bb7';
  const r=ps(`. ${quote(path.join(dir,'runtime-lib.ps1'))}; Assert-ReleaseChecksumText -Text '${good}  ./ollama-windows-amd64.zip' -ExpectedSha256 '${good}'; try { Assert-ReleaseChecksumText -Text '${'0'.repeat(64)}  ./ollama-windows-amd64.zip' -ExpectedSha256 '${good}'; exit 2 } catch { if ($_.Exception.Message -eq 'RELEASE_CHECKSUM_CHANGED') { exit 0 }; exit 3 }`);assert.equal(r.status,0,r.stderr);
});
test('artifact download succeeds under Stop error policy without progress stderr',{skip:!windows},async t=>{
  const d=await temp(t);const file=path.join(d,'download.part');const port=await fixture(t,(_,res)=>res.end('download-fixture'));
  await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',`. ${quote(path.join(dir,'runtime-lib.ps1'))}; Invoke-CheckedDownload -Source 'http://127.0.0.1:${port}/artifact' -Destination ${quote(file)}`],{timeout:10000});assert.equal(await readFile(file,'utf8'),'download-fixture');
});
test('verified archive hash cannot bless a modified existing executable',{skip:!windows},async t=>{
  const d=await temp(t);const r=ps(`. ${quote(path.join(dir,'runtime-lib.ps1'))}; $d=${quote(d)}; New-Item -ItemType Directory (Join-Path $d 'source') | Out-Null; [IO.File]::WriteAllText((Join-Path $d 'source/ollama.exe'),'verified'); Compress-Archive (Join-Path $d 'source\\ollama.exe') (Join-Path $d 'test.zip'); $expected=Get-ArchiveExecutableSha (Join-Path $d 'test.zip'); [IO.File]::WriteAllText((Join-Path $d 'ollama.exe'),'modified'); try { Assert-ArtifactHash (Join-Path $d 'ollama.exe') $expected; exit 2 } catch { if ($_.Exception.Message -eq 'ARTIFACT_HASH_MISMATCH') { exit 0 }; exit 3 }`);assert.equal(r.status,0,r.stderr);
});
test('uncertain recovery requires a live owned parent and verified runner termination',{skip:!windows},()=>{
  const r=ps(`. ${quote(path.join(dir,'runtime-lib.ps1'))}; try { Assert-RecoveryCanProceed -ParentAlive $false -HasLock $true -RemainingRunners 0; exit 2 } catch { if ($_.Exception.Message -ne 'OWNED_RUNNER_UNCONFIRMED') { exit 3 } }; try { Assert-RecoveryCanProceed -ParentAlive $true -HasLock $true -RemainingRunners 1; exit 4 } catch { if ($_.Exception.Message -ne 'OWNED_RUNNER_UNCONFIRMED') { exit 5 } }; Assert-RecoveryCanProceed -ParentAlive $true -HasLock $true -RemainingRunners 0`);assert.equal(r.status,0,r.stderr);
});
test('runtime status rejects another listener even when parent identity is known',{skip:!windows},()=>{
  const r=ps(`. ${quote(path.join(dir,'runtime-lib.ps1'))}; try { Assert-OwnedListeners -Listeners @(@{LocalAddress='127.0.0.1';OwningProcess=456}) -ExpectedProcessId 123; exit 2 } catch { if ($_.Exception.Message -eq 'UNEXPECTED_LISTENER') { exit 0 }; exit 3 }`);assert.equal(r.status,0,r.stderr);
});
test('Start refuses an occupied local port before launching a process',{skip:!windows},async t=>{
  // Independent listener on the real fixed port is created only if the port is free.
  const http=await import('node:http');const server=http.createServer((_,res)=>res.end('{}'));
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(11434,'127.0.0.1',resolve);});}catch(e){if(e.code==='EADDRINUSE'){t.skip('fixed port already belongs to another service');return;}throw e;}
  t.after(()=>new Promise(r=>server.close(r)));const r=ps(`& ${quote(path.join(dir,'runtime.ps1'))} -Action Start`);assert.notEqual(r.status,0);assert.match(r.stderr+r.stdout,/LOCAL_PORT_BUSY/);
});
