param([Parameter(Mandatory=$true)][string]$RuntimeRoot,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedRuntimeHash)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($RuntimeRoot)
$exe=Join-Path $root 'ollama-v0.40.5\ollama.exe'
$journal=Get-Content -LiteralPath (Join-Path $root 'owned-server.json') -Raw | ConvertFrom-Json
if ($journal.version -ne '0.40.5' -or $journal.executablePath -ne $exe) { throw 'IDENTITY_CHANGED' }
$server=Get-Process -Id $journal.processId -ErrorAction Stop
if ($server.Path -ne $exe -or $server.StartTime.ToUniversalTime().ToString('o') -ne $journal.startedAt) { throw 'IDENTITY_CHANGED' }
$hash=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $ExpectedRuntimeHash) { throw 'IDENTITY_CHANGED' }
$netstat=@(& (Join-Path ([Environment]::SystemDirectory) 'netstat.exe') -ano)
if ($LASTEXITCODE -ne 0) { throw 'IDENTITY_CHANGED' }
$listeners=@($netstat | Where-Object {$_ -match '^\s*TCP\s+\S+:11434\s+\S+\s+LISTENING\s+\d+\s*$'})
$expected='^\s*TCP\s+127\.0\.0\.1:11434\s+\S+\s+LISTENING\s+'+$server.Id+'\s*$'
if ($listeners.Count -ne 1 -or $listeners[0] -notmatch $expected) { throw 'IDENTITY_CHANGED' }
$system=Get-CimInstance Win32_Process -Filter ('ProcessId='+$server.Id)
$sid=Invoke-CimMethod -InputObject $system -MethodName GetOwnerSid
if ($sid.Sid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) { throw 'IDENTITY_CHANGED' }
$gpu=@(& nvidia-smi.exe --query-gpu=name,memory.total,memory.free,driver_version --format=csv,noheader,nounits)
if ($LASTEXITCODE -ne 0 -or $gpu.Count -ne 1) { throw 'GPU_UNVERIFIED' }
$parts=$gpu[0].Split(',') | ForEach-Object {$_.Trim()}
if ($parts.Count -ne 4 -or $parts[0] -notmatch 'RTX 3060$' -or [int]$parts[1] -lt 12000) { throw 'GPU_UNVERIFIED' }
$children=@(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$server.Id) | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith((Split-Path $exe)+'\',[StringComparison]::OrdinalIgnoreCase)})
$compute=@(& nvidia-smi.exe --query-compute-apps=pid --format=csv,noheader,nounits)
if ($LASTEXITCODE -ne 0) { throw 'GPU_UNVERIFIED' }
$gpuPids=@($compute | Where-Object {$_ -match '^\d+$'} | ForEach-Object {[int]$_})
$ownedGpu=@($children | Where-Object {$gpuPids -contains [int]$_.ProcessId} | ForEach-Object {[int]$_.ProcessId})
@{owned=$true;runtimeHash=$hash;serverVersion='0.40.5';gpuAvailable=$true;gpuName=$parts[0];gpuFreeMiB=[int]$parts[2];driverVersion=$parts[3];ownedGpuPids=$ownedGpu} | ConvertTo-Json -Compress
