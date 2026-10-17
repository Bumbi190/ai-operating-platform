$ErrorActionPreference = 'Stop'
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
