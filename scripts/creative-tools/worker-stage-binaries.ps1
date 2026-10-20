#Requires -Version 5.1
<#
Stage pinned ArtCraft portable folders in the separate creative worker root.
Plan (default) is read-only; Apply is an administrator action and refuses
existing target directories. Does not change network/firewall or enable worker.
#>
[CmdletBinding()]
param([switch]$Apply)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Join-Path $PSScriptRoot 'artcraft-lock.json'
$lock = Get-Content -LiteralPath $repoRoot -Raw | ConvertFrom-Json
$artcraftRoot = Join-Path $env:USERPROFILE 'Projects\Omnira\External\ArtCraft'
$root = Join-Path $env:ProgramData 'OmniraCreativeWorker'
$binRoot = Join-Path $root 'bin'
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$account = Get-LocalUser -Name 'omnira-media-worker' -ErrorAction SilentlyContinue

$results = @()
foreach ($name in @('photocraft','filmcraft')) {
  $entry = $lock.$name
  $binary = Join-Path $artcraftRoot $entry.binaryRelativePath
  $source = Split-Path $binary -Parent
  $archive = Join-Path $artcraftRoot $entry.archiveRelativePath
  $archiveExists = Test-Path -LiteralPath $archive -PathType Leaf
  $archiveDigest = if ($archiveExists) { (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }
  $archiveMatches = $archiveExists -and $archiveDigest -eq ([string]$entry.archiveSha256).ToLowerInvariant()
  $relativeDir = Split-Path ($entry.binaryRelativePath -replace '/', '\') -Parent
  $dest = Join-Path $binRoot $relativeDir
  $present = Test-Path -LiteralPath $binary -PathType Leaf
  $digest = if ($present) { (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }
  $expected = [string]$entry.sha256
  $match = $present -and ($digest -eq $expected.ToLowerInvariant())
  $results += [pscustomobject]@{
    program = $name
    version = $entry.version
    sourceBinaryExists = [bool]$present
    sourceHashMatchesLock = [bool]$match
    archiveExists = [bool]$archiveExists
    archiveHashMatchesLock = [bool]$archiveMatches
    archiveFile = $archive
    sourceDir = $source
    targetDir = $dest
    targetExists = (Test-Path -LiteralPath $dest)
  }
}
if (-not $Apply) {
  [pscustomobject]@{
    mode = 'read-only-staging-plan'
    changesApplied = $false
    elevated = [bool]$isAdmin
    workerAccountExists = ($null -ne $account)
    workerAccountDisabled = ($null -ne $account -and -not $account.Enabled)
    targetRootExists = (Test-Path -LiteralPath $root)
    programs = $results
    productionReady = $false
  } | ConvertTo-Json -Depth 5
  return
}
if (-not $isAdmin) { throw 'Requires elevated PowerShell; no changes applied.' }
if ($null -eq $account -or $account.Enabled) { throw 'Worker account must exist and remain DISABLED.' }
if (-not (Test-Path -LiteralPath $binRoot -PathType Container)) {
  throw 'Provision worker directory and ACLs before staging binaries.'
}
if (@($results | Where-Object { -not $_.sourceHashMatchesLock -or -not $_.archiveHashMatchesLock -or $_.targetExists }).Count -gt 0) {
  throw 'Source hash mismatch or existing targets: refusing copy.'
}
foreach ($program in $results) {
  $targetParent = Split-Path $program.targetDir -Parent
  New-Item -ItemType Directory -Path $targetParent -Force -ErrorAction Stop | Out-Null
  # Extract the verified release archive, not potentially modified unpacked files.
  Expand-Archive -LiteralPath $program.archiveFile -DestinationPath $targetParent -ErrorAction Stop
  $copiedBinary = Join-Path $program.targetDir (Split-Path ($lock.($program.program).binaryRelativePath) -Leaf)
  if (-not (Test-Path -LiteralPath $copiedBinary -PathType Leaf)) {
    throw "Copied binary missing for $($program.program). Account remains disabled."
  }
  $check = (Get-FileHash -LiteralPath $copiedBinary -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($check -ne ([string]$lock.($program.program).sha256).ToLowerInvariant()) {
    throw "Copied binary hash mismatch for $($program.program). Account remains disabled."
  }
}
[pscustomobject]@{
  mode = 'staged-binaries'
  changesApplied = $true
  workerAccountStillDisabled = $true
  programs = @($results | ForEach-Object { $_.program })
  networkEgressVerified = $false
  productionReady = $false
} | ConvertTo-Json -Depth 4
