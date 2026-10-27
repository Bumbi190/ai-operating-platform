# Docker-only concurrency proof. No Supabase credentials or production connection.
# Requires a locally available postgres:17-alpine image.
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$name='omnira-higgsfield-concurrent-'+([guid]::NewGuid().ToString('N').Substring(0,8))
$created=$false
if(-not (Get-Command docker -ErrorAction SilentlyContinue)){throw 'Docker is required'}
docker image inspect postgres:17-alpine *> $null
if($LASTEXITCODE -ne 0){throw 'Local postgres:17-alpine Docker image is required'}
try {
 docker run --rm -d --name $name -e 'POSTGRES_PASSWORD=local-fixture-only' postgres:17-alpine | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'Docker run failed' }
 $created=$true
 $ready=$false
 for($i=0;$i -lt 60;$i++){
   cmd.exe /c ('docker exec '+$name+' psql -U postgres -d postgres -At -c "select 1" >NUL 2>&1') | Out-Null
   if($LASTEXITCODE -eq 0){$ready=$true; break}
   Start-Sleep -Milliseconds 500
 }
 if(-not $ready){throw 'Postgres not ready'}
 $setup="create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.projects(id uuid primary key,name text not null,slug text not null,owner_id uuid not null references auth.users(id));alter default privileges for role postgres in schema public grant all privileges on tables to anon,authenticated,service_role;"
 docker exec $name psql -U postgres -v ON_ERROR_STOP=1 -c $setup | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Fixture setup failed'}
 docker cp "$root\apps\web\supabase\migrations\20261026200752_higgsfield_daily_budget.sql" "${name}:/tmp/migration.sql" | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Copy migration failed'}
 docker exec $name psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/migration.sql | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Apply fixture migration failed'}
 docker exec $name psql -U postgres -v ON_ERROR_STOP=1 -c "insert into auth.users(id)values('10000000-0000-4000-8000-000000000001');insert into public.projects(id,name,slug,owner_id) values ('20000000-0000-4000-8000-000000000001','The Prompt','ai-media-automation','10000000-0000-4000-8000-000000000001');" | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Fixture seed failed'}
 docker cp (Join-Path $PSScriptRoot 'concurrent-six-reservations.sh') "${name}:/tmp/concurrent.sh" | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Copy concurrency test failed'}
 docker exec $name sh /tmp/concurrent.sh
 if($LASTEXITCODE -ne 0){throw 'Concurrent reservation test failed'}
 Write-Output 'POSTGRES17_CONCURRENT_RESERVATION_TEST=PASS'
} finally {
 if($created){
  docker rm -f $name | Out-Null
  Write-Output 'CONCURRENCY_FIXTURE_CONTAINER_REMOVED'
 }
}
