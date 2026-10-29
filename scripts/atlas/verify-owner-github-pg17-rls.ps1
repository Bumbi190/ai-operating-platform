# Issue 604 – isolated REAL PostgreSQL 17 RLS replay. NO production/local
# Supabase DB access. Uses only the pre-cached Docker image; network disabled.
# Every test container is owned by this script and removed in finally.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$name = 'omnira-nova-rls-issue604-20261029'
$image = 'postgres:17-alpine'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$fixture = Join-Path $repo 'apps\web\lib\qa\fixtures\atlas-owner-github-rls'
$proposal = Join-Path $repo 'docs\architecture\proposed-sql\atlas_owner_github_bindings_stage1_PROPOSAL.sql'
$files = @(
  @{ Src = (Join-Path $fixture 'bootstrap_pg17.sql'); Dest = '/var/tmp/bootstrap_pg17.sql' },
  @{ Src = $proposal; Dest = '/var/tmp/proposal_pg17.sql' },
  @{ Src = (Join-Path $fixture 'verify_pg17.sql'); Dest = '/var/tmp/verify_pg17.sql' }
)
foreach ($f in $files) {
  if (-not (Test-Path -LiteralPath $f.Src -PathType Leaf)) {
    throw ('Missing fixture: ' + $f.Src)
  }
}
& docker image inspect $image --format '{{.Id}}' 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cached postgres:17-alpine image missing; no pull permitted' }
$existing = @(& docker ps -a --format '{{.Names}}')
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Docker containers' }
if ($existing -contains $name) { throw 'Fixture container name already in use, refusing to touch it' }

$created = $false
try {
  $cid = & docker run --rm -d --name $name --network none --memory 256m --cpus 0.6 --shm-size 32m `
    --tmpfs /var/lib/postgresql/data:rw,size=192m --tmpfs /tmp:rw,size=16m `
    -e POSTGRES_HOST_AUTH_METHOD=trust $image `
    -c fsync=off -c full_page_writes=off -c shared_buffers=16MB -c max_connections=10
  if ($LASTEXITCODE -ne 0 -or -not $cid) { throw 'Unable to create isolated fixture container' }
  $created = $true
  Write-Output ('[pg17] Started disposable, networkless fixture ' + $name)
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    & docker exec $name pg_isready -U postgres -d postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'Isolated PostgreSQL did not become healthy' }
  foreach ($f in $files) {
    & docker cp $f.Src ($name + ':' + $f.Dest)
    if ($LASTEXITCODE -ne 0) { throw ('Fixture copy failed: ' + $f.Dest) }
  }
  foreach ($f in $files) {
    Write-Output ('[pg17] Executing synthetic fixture: ' + $f.Dest)
    & docker exec $name psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f $f.Dest
    if ($LASTEXITCODE -ne 0) {
      throw ('Isolated SQL assertions failed at: ' + $f.Dest)
    }
  }
  Write-Output '[pg17] PASS: isolated PostgreSQL 17 roles, RLS, FK, grant and denial assertions'
}
finally {
  if ($created) {
    & docker stop --time 1 $name *> $null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning ('Check own leftover container manually: ' + $name)
    } else {
      Write-Output '[pg17] Disposable fixture stopped and auto-removed'
    }
  }
}
