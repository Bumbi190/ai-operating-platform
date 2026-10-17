$ErrorActionPreference = 'Stop'
function Get-ArchiveExecutableSha {
  param([string]$Archive)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip=[IO.Compression.ZipFile]::OpenRead($Archive)
  try {
    $entry=@($zip.Entries | Where-Object { $_.FullName -eq 'ollama.exe' })
    if ($entry.Count -ne 1) { throw 'ARCHIVE_EXECUTABLE_MISSING' }
    $stream=$entry[0].Open(); $sha=[Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose(); $stream.Dispose() }
  } finally { $zip.Dispose() }
}
function Assert-RecoveryCanProceed {
  param([bool]$ParentAlive,[bool]$HasLock,[int]$RemainingRunners)
  if (($HasLock -and !$ParentAlive) -or $RemainingRunners -ne 0) { throw 'OWNED_RUNNER_UNCONFIRMED' }
}
function Assert-OwnedListeners {
  param($Listeners,[int]$ExpectedProcessId)
  if (@($Listeners).Count -eq 0 -or @($Listeners | Where-Object { $_.LocalAddress -ne '127.0.0.1' -or $_.OwningProcess -ne $ExpectedProcessId }).Count -ne 0) { throw 'UNEXPECTED_LISTENER' }
}
function Invoke-CheckedDownload {
  param([string]$Source,[string]$Destination)
  try { & curl.exe --silent --show-error --fail --location --retry 0 --output $Destination $Source; if ($LASTEXITCODE -ne 0) { throw 'RUNTIME_DOWNLOAD_FAILED' } } catch { throw 'RUNTIME_DOWNLOAD_FAILED' }
}
function Assert-ReleaseChecksumText {
  param([string]$Text,[string]$ExpectedSha256)
  $pattern='(?m)^'+[regex]::Escape($ExpectedSha256)+'\s+\*?(?:\./)?ollama-windows-amd64\.zip\s*$'
  if ($Text -notmatch $pattern) { throw 'RELEASE_CHECKSUM_CHANGED' }
}
function Assert-ArtifactHash {
  param([string]$Artifact,[string]$ExpectedSha256)
  if (!(Test-Path -LiteralPath $Artifact) -or (Get-FileHash -LiteralPath $Artifact -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedSha256.ToLowerInvariant()) { throw 'ARTIFACT_HASH_MISMATCH' }
}
function Test-LocalListener {
  $client = New-Object Net.Sockets.TcpClient
  try { $task = $client.ConnectAsync('127.0.0.1',11434); if (!$task.Wait(500)) { return $false }; return $client.Connected } catch { return $false } finally { $client.Dispose() }
}
function Assert-FreeSpace {
  param([string]$Root)
  $drive = New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($Root))
  if ($drive.AvailableFreeSpace -lt 20GB) { throw 'INSUFFICIENT_DISK' }
}
function Get-OwnedProcess {
  param($Journal,[string]$ExpectedExecutable)
  $proc = Get-Process -Id $Journal.processId -ErrorAction SilentlyContinue
  if (!$proc) { return $null }
  if ($proc.Path -ne $ExpectedExecutable -or $proc.StartTime.ToUniversalTime().ToString('o') -ne $Journal.startedAt) { throw 'PROCESS_OWNERSHIP_MISMATCH' }
  return $proc
}
