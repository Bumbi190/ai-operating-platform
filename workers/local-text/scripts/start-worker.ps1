param([Parameter(Mandatory=$true)][string]$ConfigPath,[Parameter(Mandatory=$true)][string]$NodePath,[Parameter(Mandatory=$true)][int]$ParentProcessId)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'startup-plan.ps1')
$plan=Read-LocalTextStartupPlan -ConfigPath $ConfigPath -NodePath $NodePath
if ((Get-Item -LiteralPath $ConfigPath).Length -gt 262144) { throw 'INVALID_WORKER_CONFIG' }
$config=Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$stopMarker=Join-Path (Split-Path $ConfigPath) 'stop.request'
$base=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$root=[IO.Path]::GetFullPath($config.runtimeDir);$exe=Join-Path $root 'ollama-v0.40.5\ollama.exe';$serverRecord=Join-Path $root 'owned-server.json';$lock=Join-Path $root 'job.lock'
if ($config.version -ne 1 -or $config.runtimeHash -notmatch '^[a-f0-9]{64}$' -or $config.testIdentityName -or [IO.Path]::GetFullPath($config.journalFile) -cne (Join-Path (Split-Path $ConfigPath) 'attempt.dpapi.json') -or [IO.Path]::GetFullPath($config.counterFile) -cne (Join-Path (Split-Path $ConfigPath) 'counter.json')) { throw 'INVALID_WORKER_CONFIG' }
$parent=Get-Process -Id $ParentProcessId -ErrorAction Stop
# Hold an opened kernel handle to this actual parent instance, never a later PID.
$parentHandle=$parent.Handle
if ($parent.Path -cne $NodePath) { throw 'SUPERVISOR_PARENT_MISMATCH' }
$mutexName='Local\OmniraLocalText-'+$config.deviceId
$mutex=New-Object Threading.Mutex($false,$mutexName);$acquired=$false;$job=$null;$server=$null;$worker=$null;$empty=$false;$createdRecord=$false;$status='crashed';$session=[guid]::NewGuid().ToString()
try {
 try { $acquired=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired=$true }
 if (!$acquired) { $status='needs_input';$empty=$true;return }
 # Content erasure precedes all runtime/journal/stop guards. It neither contacts
 # the server nor clears the uncertain physical lock.
 & $NodePath (Join-Path $base 'worker.mjs') --expire-journal --config $ConfigPath | Out-Null
 if ($LASTEXITCODE -ne 0) { $status='needs_input';$empty=$true;return }
 # Never infer a safe restart from a missing PID or delete an uncertain lock.
 if ((Test-Path -LiteralPath $stopMarker) -or (Test-Path -LiteralPath $lock) -or (Test-Path -LiteralPath $config.journalFile) -or (Test-Path -LiteralPath $serverRecord)) { $status='needs_input';$empty=$true;return }
 $listeners=@(& (Join-Path ([Environment]::SystemDirectory) 'netstat.exe') -ano | Where-Object {$_ -match '^\s*TCP\s+\S+:11434\s+\S+\s+LISTENING\s+\d+\s*$'})
 if ($LASTEXITCODE -ne 0 -or $listeners.Count -ne 0) { $status='needs_input';$empty=$true;return }
 if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $config.runtimeHash) { throw 'RUNTIME_HASH_CHANGED' }
 Add-Type -Path (Join-Path $PSScriptRoot 'owned-job.cs')
 $job=New-Object Omnira.LocalText.OwnedJob
 $environment=New-Object 'System.Collections.Generic.List[string]'
 foreach ($name in @('SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','ProgramFiles','CommonProgramFiles','SystemDrive')) { $value=[Environment]::GetEnvironmentVariable($name);if ($null -ne $value) { $environment.Add($name+'='+$value) } }
 $runtimeEnv=New-Object 'System.Collections.Generic.List[string]';$runtimeEnv.AddRange($environment)
 foreach ($entry in @('OLLAMA_HOST=127.0.0.1:11434','OLLAMA_NO_CLOUD=1','OLLAMA_NUM_PARALLEL=1','OLLAMA_MAX_LOADED_MODELS=1',('OLLAMA_MODELS='+(Join-Path $root 'models')))) { $runtimeEnv.Add($entry) }
 $server=$job.Start($exe,'serve',$root,$runtimeEnv.ToArray())
 $process=Get-Process -Id $server.Id -ErrorAction Stop
 $record=@{processId=$server.Id;startedAt=$process.StartTime.ToUniversalTime().ToString('o');executablePath=$exe;version='0.40.5';sessionId=$session}
 $bytes=[Text.Encoding]::UTF8.GetBytes(($record|ConvertTo-Json -Compress));$handle=[IO.File]::Open($serverRecord,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
 try {$handle.Write($bytes,0,$bytes.Length);$handle.Flush($true)}finally{$handle.Dispose()};$createdRecord=$true
 $ready=$false;$until=[DateTime]::UtcNow.AddSeconds(15)
 while (!$server.Exited -and !$parent.HasExited -and [DateTime]::UtcNow -lt $until) { $client=New-Object Net.Sockets.TcpClient;try{$pending=$client.ConnectAsync('127.0.0.1',11434);if ($pending.Wait(150) -and $client.Connected) {$ready=$true;break}}catch{}finally{$client.Dispose()};Start-Sleep -Milliseconds 100 }
 if (!$ready) { throw 'RUNTIME_START_FAILED' }
 $workerPath=Join-Path $base 'worker.mjs';$args='"'+$workerPath+'" --config "'+$ConfigPath+'"'
 $worker=$job.Start($NodePath,$args,$base,$environment.ToArray())
 while (!$server.Exited -and !$worker.Exited -and !$parent.HasExited) { if (Test-Path -LiteralPath $stopMarker) { $until=[DateTime]::UtcNow.AddSeconds(8);while(!$worker.Exited -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 100};$status='stopped';break };Start-Sleep -Milliseconds 250 }
 if ($parent.HasExited) {$status='stopped'}
} catch { $status='crashed' }
finally {
 if ($job) { try {$empty=$job.TerminateAndWait(10000)}catch{$empty=$false};$job.Dispose() }
 if ($createdRecord -and $empty) { $current=Get-Content -LiteralPath $serverRecord -Raw|ConvertFrom-Json;if ($current.sessionId -ceq $session -and $current.processId -eq $server.Id) { Remove-Item -LiteralPath $serverRecord } }
 if ((Test-Path -LiteralPath $lock) -or (Test-Path -LiteralPath $config.journalFile)) {$status='needs_input'}
 if ($server) {$server.Dispose()};if ($worker) {$worker.Dispose()}
 if ($acquired) {$mutex.ReleaseMutex()};$mutex.Dispose();$parent.Dispose()
 # Metadata only; this is local kernel evidence, not a server approval/unlock.
 $proof=@{version=1;sessionId=$session;deviceId=$config.deviceId;status=$status;kernelEmpty=$empty;checkedAt=[DateTime]::UtcNow.ToString('o')}
 if ($empty -and $job) { $proof|ConvertTo-Json -Compress|Set-Content -LiteralPath (Join-Path (Split-Path $ConfigPath) 'kernel-session.json') -Encoding UTF8 }
 @{status=$status;kernelEmpty=$empty}|ConvertTo-Json -Compress
}
