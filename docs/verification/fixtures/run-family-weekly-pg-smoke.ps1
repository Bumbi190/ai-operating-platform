# Disposable PostgreSQL 16/17 smoke test for proposed weekly SQL.
# Usage (from repo root):
#   powershell -NoProfile -File docs/verification/fixtures/run-family-weekly-pg-smoke.ps1 -Mode normal
#   powershell -NoProfile -File docs/verification/fixtures/run-family-weekly-pg-smoke.ps1 -Mode simulated-sunday
#   powershell -NoProfile -File docs/verification/fixtures/run-family-weekly-pg-smoke.ps1 -Mode native-claim
# NEVER connects to Supabase or an existing Docker network.
# Cached postgres:16 or postgres:17-alpine ONLY. No published ports, volumes or mounts.
# Simulated-Sunday rewrites SQL in memory ONLY for disposable tests.
param(
 [ValidateSet('normal','simulated-sunday','native-editorial','native-content','native-claim')]
 [string]$Mode='normal',
 [ValidateSet('postgres:16','postgres:17-alpine')]
 [string]$PostgresImage='postgres:16'
)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$name='omnira-family-weekly-test-'+$PID
$existing=(docker ps -a --filter "name=^/$name$" --format '{{.Names}}'|Out-String).Trim()
if($existing){throw 'DISPOSABLE_TEST_NAME_COLLISION'}
$started=$false
try{
 # Never download an image implicitly: only reuse an explicitly allowed,
 # already-cached image. Avoid unplanned workstation disk usage.
 docker image inspect $PostgresImage *> $null
 if($LASTEXITCODE -ne 0){throw 'DISPOSABLE_POSTGRES_IMAGE_NOT_CACHED'}
 Write-Output ('TEST_POSTGRES_IMAGE='+$PostgresImage)
 $containerId=(docker run --rm -d --pull=never --network none --name $name -e POSTGRES_PASSWORD=synthetic_only $PostgresImage)
 if($LASTEXITCODE -ne 0 -or -not $containerId){throw 'ISOLATED_TEST_POSTGRES_NOT_STARTED'}
 $started=$true
 $ready=$false
 for($i=0;$i -lt 25;$i++){
  docker exec $name pg_isready -U postgres *> $null
  if($LASTEXITCODE -eq 0){$ready=$true;break}
  Start-Sleep -Milliseconds 400
 }
 if(-not $ready){throw 'ISOLATED_TEST_POSTGRES_NOT_READY'}
 # Official Postgres container has an initdb bootstrap postmaster that may
 # briefly answer pg_isready before it switches to the final server.
 Start-Sleep -Milliseconds 900
 $connected=$false
 for($i=0;$i -lt 24;$i++){
  $probe=(docker exec $name psql -U postgres -At -c 'select 1' 2>$null | Out-String).Trim()
  if($LASTEXITCODE -eq 0 -and $probe -eq '1'){
   Start-Sleep -Milliseconds 250
   $probe2=(docker exec $name psql -U postgres -At -c 'select 1' 2>$null | Out-String).Trim()
   if($LASTEXITCODE -eq 0 -and $probe2 -eq '1'){$connected=$true;break}
  }
  Start-Sleep -Milliseconds 400
 }
 if(-not $connected){throw 'ISOLATED_TEST_POSTGRES_SQL_NOT_READY'}
 $files=@(
  'docs\verification\fixtures\family-weekly-pg-smoke-setup.sql',
  'docs\verification\fixtures\family-weekly-pg-parent-rls.sql',
  'docs\sql\20261028_family_weekly_auto_consent_proposed.sql',
  'docs\sql\20261028_family_weekly_review_notices_proposed.sql',
  'docs\sql\20261028_family_weekly_run_creator_proposed.sql',
  'docs\sql\20261028_family_weekly_once_only_model_attempt_proposed.sql'
 )
 if($Mode -eq 'normal'){$files+= 'docs\verification\fixtures\family-weekly-pg-smoke-assert.sql'}
 elseif($Mode -eq 'simulated-sunday'){$files+='docs\verification\fixtures\family-weekly-pg-queue-assert.sql'}
 elseif($Mode -ne 'native-claim'){$files+='docs\verification\fixtures\family-weekly-pg-native-deps.sql'}
 foreach($relative in $files){
  $file=Join-Path $repo $relative
  if(-not(Test-Path $file)){throw ('DISPOSABLE_TEST_FILE_MISSING:'+ $relative)}
  $raw=Get-Content -LiteralPath $file -Raw -Encoding UTF8
  if($Mode -in @('simulated-sunday','native-claim') -and
    $relative -match 'family_weekly_(run_creator|once_only_model_attempt)_proposed\.sql$'){
   $original="v_local:=clock_timestamp() at time zone 'Europe/Stockholm';"
   $replacement="v_local:=timestamp '2027-01-03 15:10:00';"
   if(-not $raw.Contains($original)){throw 'SYNTHETIC_TEST_CLOCK_SOURCE_CHANGED'}
   $raw=$raw.Replace($original,$replacement)
   Write-Output 'SIMULATED_LOCAL_SUNDAY_ONLY_IN_DISPOSABLE_COPY=true'
  }
  Write-Output ('APPLY_DISPOSABLE_ONLY='+ ($relative -split '\\')[-1])
  $raw | docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw ('DISPOSABLE_TEST_SQL_FAILED:'+ $relative)}
 }
 if($Mode -eq 'native-claim'){
  # Execute the actual canonical claim_runs body over the native Family queue,
  # not the synthetic tests' direct UPDATE into running state.
  $deps=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-claim-deps.sql'
  Get-Content -LiteralPath $deps -Raw -Encoding UTF8 |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'NATIVE_CLAIM_DEPENDENCIES_FAILED'}
  $source=Join-Path $repo 'apps\web\supabase\migrations\20261015041654_atlas_builder_studio_workspace.sql'
  $canonical=Get-Content -LiteralPath $source -Raw -Encoding UTF8
  $start=$canonical.IndexOf('create or replace function public.claim_runs(')
  $end=$canonical.IndexOf('$fn$;',$start)
  if($start -lt 0 -or $end -le $start){
   throw 'CANONICAL_CLAIM_RUNS_SOURCE_NOT_FOUND'
  }
  $native=$canonical.Substring($start,$end-$start+5)
  Write-Output 'LOAD_CANONICAL_CLAIM_RUNS_IN_DISPOSABLE_DB_ONLY=true'
  $native | docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_CLAIM_RUNS_LOAD_FAILED'}
  $assertFile=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-claim-assert.sql'
  Get-Content -LiteralPath $assertFile -Raw -Encoding UTF8 |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_CLAIM_RUNS_TEST_FAILED'}
 }
 if($Mode -eq 'native-content'){
  # Add synthetic prerequisites, then load the EXACT real content table and
  # writer/read/validation bodies, not the simplified native-editorial stubs.
  $deps=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-content-deps.sql'
  Get-Content -LiteralPath $deps -Raw -Encoding UTF8 |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'NATIVE_CONTENT_DEPENDENCIES_FAILED'}
  $source=Join-Path $repo 'apps\web\supabase\migrations\20261016100941_social_content_preparation_v1.sql'
  $text=Get-Content -LiteralPath $source -Raw -Encoding UTF8
  $t0=$text.IndexOf('create table public.social_content_posts(')
  $t1=$text.IndexOf('create trigger social_content_revisions_immutable',$t0)
  $f0=$text.IndexOf('create function public.social_content_validate(')
  $f1=$text.IndexOf('create function public.social_content_decide(',$f0)
  if($t0 -lt 0 -or $t1 -le $t0 -or $f0 -lt 0 -or $f1 -le $f0){
   throw 'CANONICAL_CONTENT_SOURCE_NOT_FOUND'
  }
  Write-Output 'LOAD_CANONICAL_SOCIAL_CONTENT_TABLES_AND_WRITER_IN_DISPOSABLE_DB_ONLY=true'
  $text.Substring($t0,$t1-$t0) |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'NATIVE_CONTENT_TABLES_FAILED'}
  $text.Substring($f0,$f1-$f0) |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'NATIVE_CONTENT_FUNCTIONS_FAILED'}
  'grant execute on function public.social_content_validate(jsonb), public.social_content_requirements(uuid), public.social_content_read(jsonb,jsonb), public.social_content_save(jsonb,jsonb) to service_role;' |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'NATIVE_CONTENT_GRANTS_FAILED'}
 }
 if($Mode -in @('native-editorial','native-content')){
  # The exact native save function is loaded from the reviewed canonical
  # migration; never copy/paste or silently simplify its PL/pgSQL.
  $sourcePath=Join-Path $repo 'apps\web\supabase\migrations\20261026090516_family_weekly_preparation.sql'
  $canonical=Get-Content -LiteralPath $sourcePath -Raw -Encoding UTF8
  $start=$canonical.IndexOf('create function public.social_weekly_save(')
  $end=$canonical.IndexOf('revoke all on function public.social_weekly_context',$start)
  if($start -lt 0 -or $end -le $start){throw 'CANONICAL_NATIVE_SAVE_SOURCE_NOT_FOUND'}
  $native=$canonical.Substring($start,$end-$start).Replace(
   'create function public.social_weekly_save(',
   'create or replace function public.social_weekly_save(')
  Write-Output 'LOAD_CANONICAL_NATIVE_SOCIAL_WEEKLY_SAVE_IN_DISPOSABLE_DB_ONLY=true'
  $native | docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'NATIVE_SAVE_FUNCTION_LOAD_FAILED'}
  $assertFile=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-assert.sql'
  Get-Content -LiteralPath $assertFile -Raw -Encoding UTF8 |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'NATIVE_WEEKLY_SAVE_TEST_FAILED'}
  if($Mode -eq 'native-content'){
   $contentAssert=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-content-assert.sql'
   Get-Content -LiteralPath $contentAssert -Raw -Encoding UTF8 |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'NATIVE_CONTENT_PERSISTENCE_ASSERT_FAILED'}
   $negative=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-content-negative.sql'
   Get-Content -LiteralPath $negative -Raw -Encoding UTF8 |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'NATIVE_CONTENT_NEGATIVE_ASSERT_FAILED'}
  }
 }
 Write-Output ('FAMILY_WEEKLY_ISOLATED_PG_'+$Mode+'_PASS=true')
}finally{
 if($started){
  docker stop $name | Out-Null
  # --rm cleanup can finish a moment after docker stop returns on Windows.
  # Wait for the EXACT uniquely named fixture to disappear; never touch
  # unrelated containers.
  $left=''
  for($cleanup=0;$cleanup -lt 20;$cleanup++){
   $left=(docker ps -a --filter "name=^/$name$" --format '{{.Names}}'|Out-String).Trim()
   if(-not $left){break}
   Start-Sleep -Milliseconds 250
  }
  if($left){throw 'DISPOSABLE_POSTGRES_NOT_REMOVED'}
  Write-Output 'ISOLATED_POSTGRES_CONTAINER_STOPPED_AND_REMOVED=true'
 }
}
