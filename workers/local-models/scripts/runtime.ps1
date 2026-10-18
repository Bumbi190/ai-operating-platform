param([Parameter(Mandatory=$true)][ValidateSet('Prepare','Start','Status','Stop')][string]$Action,[string]$RuntimeRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'runtime-lib.ps1')
$defaultRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.local-runtime'))
if (!$RuntimeRoot) { $RuntimeRoot=$defaultRoot }
$RuntimeRoot=[IO.Path]::GetFullPath($RuntimeRoot)
if ($RuntimeRoot -ne $defaultRoot) { throw 'INVALID_RUNTIME_ROOT' }
$version='0.40.5'
$expectedSha='5134ce7e3bc8e94d0494721c799ec293b429450d0c52461b0ee3647dd3bb4bb7'
$installDir=Join-Path $RuntimeRoot ('ollama-v'+$version)
$exe=Join-Path $installDir 'ollama.exe'
$journalPath=Join-Path $RuntimeRoot 'owned-server.json'
$zip=Join-Path $RuntimeRoot ('ollama-v'+$version+'.zip')
if ($Action -eq 'Prepare') {
  Assert-FreeSpace $RuntimeRoot
  New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
  $checksums=Invoke-RestMethod -Uri ('https://github.com/ollama/ollama/releases/download/v'+$version+'/sha256sum.txt') -TimeoutSec 30
  Assert-ReleaseChecksumText -Text $checksums -ExpectedSha256 $expectedSha
  if (!(Test-Path $zip)) {
    $partial=$zip+'.part'
    Invoke-CheckedDownload -Destination $partial -Source ('https://github.com/ollama/ollama/releases/download/v'+$version+'/ollama-windows-amd64.zip')
    Assert-ArtifactHash $partial $expectedSha
    Move-Item -LiteralPath $partial -Destination $zip
  }
  Assert-ArtifactHash $zip $expectedSha
  $binarySha=Get-ArchiveExecutableSha $zip
  if (!(Test-Path $exe)) { Expand-Archive -LiteralPath $zip -DestinationPath $installDir }
  if (!(Test-Path $exe)) { throw 'RUNTIME_EXECUTABLE_MISSING' }
  Assert-ArtifactHash $exe $binarySha
  @{version=$version; archiveSha256=$expectedSha; executableSha256=$binarySha} | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $RuntimeRoot 'installation.json')
  @{status='prepared';version=$version;archiveSha256=$expectedSha} | ConvertTo-Json -Compress
  exit 0
}
if ($Action -eq 'Start') {
  if (Test-LocalListener) { throw 'LOCAL_PORT_BUSY' }
  if (Test-Path $journalPath) { $old=Get-Content $journalPath -Raw | ConvertFrom-Json; if (Get-OwnedProcess $old $exe) { throw 'OWNED_SERVER_ALREADY_RUNNING' } }
  if (!(Test-Path $exe)) { throw 'RUNTIME_NOT_PREPARED' }
  $installation=Get-Content (Join-Path $RuntimeRoot 'installation.json') -Raw | ConvertFrom-Json
  Assert-ArtifactHash $exe $installation.executableSha256
  $env:OLLAMA_HOST='127.0.0.1:11434'; $env:OLLAMA_NO_CLOUD='1'; $env:OLLAMA_NUM_PARALLEL='1'; $env:OLLAMA_MAX_LOADED_MODELS='1'; $env:OLLAMA_MODELS=Join-Path $RuntimeRoot 'models'
  $proc=Start-Process -FilePath $exe -ArgumentList 'serve' -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $RuntimeRoot 'server.stdout.log') -RedirectStandardError (Join-Path $RuntimeRoot 'server.stderr.log')
  Start-Sleep -Milliseconds 100
  $proc.Refresh()
  $journal=@{processId=$proc.Id;startedAt=$proc.StartTime.ToUniversalTime().ToString('o');executablePath=$exe;version=$version}
  $journal | ConvertTo-Json | Set-Content -Encoding UTF8 $journalPath
  $until=[DateTime]::UtcNow.AddSeconds(15)
  while (!(Test-LocalListener) -and [DateTime]::UtcNow -lt $until) { if ($proc.HasExited) { throw 'SERVER_EXITED' }; Start-Sleep -Milliseconds 100 }
  if (!(Test-LocalListener)) { throw 'SERVER_START_TIMEOUT' }
  $listeners=Get-NetTCPConnection -State Listen -LocalPort 11434
  Assert-OwnedListeners $listeners $proc.Id
  @{status='started';processId=$proc.Id;bind='127.0.0.1:11434';version=$version} | ConvertTo-Json -Compress
  exit 0
}
if ($Action -eq 'Status') {
  $alive=$false
  if (Test-Path $journalPath) { $journal=Get-Content $journalPath -Raw | ConvertFrom-Json; $alive=$null -ne (Get-OwnedProcess $journal $exe) }
  if ($alive -and (Test-LocalListener)) { Assert-OwnedListeners (Get-NetTCPConnection -State Listen -LocalPort 11434) $journal.processId }
  @{ownedServerAlive=$alive;portListening=(Test-LocalListener);version=$version} | ConvertTo-Json -Compress
  exit 0
}
if ($Action -eq 'Stop') {
  if (!(Test-Path $journalPath)) { throw 'NO_OWNED_SERVER' }
  $journal=Get-Content $journalPath -Raw | ConvertFrom-Json
  $proc=Get-OwnedProcess $journal $exe
  $lock=Join-Path $RuntimeRoot 'job.lock'
  Assert-RecoveryCanProceed -ParentAlive ($null -ne $proc) -HasLock (Test-Path $lock) -RemainingRunners 0
  if (Test-Path $lock) { $job=Get-Content $lock -Raw | ConvertFrom-Json; if ($job.state -eq 'in_flight' -and (Get-Process -Id $job.pid -ErrorAction SilentlyContinue)) { throw 'LOCAL_JOB_ACTIVE' } }
  if ($proc) {
    $children=Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$proc.Id)
    $ownedChildren=@($children | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($installDir+'\',[StringComparison]::OrdinalIgnoreCase) })
    foreach ($child in $ownedChildren) { $runner=Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue; if ($runner -and $runner.Path -eq $child.ExecutablePath) { Stop-Process -Id $runner.Id -ErrorAction Stop; if (!$runner.WaitForExit(5000)) { throw 'OWNED_RUNNER_UNCONFIRMED' } } }
    Stop-Process -Id $proc.Id -ErrorAction Stop
    $proc.WaitForExit(5000) | Out-Null
  }
  if (Test-LocalListener) { throw 'PORT_STILL_LISTENING' }
  $remaining=@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($installDir+'\',[StringComparison]::OrdinalIgnoreCase) })
  Assert-RecoveryCanProceed -ParentAlive ($null -ne $proc) -HasLock (Test-Path $lock) -RemainingRunners $remaining.Count
  Remove-Item -LiteralPath $journalPath
  if (Test-Path $lock) { Remove-Item -LiteralPath $lock }
  @{status='stopped';version=$version} | ConvertTo-Json -Compress
}
