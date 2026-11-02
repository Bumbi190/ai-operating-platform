# This fixture never touches existing Docker containers, production databases,
# API services or customer photos: new network-none container with no mounts.
param()
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$fixture = Join-Path $root 'docs\verification\web-studio'
$proposal = Join-Path $root 'docs\sql\atlas-studio-real-vehicle-captures-p1b-proposed.sql'
$name = "omnira-vehicle-capture-rls-$PID"
$created = $false
function Run-Docker {
 param([string[]]$Arguments)
 & docker @Arguments
 if ($LASTEXITCODE -ne 0) { throw "Disposable Docker command failed: $($Arguments[0]) exit $LASTEXITCODE" }
}
try {
 Run-Docker @('run','-d','--name',$name,'--network','none','--memory','192m',
   '--cpus','1','--pids-limit','80','--shm-size','32m',
   '-e','POSTGRES_PASSWORD=synthetic-local-only',
   '-e','POSTGRES_DB=vehicle_capture_rls_fixture',
    'postgres:17-alpine','postgres','-c','shared_buffers=16MB','-c','max_connections=12')
 $created = $true
 $ready = $false
 for ($i=0;$i -lt 50;$i++) {
   & docker exec $name pg_isready -U postgres -d vehicle_capture_rls_fixture 2>$null | Out-Null
   if ($LASTEXITCODE -eq 0) { $ready=$true; break }
   Start-Sleep -Milliseconds 400
 }
 if (-not $ready) { throw 'Disposable PostgreSQL did not become ready' }
 # Official Postgres image starts, stops and re-starts a temporary server
 # during initialization. Verify the FINAL server, not the init-only socket.
 Start-Sleep -Seconds 3
 $ready = $false
 for ($i=0;$i -lt 30;$i++) {
   & docker exec $name pg_isready -U postgres -d vehicle_capture_rls_fixture 2>$null | Out-Null
   if ($LASTEXITCODE -eq 0) { $ready=$true; break }
   Start-Sleep -Milliseconds 400
 }
 if (-not $ready) { throw 'Final disposable PostgreSQL server did not become ready' }

 $files = @(
  @{source=(Join-Path $fixture 'vehicle-capture-rls-bootstrap.sql');target='/tmp/bootstrap.sql'},
  @{source=$proposal;target='/tmp/proposal.sql'},
  @{source=(Join-Path $fixture 'vehicle-capture-rls-assertions.sql');target='/tmp/assertions.sql'},
  @{source=(Join-Path $fixture 'vehicle-review-audit-bootstrap.sql');target='/tmp/audit-bootstrap.sql'},
  @{source=(Join-Path $root 'docs\\sql\\atlas-studio-real-vehicle-review-audit-p2b-proposed.sql');target='/tmp/audit-proposal.sql'},
  @{source=(Join-Path $fixture 'vehicle-review-audit-assertions.sql');target='/tmp/audit-assertions.sql'}
 )
 foreach ($file in $files) {
   Run-Docker @('cp',$file.source,($name+':'+$file.target))
 }
 foreach ($file in $files) {
   Run-Docker @('exec',$name,'psql','-X','-v','ON_ERROR_STOP=1',
     '-U','postgres','-d','vehicle_capture_rls_fixture','-f',$file.target)
 }
 Write-Host 'PASS: isolated Postgres vehicle photo RLS and append-only reviewer audit assertions.'
} finally {
 if ($created) {
  & docker rm -f $name 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Warning "Could not remove disposable container $name" }
 }
}
