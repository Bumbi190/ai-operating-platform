# The Prompt FactCheck: local PostgreSQL 17 physical security regression.
#
# ONLY uses the already-running "omnira-atlas-voice-actions-test-20261026"
# postgres:17-alpine local Docker test cluster. Never creates a container.
# Creates a unique throwaway DB, tests draft SQL, then drops that DB even
# after failure. Never accesses a production Supabase project or its secrets.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$container = 'omnira-atlas-voice-actions-test-20261026'
$context = (& docker context show).Trim()
if ($LASTEXITCODE -ne 0 -or $context -notin @('default','desktop-linux')) {
  throw 'FACTCHECK_TEST_NONLOCAL_DOCKER_CONTEXT'
}
$imageStatus = (& docker inspect --format '{{.Config.Image}}|{{.State.Status}}' $container).Trim()
if ($LASTEXITCODE -ne 0 -or $imageStatus -ne 'postgres:17-alpine|running') {
  throw 'FACTCHECK_TEST_CONTAINER_MISMATCH_OR_STOPPED'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$files = @(
  (Join-Path $repoRoot 'docs\workflows\factcheck-postgres-test-bootstrap.sql'),
  (Join-Path $repoRoot 'docs\workflows\proposed-migrations\20261028131815_the_prompt_factcheck_evidence_v1.sql'),
  (Join-Path $repoRoot 'docs\workflows\factcheck-postgres-test-assertions.sql')
)
foreach($file in $files) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "FACTCHECK_FIXTURE_MISSING: $file"
  }
}
$db = 'factcheck_tmp_' + (Get-Date -Format 'yyyyMMddHHmmss') + '_' + $PID
if ($db -notmatch '^factcheck_tmp_[0-9_]+$') {
  throw 'FACTCHECK_DATABASE_NAME_INVALID'
}
$paths = @(
  ('/tmp/' + $db + '_00.sql'),
  ('/tmp/' + $db + '_10.sql'),
  ('/tmp/' + $db + '_20.sql')
)
$created = $false
$success = $false
try {
  $existing = & docker exec $container psql -U postgres -d postgres -Atqc "select 1 from pg_database where datname='$db';"
  if ($LASTEXITCODE -ne 0 -or ($existing | Out-String).Trim() -ne '') {
    throw 'FACTCHECK_DATABASE_COLLISION_OR_UNAVAILABLE'
  }
  & docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db"
  if ($LASTEXITCODE -ne 0) { throw 'FACTCHECK_TEMP_DATABASE_CREATE_FAILED' }
  $created = $true

  for($i=0;$i -lt $files.Count;$i++) {
    & docker cp $files[$i] ("$($container):" + $paths[$i])
    if ($LASTEXITCODE -ne 0) { throw "FACTCHECK_FIXTURE_COPY_FAILED:$i" }
    & docker exec $container psql -U postgres -d $db -v ON_ERROR_STOP=1 -f $paths[$i]
    if ($LASTEXITCODE -ne 0) { throw "FACTCHECK_POSTGRES_ASSERTIONS_FAILED:$i" }
  }
  $success = $true
} finally {
  if($created) {
    # This exact, uniquely named database is the ONLY database we ever drop.
    & docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE $db WITH (FORCE)"
    if($LASTEXITCODE -ne 0) {
      Write-Warning "FACTCHECK_TEMP_DB_CLEANUP_FAILED: $db"
      $success = $false
    }
  }
  foreach($path in $paths) {
    & docker exec $container rm -f $path 2>$null
  }
}
if(-not $success) {throw 'FACTCHECK_POSTGRES_LOCAL_ISOLATION_FAILED'}
Write-Output 'FACTCHECK_POSTGRES_LOCAL_ISOLATION_PASSED_AND_CLEANED'
