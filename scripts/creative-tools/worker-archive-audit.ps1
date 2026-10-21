#Requires -Version 5.1
<#
.SYNOPSIS
Read-only ArtCraft portable release ZIP safety and provenance audit.
.DESCRIPTION
No ZIP extraction, no executable launch, no user/ACL/firewall changes.
Fails closed for unexpected archive entries, traversal, duplicate names,
reparse metadata, size bombs, digest/signature mismatches or read errors.
#>
[CmdletBinding()]
param([string]$SourceRoot = '')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
. (Join-Path $PSScriptRoot 'worker-archive-policy.ps1')

$lock=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'artcraft-lock.json') -Raw | ConvertFrom-Json
$artcraftRoot=if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  Join-Path $env:USERPROFILE 'Projects\Omnira\External\ArtCraft'
} else {
  if (-not [IO.Path]::IsPathRooted($SourceRoot)) { throw 'Archive source root must be absolute.' }
  [IO.Path]::GetFullPath($SourceRoot)
}
$signerThumbprint='54A063654E51CD00D5620C36616F9A6AA30EDD15'
$results=@()
foreach ($app in @('photocraft','filmcraft')) {
  $entry=$lock.$app
  $prefix="$app-$($entry.version)-windows-x64-portable/"
  $archive=Join-Path $artcraftRoot ([string]$entry.archiveRelativePath)
  $cli=Join-Path $artcraftRoot ([string]$entry.binaryRelativePath)
  $gui=Join-Path (Split-Path -Path $cli -Parent) "$app.exe"
  $record=[ordered]@{
    program=$app;archiveHashMatchesLock=$false;entryNamesVerified=$false
    noUnsafeZipEntries=$false;boundsVerified=$false;archiveCliHashMatchesLock=$false
    sourceCliSignatureVerified=$false;sourceGuiSignatureVerified=$false
    programReadyForStaging=$false;entryCount=0;totalUncompressedBytes=0L
    inspectedOnly=$true;changesApplied=$false
  }
  try {
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf -ErrorAction Stop)) { throw 'archive_missing' }
    $hash=(Get-FileHash -LiteralPath $archive -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
    $record.archiveHashMatchesLock=($hash -ceq ([string]$entry.archiveSha256).ToLowerInvariant())
    if (-not $record.archiveHashMatchesLock) {throw 'archive_digest_mismatch'}
    $zip=[System.IO.Compression.ZipFile]::OpenRead($archive)
    try {
      $files=@($zip.Entries)
      $record.entryCount=$files.Count
      if (-not (Test-CreativeZipEntries -Entries $files -Program $app -Version ([string]$entry.version))) {
        throw 'unsafe_or_outofbounds_archive_entries'
      }
      $record.totalUncompressedBytes=($files|Measure-Object -Property Length -Sum).Sum
      $record.entryNamesVerified=$true
      $record.noUnsafeZipEntries=$true
      $record.boundsVerified=$true
      $cliEntry=$files|Where-Object {$_.FullName -ceq "$prefix$app-cli.exe"}|Select-Object -First 1
      if ($null -eq $cliEntry) {throw 'cli_archive_entry_missing'}
      $stream=$cliEntry.Open()
      $sha=[Security.Cryptography.SHA256]::Create()
      try {
        $cliHash=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()
      } finally { $sha.Dispose();$stream.Dispose() }
      $record.archiveCliHashMatchesLock=($cliHash -ceq ([string]$entry.sha256).ToLowerInvariant())
      if (-not $record.archiveCliHashMatchesLock) {throw 'cli_entry_digest_mismatch'}
    } finally { $zip.Dispose() }
    foreach ($binary in @(@{path=$cli;key='sourceCliSignatureVerified'},@{path=$gui;key='sourceGuiSignatureVerified'})) {
      $signature=Get-AuthenticodeSignature -LiteralPath $binary.path -ErrorAction Stop
      $record[$binary.key]=($signature.Status -eq 'Valid' -and $null -ne $signature.SignerCertificate -and
        $signature.SignerCertificate.Thumbprint -ceq $signerThumbprint)
      if (-not $record[$binary.key]) {throw 'source_signature_unverified'}
    }
    $record.programReadyForStaging=$true
  } catch {
    # Stable error class, not raw OS paths or exception details.
    $record.errorClass=if ($_.Exception.Message -match '^(archive_|wrong_|unsafe_|external_|entry_|cli_|source_)') {
      $_.Exception.Message
    } else {'inspection_unavailable'}
  }
  $results += [pscustomobject]$record
}
[pscustomobject]@{
  mode='read-only-artcraft-archive-audit';programs=$results
  allVerified=(@($results|Where-Object {-not $_.programReadyForStaging}).Count -eq 0)
  changesApplied=$false;workerExecutionEnabled=$false;productionReady=$false
} | ConvertTo-Json -Depth 5
