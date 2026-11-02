# Read-only diagnostic snapshot from this Windows desktop.
# WARNING: Local machine observations are NOT broker attestation and NEVER authorize dispatch.
# Does not read secret contents, make remote model calls, mutate files, or start agents.
$ErrorActionPreference = 'Stop'
$now = [DateTimeOffset]::UtcNow
$preflight = $null
$preflightState = 'unavailable'
try {
  $raw = (& (Join-Path $PSScriptRoot 'preflight.ps1') 2>$null | Out-String)
  $p = $raw | ConvertFrom-Json -ErrorAction Stop
  if ($p -and $p.timestamp -and ($p.localModels -is [array])) {
    $preflight = $p
    $preflightState = 'observed'
  }
} catch { $preflightState = 'unavailable' }

$pilotRoot = 'C:\Users\Andre\Projects\Prime-Agent-Pilot'
$budgetState = 'unavailable'
$budget = $null
try {
  $script = Join-Path $pilotRoot 'run-review-pilot.mjs'
  $node = (Get-Command node -ErrorAction Stop).Source
  if (Test-Path -LiteralPath $script -PathType Leaf) {
    $raw = (& $node $script '--budget-status' 2>$null | Out-String)
    $v = $raw | ConvertFrom-Json -ErrorAction Stop
    if ($v -and $v.timezone -eq 'Europe/Stockholm' -and
        $v.codexRealDollarSpendKnown -eq $false -and
        $v.apiLimitUsd -ge 0 -and
        $v.codexRunSlotsRemaining -ge 0 -and $v.codexRunLimit -ge 0) {
      $budget = $v
      $budgetState = 'local_ledger_read'
    }
  }
} catch { $budgetState = 'unavailable' }

# The credential is NEVER opened. Existence is NOT proof of valid quota or token freshness.
$credentialPath = Join-Path $env:LOCALAPPDATA 'PrimeAgentPilotAuth\.prime\agent\auth.json'
$credentialPresent = Test-Path -LiteralPath $credentialPath -PathType Leaf

# Historical test artifacts are read from one fixed, explicitly approved synthetic job.
# No paths from the stored report are followed and no historical success is treated as a fresh smoke.
$reportState = 'unavailable'
$testCount = 0
$passed = 0
$reportObservedAt = $null
try {
  $runRoot = Join-Path $pilotRoot 'jobs\cart-safety-demo\runs\20261029064317-42e4fc'
  $reportPath = Join-Path $runRoot 'report.json'
  $tapPath = Join-Path $runRoot 'tests.tap'
  $source = Join-Path $pilotRoot 'jobs\cart-safety-demo\source\cart.mjs'
  $staged = Join-Path $runRoot 'workspace\cart.mjs'
  if ((Test-Path -LiteralPath $reportPath -PathType Leaf) -and
      (Test-Path -LiteralPath $tapPath -PathType Leaf) -and
      (Test-Path -LiteralPath $source -PathType Leaf) -and
      (Test-Path -LiteralPath $staged -PathType Leaf)) {
    $r = Get-Content -LiteralPath $reportPath -Raw -ErrorAction Stop | ConvertFrom-Json
    $tap = Get-Content -LiteralPath $tapPath -Raw -ErrorAction Stop
    $passMatch = [regex]::Match($tap, '(?m)^# pass (\d+)\r?$')
    $failMatch = [regex]::Match($tap, '(?m)^# fail (\d+)\r?$')
    $testMatch = [regex]::Match($tap, '(?m)^# tests (\d+)\r?$')
    $matches = $passMatch.Success -and $failMatch.Success -and $testMatch.Success
    if ($matches) {
      $passed = [int]$passMatch.Groups[1].Value
      $failed = [int]$failMatch.Groups[1].Value
      $testCount = [int]$testMatch.Groups[1].Value
      $changed = @( $r.changedFiles )
      $unexpected = @( $r.unexpectedChanges )
      $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
      $stageHash = (Get-FileHash -LiteralPath $staged -Algorithm SHA256).Hash
      if ($r.status -eq 'review_required' -and
          $r.productionIntegration -eq $false -and $r.sourceUntouched -eq $true -and
          $r.tests.pass -eq $passed -and $r.tests.fail -eq $failed -and
          $r.tests.tests -eq $testCount -and $passed -eq $testCount -and
          $testCount -gt 0 -and $failed -eq 0 -and $unexpected.Count -eq 0 -and
          $changed.Count -eq 1 -and $changed[0] -eq 'cart.mjs' -and
          $sourceHash -ne $stageHash) {
        $reportState = 'historical_locally_consistent'
        $reportObservedAt = (Get-Item -LiteralPath $reportPath).LastWriteTimeUtc.ToString('o')
      } else {
        $reportState = 'inconsistent'
      }
    } else { $reportState = 'inconsistent' }
  }
} catch { $reportState = 'unavailable' }

# Explicitly distinguish observed facts from independent broker-origin attestations.
[pscustomobject]@{
  schemaVersion = 'atlas.desktop-readiness.snapshot.v1'
  capturedAtMs = $now.ToUnixTimeMilliseconds()
  origin = 'unattested_windows_local'
  brokerAttested = $false
  dispatchAuthorized = $false
  preflight = [pscustomobject]@{
    state = $preflightState
    freeRamMB = if ($preflight) { [int]$preflight.freeRamMB } else { $null }
    gpu = if ($preflight) { $preflight.gpu } else { $null }
    localModels = if ($preflight) { @($preflight.localModels) } else { @() }
    ollamaServer = if ($preflight) { [bool]$preflight.ollamaServer } else { $false }
    resourceGatePassed = if ($preflight) { [bool]$preflight.localInferencePreflightPass } else { $false }
    inferenceSmokePassed = $false
    codexLoginSeen = if ($preflight) { $preflight.codex -eq 'chatgpt' } else { $false }
  }
  primePilot = [pscustomobject]@{
    credentialFilePresent = [bool]$credentialPresent
    entitlementVerified = $false
    toolSmokeFresh = $false
    pilotHumanApproved = $false
    historicalTestState = $reportState
    historicalTestCount = [int]$testCount
    historicalTestPass = [int]$passed
    historicalReportTimestamp = $reportObservedAt
  }
  budget = [pscustomobject]@{
    state = $budgetState
    day = if ($budget) { [string]$budget.date } else { $null }
    timezone = 'Europe/Stockholm'
    localApiBudgetLimitUsd = if ($budget) { [double]$budget.apiLimitUsd } else { $null }
    localApiReservedUsd = if ($budget) { [double]$budget.reservedApiUsd } else { $null }
    localCodexRunLimit = if ($budget) { [int]$budget.codexRunLimit } else { $null }
    localCodexRunSlotsRemaining = if ($budget) { [int]$budget.codexRunSlotsRemaining } else { $null }
    actualCodexUsdKnown = $false
  }
  note = 'Read-only untrusted diagnostic. Signed Code Broker evidence and a fresh task-specific smoke are still required.'
} | ConvertTo-Json -Depth 8 -Compress
