$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'runtime-lib.ps1')
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.local-runtime'))
$drive=New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($root))
$gpu=& nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
if ($LASTEXITCODE -ne 0) { throw 'GPU_UNAVAILABLE' }
@{os=[Environment]::OSVersion.VersionString;node=(& node --version);freeBytes=$drive.AvailableFreeSpace;diskEligible=($drive.AvailableFreeSpace -ge 20GB);gpu=$gpu;portListening=(Test-LocalListener);installationPresent=(Test-Path (Join-Path $root 'installation.json'))} | ConvertTo-Json -Compress
