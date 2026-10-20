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

function Inspect-Target([string]$Path) {
  try {
    $found = [bool](Test-Path -LiteralPath $Path -ErrorAction Stop)
    return [pscustomobject]@{ inspected = $true; exists = $found; status = $(if ($found) { 'present' } else { 'absent' }) }
  } catch [System.UnauthorizedAccessException] {
    return [pscustomobject]@{ inspected = $false; exists = $null; status = 'access_denied' }
  } catch {
    return [pscustomobject]@{ inspected = $false; exists = $null; status = 'unreadable' }
  }
}
$rootCheck = Inspect-Target $root
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
  $targetCheck = Inspect-Target $dest
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
    targetExists = $targetCheck.exists
    targetInspection = $(if ($targetCheck.inspected) { 'verified' } else { $targetCheck.status })
  }
}
if (-not $Apply) {
  [pscustomobject]@{
    mode = 'read-only-staging-plan'
    changesApplied = $false
    elevated = [bool]$isAdmin
    workerAccountExists = ($null -ne $account)
    workerAccountDisabled = ($null -ne $account -and -not $account.Enabled)
    targetRootExists = $rootCheck.exists
    targetRootInspection = $(if ($rootCheck.inspected) { 'verified' } else { $rootCheck.status })
    programs = $results
    productionReady = $false
  } | ConvertTo-Json -Depth 5
  return
}
if (-not $isAdmin) { throw 'Requires elevated PowerShell; no changes applied.' }
if ($null -eq $account -or $account.Enabled) { throw 'Worker account must exist and remain DISABLED.' }
# Re-read the actual Windows ACLs from the elevated session. The operator's
# earlier screenshot, account name and staging plan are not adequate proof.
$verification = & (Join-Path $PSScriptRoot 'worker-verify.ps1') | ConvertFrom-Json
if (-not $verification.accountExists -or -not $verification.accountDisabled -or
    -not $verification.groupCheckAvailable -or -not $verification.accountNotAdministrator -or
    -not $verification.restrictedAclsVerified) {
  throw 'Independent Windows ACL audit did not pass. Staging remains prohibited.'
}
# The read-only, exact-nine-file ZIP/Authenticode audit must also pass IN THIS
# elevated session before any program directory is created.
$archiveAudit = & (Join-Path $PSScriptRoot 'worker-archive-audit.ps1') | ConvertFrom-Json
if (-not $archiveAudit.allVerified -or @($archiveAudit.programs).Count -ne 2 -or
    @($archiveAudit.programs | Where-Object { -not $_.programReadyForStaging }).Count -ne 0) {
  throw 'Pinned release content/signature verification failed. Staging prohibited.'
}
$binCheck = Inspect-Target $binRoot
if (-not $rootCheck.inspected -or -not $rootCheck.exists -or
    -not $binCheck.inspected -or -not $binCheck.exists) {
  throw 'Worker root/bin must be verifiably present; refusing staging on unknown access.'
}
if (@($results | Where-Object { -not $_.sourceHashMatchesLock -or -not $_.archiveHashMatchesLock -or $_.targetInspection -ne 'verified' -or $null -eq $_.targetExists -or $_.targetExists }).Count -gt 0) {
  throw 'Source hash mismatch or existing targets: refusing copy.'
}
# Preflight BOTH destinations before touching EITHER. The provisioned bin root
# is RX for the worker; program subfolders must not exist or be reparse points.
foreach ($fixedPath in @($root,$binRoot)) {
  $node = Get-Item -LiteralPath $fixedPath -Force -ErrorAction Stop
  if (-not $node.PSIsContainer -or ($node.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Worker root or bin has an unexpected file type or reparse point.'
  }
}
foreach ($program in $results) {
  $programRoot = Join-Path $binRoot $program.program
  $check = Inspect-Target $programRoot
  if (-not $check.inspected -or $check.exists) {
    throw 'Staging program parent exists or cannot be inspected; refusing all copies.'
  }
}
foreach ($program in $results) {
  $targetParent = Split-Path $program.targetDir -Parent
  New-Item -ItemType Directory -Path $targetParent -ErrorAction Stop | Out-Null
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
  foreach ($executable in @($copiedBinary, (Join-Path $program.targetDir "$($program.program).exe"))) {
    $signature = Get-AuthenticodeSignature -LiteralPath $executable -ErrorAction Stop
    if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate -or
        $signature.SignerCertificate.Thumbprint -cne '54A063654E51CD00D5620C36616F9A6AA30EDD15') {
      throw 'Staged executable signature/signer mismatch. Account remains disabled.'
    }
  }
  # If the original user-writable archive changed during extraction, stop.
  $archiveRecheck=(Get-FileHash -LiteralPath $program.archiveFile -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
  if ($archiveRecheck -cne ([string]$lock.($program.program).archiveSha256).ToLowerInvariant()) {
    throw 'Source archive changed during staging. Account remains disabled.'
  }
}
$workerFinal=Get-LocalUser -Name 'omnira-media-worker' -ErrorAction Stop
if ($workerFinal.Enabled) { throw 'Worker unexpectedly enabled. STOP.' }
[pscustomobject]@{
  mode = 'staged-binaries'
  changesApplied = $true
  workerAccountStillDisabled = (-not $workerFinal.Enabled)
  programs = @($results | ForEach-Object { $_.program })
  networkEgressVerified = $false
  productionReady = $false
} | ConvertTo-Json -Depth 4
