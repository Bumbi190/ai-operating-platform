param(
 [ValidateSet('postgres:16','postgres:17-alpine')]
 [string]$PostgresImage='postgres:17-alpine',
 [ValidateSet('public.ecr.aws/supabase/postgrest:v16.5','postgrest/postgrest:v16.5')]
 [string]$PostgrestImage='public.ecr.aws/supabase/postgrest:v16.5',
 [ValidateSet('node:22-alpine')]
 [string]$NodeImage='node:22-alpine'
)
# Disposable JWT/PostgREST integration test. No cloud or public host ports.
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$name='omnira-family-jwt-'+$PID
$net=$name+'-internal'
$pg=$name+'-pg'
$rest=$name+'-rest'
$secret=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')
$startedNet=$false
$startedPg=$false
$startedRest=$false
try{
 foreach($image in @($PostgresImage,$PostgrestImage,$NodeImage)){
  docker image inspect $image *> $null
  if($LASTEXITCODE -ne 0){throw ('JWT_TEST_IMAGE_NOT_CACHED:'+ $image)}
 }
 $existing=(docker ps -a --filter "name=^/$pg$" --format '{{.Names}}'|Out-String).Trim()
 if($existing){throw 'JWT_TEST_CONTAINER_NAME_COLLISION'}
 docker network create --internal --driver bridge $net | Out-Null
 if($LASTEXITCODE -ne 0){throw 'JWT_TEST_NETWORK_CREATE_FAILED'}
 $startedNet=$true
 Write-Output 'JWT_TEST_INTERNAL_DOCKER_NETWORK_ONLY=true'
 $pgid=(docker run --rm -d --pull=never --network $net --name $pg -e POSTGRES_PASSWORD=fs_fixture_postgres_only_20261029 $PostgresImage)
 if($LASTEXITCODE -ne 0 -or -not $pgid){throw 'JWT_TEST_POSTGRES_START_FAILED'}
 $startedPg=$true
 $ready=$false
 for($i=0;$i -lt 40;$i++){
  docker exec $pg pg_isready -U postgres *> $null
  if($LASTEXITCODE -eq 0){$ready=$true;break}
  Start-Sleep -Milliseconds 300
 }
 if(-not $ready){throw 'JWT_TEST_POSTGRES_NOT_READY'}
 Start-Sleep -Milliseconds 950
 $connected=$false
 for($i=0;$i -lt 30;$i++){
  $probe=(docker exec $pg psql -U postgres -At -c 'select 1' 2>$null|Out-String).Trim()
  if($LASTEXITCODE -eq 0 -and $probe -eq '1'){$connected=$true;break}
  Start-Sleep -Milliseconds 350
 }
 if(-not $connected){throw 'JWT_TEST_POSTGRES_SQL_NOT_READY'}
 $files=@(
  'docs\verification\fixtures\family-weekly-pg-smoke-setup.sql',
  'docs\verification\fixtures\family-weekly-pg-runs-constraints.sql',
  'docs\verification\fixtures\family-weekly-postgrest-test-roles.sql',
  'docs\verification\fixtures\family-weekly-pg-parent-rls.sql',
  'docs\sql\20261028_family_weekly_auto_consent_proposed.sql',
  'docs\sql\20261028_family_weekly_review_notices_proposed.sql',
  'docs\sql\20261028_family_weekly_run_creator_proposed.sql',
  'docs\sql\20261028_family_weekly_once_only_model_attempt_proposed.sql'
 )
 foreach($relative in $files){
  $full=Join-Path $repo $relative
  if(-not(Test-Path -LiteralPath $full)){throw ('JWT_TEST_SQL_FILE_MISSING:'+ $relative)}
  Write-Output ('JWT_TEST_DISPOSABLE_SQL_ONLY='+($relative -split '\\')[-1])
  Get-Content -LiteralPath $full -Raw -Encoding UTF8 |
   docker exec -i $pg psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw ('JWT_TEST_SCHEMA_FAILED:'+ $relative)}
 }
 $uri='postgresql://authenticator:fs_fixture_authenticator_only_20261029@'+$pg+':5432/postgres'
 $restArgs=@('run','--rm','-d','--pull=never','--network',$net,
  '--name',$rest,'-e',"PGRST_DB_URI=$uri",
  '-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon',
  '-e',"PGRST_JWT_SECRET=$secret",'-e','PGRST_SERVER_PORT=3000',
  '-e','PGRST_DB_POOL=2',$PostgrestImage)
 $restid=(& docker @restArgs)
 if($LASTEXITCODE -ne 0 -or -not $restid){throw 'JWT_TEST_POSTGREST_START_FAILED'}
 $startedRest=$true
 $portsPg=(docker port $pg|Out-String).Trim()
 $portsRest=(docker port $rest|Out-String).Trim()
 if($portsPg -or $portsRest){throw 'JWT_TEST_EXPOSED_A_HOST_PORT'}
 Write-Output 'JWT_TEST_ZERO_PUBLISHED_HOST_PORTS=true'
 $client=Join-Path $repo 'docs\verification\fixtures\family-weekly-postgrest-jwt-client.js'
 $clientArgs=@('run','--rm','-i','--pull=never','--network',$net,
  '--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
  '-e',"FAMILY_TEST_REST_URL=http://$($rest):3000",
  '-e',"FAMILY_TEST_JWT_SECRET=$secret",$NodeImage,'node','-')
 Write-Output 'JWT_TEST_CLIENT_SIGNED_TOKENS_IN_PRIVATE_NODE=true'
 Get-Content -LiteralPath $client -Raw -Encoding UTF8|& docker @clientArgs
 if($LASTEXITCODE -ne 0){throw 'JWT_TEST_HTTP_RLS_ASSERTIONS_FAILED'}
 Write-Output ('FAMILY_WEEKLY_SIGNED_JWT_POSTGREST_'+
  ($PostgresImage -replace '[^0-9a-z]+','_')+'_PASS=true')
}finally{
 if($startedRest){docker rm -f $rest *> $null}
 if($startedPg){docker rm -f $pg *> $null}
 if($startedNet){docker network rm $net *> $null}
 Write-Output 'JWT_TEST_ALL_ISOLATED_CONTAINERS_AND_NETWORK_REMOVED=true'
}
