# Read-only probe. Does NOT execute models, read tokens, or change settings.
$ErrorActionPreference = 'Continue'
$os = Get-CimInstance Win32_OperatingSystem
$freeMB = [int]($os.FreePhysicalMemory / 1024)
$gpu = $null
try {
  $nvidia = & nvidia-smi --query-gpu=name,memory.total,memory.free,temperature.gpu --format=csv,noheader,nounits 2>$null | Select-Object -First 1
  if ($nvidia) {
    $parts = $nvidia -split ',\s*'
    $gpu = @{
      name=$parts[0]
      totalVramMB=[int]$parts[1]
      freeVramMB=[int]$parts[2]
      temperatureC=[int]$parts[3]
    }
  }
} catch { }
$hasOllama = $false
$models = @()
try {
  $tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3
  $hasOllama = $true
  $models = @($tags.models | ForEach-Object { $_.name })
} catch { }
$codexStatus = 'not_installed'
$codexBin = Join-Path $env:APPDATA 'npm\codex.cmd'
if (Test-Path $codexBin) {
  try {
    $login = (& $codexBin login status 2>&1 | Out-String)
    $codexStatus = if ($login -match 'Logged in using ChatGPT') { 'chatgpt' } else { 'needs_verification' }
  } catch { $codexStatus = 'needs_verification' }
}
$abacusStatus = 'not_installed'
$abacusBin = Join-Path $env:APPDATA 'npm\abacusai.cmd'
if (Test-Path $abacusBin) {
  try {
    $login = (& $abacusBin auth status 2>&1 | Out-String)
    $abacusStatus = if ($login -match 'Not logged in') { 'not_logged_in' } else { 'needs_verification' }
  } catch { $abacusStatus = 'needs_verification' }
}
$resourceGate = $false
if ($gpu) {
  $resourceGate = $hasOllama -and $freeMB -ge 4096 -and $gpu.freeVramMB -ge 4096 -and $gpu.temperatureC -lt 80
}
[pscustomobject]@{
  timestamp=(Get-Date).ToString('o')
  freeRamMB=$freeMB
  gpu=$gpu
  ollamaServer=$hasOllama
  localModels=$models
  codex=$codexStatus
  abacus=$abacusStatus
  localInferencePreflightPass=[bool]$resourceGate
  note='Read-only readiness check; passing does not prove that inference or model routing works.'
} | ConvertTo-Json -Depth 5
