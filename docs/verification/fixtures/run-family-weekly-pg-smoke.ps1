# Disposable PostgreSQL 16/17 smoke test for proposed weekly SQL.
# Usage (from repo root):
#   powershell -NoProfile -File docs/verification/fixtures/run-family-weekly-pg-smoke.ps1 -Mode normal
#   powershell -NoProfile -File docs/verification/fixtures/run-family-weekly-pg-smoke.ps1 -Mode simulated-sunday
#   powershell -NoProfile -File docs/verification/fixtures/run-family-weekly-pg-smoke.ps1 -Mode native-claim
# NEVER connects to Supabase or an existing Docker network.
# Cached postgres:16 or postgres:17-alpine ONLY. No published ports, volumes or mounts.
# Simulated-Sunday rewrites SQL in memory ONLY for disposable tests.
param(
 [ValidateSet('normal','simulated-sunday','native-editorial','native-content','native-context','native-binding','native-plan-assets','native-schedule','native-claim','native-concurrency','native-revoke-race')]
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
  'docs\verification\fixtures\family-weekly-pg-runs-constraints.sql',
  'docs\verification\fixtures\family-weekly-pg-parent-rls.sql',
  'docs\sql\20261028_family_weekly_auto_consent_proposed.sql',
  'docs\sql\20261028_family_weekly_review_notices_proposed.sql',
  'docs\sql\20261028_family_weekly_run_creator_proposed.sql',
  'docs\sql\20261028_family_weekly_once_only_model_attempt_proposed.sql'
 )
 if($Mode -eq 'normal'){$files+= 'docs\verification\fixtures\family-weekly-pg-smoke-assert.sql'}
 elseif($Mode -eq 'simulated-sunday'){$files+='docs\verification\fixtures\family-weekly-pg-queue-assert.sql'}
 elseif($Mode -notin @('native-claim','native-concurrency','native-revoke-race')){$files+='docs\verification\fixtures\family-weekly-pg-native-deps.sql'}
 foreach($relative in $files){
  $file=Join-Path $repo $relative
  if(-not(Test-Path $file)){throw ('DISPOSABLE_TEST_FILE_MISSING:'+ $relative)}
  $raw=Get-Content -LiteralPath $file -Raw -Encoding UTF8
  if($Mode -in @('simulated-sunday','native-claim','native-concurrency','native-revoke-race') -and
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
 if($Mode -in @('native-claim','native-concurrency','native-revoke-race')){
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
  $claimAssertName=if($Mode -eq 'native-revoke-race'){
   'family-weekly-pg-native-revoke-race-assert.sql'
  }elseif($Mode -eq 'native-concurrency'){
   'family-weekly-pg-native-concurrency-assert.sql'
  }else{'family-weekly-pg-native-claim-assert.sql'}
  $assertFile=Join-Path $repo ('docs\verification\fixtures\'+$claimAssertName)
  Get-Content -LiteralPath $assertFile -Raw -Encoding UTF8 |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_CLAIM_RUNS_TEST_FAILED'}
 }
 if($Mode -in @('native-content','native-context','native-binding','native-plan-assets','native-schedule')){
  # This extended mode swaps the simplified account binding table for the
  # real 20260914 table, CHECKs, unique indexes and immutable triggers.
  # All other narrow test modes retain their original fixture.
  $depName=if($Mode -in @('native-plan-assets','native-schedule')){
   'family-weekly-pg-native-plan-asset-deps.sql'
  }elseif($Mode -eq 'native-binding'){
   'family-weekly-pg-native-binding-deps.sql'
  }else{'family-weekly-pg-native-content-deps.sql'}
  $deps=Join-Path $repo ('docs\verification\fixtures\'+$depName)
  Get-Content -LiteralPath $deps -Raw -Encoding UTF8 |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'NATIVE_CONTENT_DEPENDENCIES_FAILED'}
  if($Mode -in @('native-binding','native-plan-assets','native-schedule')){
   $bindingPath=Join-Path $repo 'apps\web\supabase\migrations\20260914120000_social_account_bindings.sql'
   $binding=Get-Content -LiteralPath $bindingPath -Raw -Encoding UTF8
   $b0=$binding.IndexOf('create table if not exists public.social_account_bindings (')
   if($b0 -lt 0){throw 'CANONICAL_BINDING_SOURCE_NOT_FOUND'}
   Write-Output 'LOAD_CANONICAL_PROVIDER_BINDINGS_AND_GUARDS=true'
   $binding.Substring($b0) |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_BINDING_SCHEMA_LOAD_FAILED'}
   $bindingSeed=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-binding-seed.sql'
   Get-Content -LiteralPath $bindingSeed -Raw -Encoding UTF8 |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_BINDING_SEED_FAILED'}
  }
  if($Mode -in @('native-plan-assets','native-schedule')){
   # Reproduce the exact production launch plan root/revisions/decisions,
   # composite FKs, immutability triggers and owner/plan RPCs.
   $planPath=Join-Path $repo 'apps\web\supabase\migrations\20261016052226_social_launch_plans_v1.sql'
   $plan=Get-Content -LiteralPath $planPath -Raw -Encoding UTF8
   if(-not $plan.Contains('create function public.social_launch_assert_owner(') -or
      -not $plan.Contains('create trigger social_launch_revisions_immutable')){
    throw 'CANONICAL_LAUNCH_PLAN_SOURCE_CHANGED'
   }
   # Only adapt CREATE to OR REPLACE for the already installed test-only
   # owner guard; the canonical function body itself is unchanged.
   $plan=$plan.Replace('create function public.social_launch_assert_owner(',
      'create or replace function public.social_launch_assert_owner(')
   Write-Output 'LOAD_CANONICAL_LAUNCH_PLAN_TABLES_FKS_TRIGGERS_RPCS=true'
   $plan | docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_LAUNCH_PLAN_LOAD_FAILED'}

   # Assets is the single media identity table; the rest of the large
   # media migration involves unrelated provenance and website outputs.
   $mediaPath=Join-Path $repo 'apps\web\supabase\migrations\20260902_media_asset_foundation.sql'
   $media=Get-Content -LiteralPath $mediaPath -Raw -Encoding UTF8
   $a0=$media.IndexOf('create table if not exists public.assets (')
   $a1=$media.IndexOf('create table if not exists public.asset_provenance (',$a0)
   $policy0=$media.IndexOf('drop policy if exists "assets_owner" on public.assets;')
   $policy1=$media.IndexOf('-- Provenance inherits',$policy0)
   if($a0 -lt 0 -or $a1 -le $a0 -or $policy0 -lt 0 -or $policy1 -le $policy0){
    throw 'CANONICAL_ASSETS_SOURCE_CHANGED'
   }
   Write-Output 'LOAD_CANONICAL_ASSET_TABLE_CHECKS_INDEXES_AND_OWNER_RLS=true'
   $media.Substring($a0,$a1-$a0) |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_ASSET_TABLE_LOAD_FAILED'}
   # The exact policy text comes from the canonical media migration;
   # explicit SELECT grants match the read-only permissions observed in
   # Omnira production, without granting INSERT/UPDATE to browser roles.
   $assetAcl='alter table public.assets enable row level security;'+"`n"+
    $media.Substring($policy0,$policy1-$policy0)+"`n"+
    'revoke all on public.assets from public,anon,authenticated,service_role;'+"`n"+
    'grant select on public.assets to authenticated,service_role;'
   $assetAcl | docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_ASSETS_RLS_LOAD_FAILED'}

   $seed=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-plan-asset-seed.sql'
   Get-Content -LiteralPath $seed -Raw -Encoding UTF8 |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_LAUNCH_PLAN_ASSET_SEED_FAILED'}
  }
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
  if($Mode -in @('native-plan-assets','native-schedule')){
   $triggerStart=$text.IndexOf('create trigger social_content_revisions_immutable')
   $triggerEnd=$text.IndexOf('create function public.social_content_active(',$triggerStart)
   if($triggerStart -lt 0 -or $triggerEnd -le $triggerStart){
    throw 'CANONICAL_CONTENT_IMMUTABLE_TRIGGERS_SOURCE_CHANGED'
   }
   Write-Output 'LOAD_CANONICAL_CONTENT_IMMUTABILITY_TRIGGERS=true'
   $text.Substring($triggerStart,$triggerEnd-$triggerStart) |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_CONTENT_IMMUTABLE_TRIGGERS_LOAD_FAILED'}
  }
  $text.Substring($f0,$f1-$f0) |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'NATIVE_CONTENT_FUNCTIONS_FAILED'}
  'grant execute on function public.social_content_validate(jsonb), public.social_content_requirements(uuid), public.social_content_read(jsonb,jsonb), public.social_content_save(jsonb,jsonb) to service_role;' |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'NATIVE_CONTENT_GRANTS_FAILED'}
 }
 if($Mode -in @('native-context','native-binding','native-plan-assets','native-schedule')){
  # Profile tables, source-backed profile reader, real scheduling canonicalizer
  # and real weekly context: extract from canonical migrations, never rewrite
  # any business-logic body. The synthetic dependency tables are clearly named.
  $profilePath=Join-Path $repo 'apps\web\supabase\migrations\20261016113247_social_project_profiles_v1.sql'
  $profile=Get-Content -LiteralPath $profilePath -Raw -Encoding UTF8
  $t0=$profile.IndexOf('create table public.social_project_profiles(')
  $t1=$profile.IndexOf('create trigger social_profile_revisions_immutable',$t0)
  $f0=$profile.IndexOf('create function public.social_profile_read(')
  $f1=$profile.IndexOf('create function public.social_profile_save(',$f0)
  if($t0 -lt 0 -or $t1 -le $t0 -or $f0 -lt 0 -or $f1 -le $f0){
   throw 'CANONICAL_PROFILE_SOURCE_NOT_FOUND'
  }
  $profile.Substring($t0,$t1-$t0) |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_PROFILE_TABLES_LOAD_FAILED'}
  $profile.Substring($f0,$f1-$f0) |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_PROFILE_READER_LOAD_FAILED'}
  'grant execute on function public.social_profile_read(jsonb,jsonb) to service_role;' |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_PROFILE_GRANTS_FAILED'}

  $schedulePath=Join-Path $repo 'apps\web\supabase\migrations\20261018071209_social_schedule_batches.sql'
  $schedule=Get-Content -LiteralPath $schedulePath -Raw -Encoding UTF8
  $s0=$schedule.IndexOf('create function public.social_schedule_fields(')
  $s1=$schedule.IndexOf('create function public.social_schedule_resolve_minute(',$s0)
  if($s0 -lt 0 -or $s1 -le $s0){throw 'CANONICAL_SCHEDULE_CANONICAL_SOURCE_NOT_FOUND'}
  'drop function public.social_schedule_fields(jsonb,text[]);' |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'SYNTHETIC_SCHEDULE_FIELDS_DROP_FAILED'}
  $schedule.Substring($s0,$s1-$s0).Replace(
   'create function public.social_schedule_canonical(',
   'create or replace function public.social_schedule_canonical(') |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_SCHEDULE_HELPERS_LOAD_FAILED'}
  'grant execute on function public.social_schedule_fields(jsonb,text[],text[]),public.social_schedule_canonical(jsonb) to service_role;' |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_SCHEDULE_HELPERS_GRANTS_FAILED'}
  $resolveStart=$schedule.IndexOf('create function public.social_schedule_resolve_minute(')
  $resolveEnd=$schedule.IndexOf('create table public.social_schedule_batches(',$resolveStart)
  if($resolveStart -lt 0 -or $resolveEnd -le $resolveStart){
   throw 'CANONICAL_SCHEDULE_RESOLVE_SOURCE_NOT_FOUND'
  }
  $schedule.Substring($resolveStart,$resolveEnd-$resolveStart).Replace(
   'create function public.social_schedule_resolve_minute(',
   'create or replace function public.social_schedule_resolve_minute(') |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_SCHEDULE_RESOLVE_LOAD_FAILED'}

  # The real text duplicate / similarity implementation is important:
  # the earlier native-content test intentionally stubbed similarity=0.
  $repeatPath=Join-Path $repo 'apps\web\supabase\migrations\20261026070303_family_social_repeat_guard.sql'
  $repeat=Get-Content -LiteralPath $repeatPath -Raw -Encoding UTF8
  $r0=$repeat.IndexOf('create function public.social_repeat_normalize(')
  $r1=$repeat.IndexOf('revoke all on function public.social_repeat_normalize(',$r0)
  if($r0 -lt 0 -or $r1 -le $r0){throw 'CANONICAL_REPEAT_HELPERS_SOURCE_NOT_FOUND'}
  # DROP fixture stubs first: the canonical normalize helper has a
  # different argument name and PostgreSQL rejects CREATE OR REPLACE.
  'drop function public.social_repeat_similarity(text,text); drop function public.social_repeat_normalize(text);' |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'SYNTHETIC_REPEAT_HELPERS_DROP_FAILED'}
  $realRepeat=$repeat.Substring($r0,$r1-$r0)
  Write-Output 'LOAD_CANONICAL_REPEAT_HELPERS_IN_DISPOSABLE_DB_ONLY=true'
  $realRepeat | docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_REPEAT_HELPERS_LOAD_FAILED'}
  'grant execute on function public.social_repeat_normalize(text),public.social_repeat_similarity(text,text) to service_role;' |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_REPEAT_HELPERS_GRANTS_FAILED'}

  if($Mode -eq 'native-schedule'){
   # The owner-only scheduled job and manual publication tables are no
   # longer test doubles in this mode. Extract exactly the base DDL/FKs/
   # RLS/triggers/grants without installing dispatch workers or routines.
   $publicationPath=Join-Path $repo 'apps\web\supabase\migrations\20261016115402_social_manual_publication_v1.sql'
   $pub=Get-Content -LiteralPath $publicationPath -Raw -Encoding UTF8
   $p0=$pub.IndexOf('create table public.social_publications(')
   $p1=$pub.IndexOf('create function public.social_publication_record(',$p0)
   if($p0 -lt 0 -or $p1 -le $p0){throw 'CANONICAL_PUBLICATION_TABLE_SOURCE_CHANGED'}
   Write-Output 'LOAD_CANONICAL_PUBLICATIONS_EVENTS_RECEIPTS_AND_FKS=true'
   $pub.Substring($p0,$p1-$p0) |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_PUBLICATION_TABLES_LOAD_FAILED'}

   $s0=$schedule.IndexOf('create table public.social_schedule_batches(')
   $s1=$schedule.IndexOf('create or replace function public.social_publication_record(',$s0)
   if($s0 -lt 0 -or $s1 -le $s0){
    throw 'CANONICAL_SCHEDULE_TABLES_SOURCE_CHANGED'
   }
   Write-Output 'LOAD_CANONICAL_SCHEDULE_BATCH_DECISION_JOB_EVENT_RULES_FKS=true'
   $schedule.Substring($s0,$s1-$s0) |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_SCHEDULE_TABLES_LOAD_FAILED'}

   # The exact owner-review guards must refuse unpublished/unapproved
   # editorial content even if an attacker supplies all item fields.
   $g0=$pub.IndexOf('create function public.social_publication_guard(')
   $g1=$pub.IndexOf('create function public.social_publication_read(',$g0)
   $sg0=$schedule.IndexOf('create function public.social_schedule_item_guard(')
   $sg1=$schedule.IndexOf('create function public.social_schedule_validate_manifest(',$sg0)
   if($g0 -lt 0 -or $g1 -le $g0 -or $sg0 -lt 0 -or $sg1 -le $sg0){
    throw 'CANONICAL_PUBLICATION_SCHEDULE_OWNER_GUARDS_SOURCE_CHANGED'
   }
   Write-Output 'LOAD_CANONICAL_MANUAL_PUBLICATION_AND_SCHEDULE_REVIEW_GUARDS=true'
   $pub.Substring($g0,$g1-$g0) |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_PUBLICATION_OWNER_GUARD_LOAD_FAILED'}
   $schedule.Substring($sg0,$sg1-$sg0) |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_SCHEDULE_OWNER_GUARD_LOAD_FAILED'}
   'revoke all on function public.social_publication_guard(jsonb,jsonb),public.social_schedule_item_guard(uuid,jsonb) from public,anon,authenticated; grant execute on function public.social_publication_guard(jsonb,jsonb),public.social_schedule_item_guard(uuid,jsonb) to service_role;' |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_SCHEDULE_PUBLICATION_GUARD_GRANTS_FAILED'}
   $deps=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-schedule-seed.sql'
  }else{
   $deps=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-context-deps.sql'
  }
  Write-Output 'SEED_OWNED_PROFILE_DESCRIBED_IMAGE_AND_REVIEW_ONLY_CONTEXT=true'
  Get-Content -LiteralPath $deps -Raw -Encoding UTF8 |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_CONTEXT_DEPENDENCIES_FAILED'}

  $weeklyPath=Join-Path $repo 'apps\web\supabase\migrations\20261026090516_family_weekly_preparation.sql'
  $weekly=Get-Content -LiteralPath $weeklyPath -Raw -Encoding UTF8
  $w0=$weekly.IndexOf('create function public.social_weekly_context(')
  $w1=$weekly.IndexOf('create function public.social_weekly_save(',$w0)
  if($w0 -lt 0 -or $w1 -le $w0){throw 'CANONICAL_WEEKLY_CONTEXT_SOURCE_NOT_FOUND'}
  $context=$weekly.Substring($w0,$w1-$w0).Replace(
   'create function public.social_weekly_context(',
   'create or replace function public.social_weekly_context(')
  Write-Output 'LOAD_CANONICAL_WEEKLY_CONTEXT_IN_DISPOSABLE_DB_ONLY=true'
  $context | docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_WEEKLY_CONTEXT_LOAD_FAILED'}
  $assertFile=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-context-assert.sql'
  Get-Content -LiteralPath $assertFile -Raw -Encoding UTF8 |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_WEEKLY_CONTEXT_ASSERT_FAILED'}
  # Also verify the full review-only persistence chain with the REAL
  # contextHash, source-backed profile/assets, real repeat checks and
  # canonical social_content_save. All writes are to disposable PG only.
  $saveStart=$weekly.IndexOf('create function public.social_weekly_save(',$w1)
  $saveEnd=$weekly.IndexOf('revoke all on function public.social_weekly_context',$saveStart)
  if($saveStart -lt 0 -or $saveEnd -le $saveStart){
   throw 'CANONICAL_WEEKLY_SAVE_SOURCE_NOT_FOUND'
  }
  $save=$weekly.Substring($saveStart,$saveEnd-$saveStart).Replace(
   'create function public.social_weekly_save(',
   'create or replace function public.social_weekly_save(')
  Write-Output 'LOAD_CANONICAL_NATIVE_SAVE_AFTER_REAL_CONTEXT=true'
  $save | docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_NATIVE_CONTEXT_SAVE_LOAD_FAILED'}
  $saveAssert=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-context-save-assert.sql'
  Get-Content -LiteralPath $saveAssert -Raw -Encoding UTF8 |
   docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw 'CANONICAL_NATIVE_CONTEXT_SAVE_ASSERT_FAILED'}
  if($Mode -in @('native-binding','native-plan-assets','native-schedule')){
   $bindingAssert=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-binding-assert.sql'
   Get-Content -LiteralPath $bindingAssert -Raw -Encoding UTF8 |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_NATIVE_BINDING_GUARDS_ASSERT_FAILED'}
  }
  if($Mode -in @('native-plan-assets','native-schedule')){
   $planAssetAssert=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-plan-asset-assert.sql'
   Get-Content -LiteralPath $planAssetAssert -Raw -Encoding UTF8 |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_NATIVE_PLAN_ASSET_ASSERT_FAILED'}
  }
  if($Mode -eq 'native-schedule'){
   $scheduleAssert=Join-Path $repo 'docs\verification\fixtures\family-weekly-pg-native-schedule-assert.sql'
   Get-Content -LiteralPath $scheduleAssert -Raw -Encoding UTF8 |
    docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q
   if($LASTEXITCODE -ne 0){throw 'CANONICAL_NATIVE_SCHEDULE_PUBLICATION_ASSERT_FAILED'}
  }
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
