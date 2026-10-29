param(
 [ValidateSet('postgres:17-alpine','postgres:16')]
 [string]$PostgresImage='postgres:17-alpine'
)
# Real Supabase GoTrue email/password -> signed JWT -> PostgREST RLS.
# Every container resides on a new --internal Docker network, without host ports.
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$name='omnira-family-gotrue-'+$PID
$net=$name+'-isolated'
$pg=$name+'-pg'
$auth=$name+'-auth'
$rest=$name+'-rest'
$pgPass=[guid]::NewGuid().ToString('N')
$restPass=[guid]::NewGuid().ToString('N')
$jwtSecret=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')
$authImage='public.ecr.aws/supabase/gotrue:v2.197.0'
$restImage='public.ecr.aws/supabase/postgrest:v16.5'
$nodeImage='node:22-alpine'
$startedNet=$false
$startedPg=$false
$startedAuth=$false
$startedRest=$false
try {
 foreach($image in @($PostgresImage,$authImage,$restImage,$nodeImage)){
  docker image inspect $image *> $null
  if($LASTEXITCODE -ne 0){throw ('GOTRUE_IMAGE_NOT_CACHED:'+ $image)}
 }
 docker network create --internal --driver bridge $net | Out-Null
 if($LASTEXITCODE -ne 0){throw 'GOTRUE_DOCKER_INTERNAL_NETWORK_FAILED'}
 $startedNet=$true
 Write-Output 'GOTRUE_TEST_DOCKER_INTERNAL_NETWORK_ONLY=true'
 $pgid=(& docker run --rm -d --pull=never --network $net --name $pg -e "POSTGRES_PASSWORD=$pgPass" $PostgresImage)
 if($LASTEXITCODE -ne 0 -or -not $pgid){throw 'GOTRUE_TEST_POSTGRES_START_FAILED'}
 $startedPg=$true
 $ready=$false
 for($i=0;$i -lt 55;$i++){
  docker exec $pg pg_isready -U postgres *> $null
  if($LASTEXITCODE -eq 0){$ready=$true;break}
  Start-Sleep -Milliseconds 300
 }
 if(-not $ready){throw 'GOTRUE_POSTGRES_NOT_READY'}
 Start-Sleep -Milliseconds 900
 $bootstrap=@'
create role anon noinherit nologin;
create role authenticated noinherit nologin;
create role service_role noinherit nologin bypassrls;
create schema auth;
-- GoTrue's internal unqualified tables must resolve inside auth, not public.
alter role postgres set search_path to auth,public;
create extension if not exists pgcrypto;
'@
 $bootstrap|docker exec -i $pg psql -U postgres -v ON_ERROR_STOP=1 -q
 if($LASTEXITCODE -ne 0){throw 'GOTRUE_BASE_ROLES_FAILED'}
 $dbUrl="postgres://postgres:$pgPass@$($pg):5432/postgres?sslmode=disable"
 $authArgs=@('run','--rm','-d','--pull=never','--network',$net,
  '--name',$auth,
  '-e','GOTRUE_API_HOST=0.0.0.0',
  '-e','GOTRUE_API_PORT=9999',
  '-e','GOTRUE_DB_DRIVER=postgres',
  '-e',"GOTRUE_DB_DATABASE_URL=$dbUrl",
  '-e',"API_EXTERNAL_URL=http://$($auth):9999",
  '-e','GOTRUE_SITE_URL=http://localhost.invalid',
  '-e','GOTRUE_URI_ALLOW_LIST=',
  '-e','GOTRUE_DISABLE_SIGNUP=false',
  '-e','GOTRUE_EXTERNAL_EMAIL_ENABLED=true',
  '-e','GOTRUE_MAILER_AUTOCONFIRM=true',
  '-e','GOTRUE_EXTERNAL_PHONE_ENABLED=false',
  '-e','GOTRUE_JWT_ADMIN_ROLES=service_role',
  '-e','GOTRUE_JWT_AUD=authenticated',
  '-e','GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated',
  '-e','GOTRUE_JWT_EXP=900',
  '-e',"GOTRUE_JWT_SECRET=$jwtSecret",
  '-e','GOTRUE_DB_NAMESPACE=auth',
  $authImage)
 $authid=(& docker @authArgs)
 if($LASTEXITCODE -ne 0 -or -not $authid){throw 'GOTRUE_AUTH_CONTAINER_START_FAILED'}
 $startedAuth=$true
 if((docker port $pg|Out-String).Trim() -or (docker port $auth|Out-String).Trim()){
  throw 'GOTRUE_TEST_HOST_PORT_EXPOSURE_DETECTED'
 }
 $client=Join-Path $repo 'docs\verification\fixtures\family-weekly-gotrue-client.js'
 $clientBase=@('run','--rm','-i','--pull=never','--network',$net,
  '--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
  '-e',"FAMILY_TEST_GOTRUE_URL=http://$($auth):9999",
  '-e',"FAMILY_TEST_REST_URL=http://$($rest):3000")
 Write-Output 'GOTRUE_TEST_REAL_PASSWORD_SIGNUP_LOGIN_BEGIN=true'
 $signupArgs=$clientBase+@('-e','FAMILY_TEST_PHASE=signup',$nodeImage,'node','-')
 Get-Content -LiteralPath $client -Raw -Encoding UTF8 | & docker @signupArgs
 if($LASTEXITCODE -ne 0){
  Write-Output 'GOTRUE_TEST_AUTH_ERROR_DIAGNOSTICS_START'
  $ErrorActionPreference='Continue'
  docker logs --tail 150 $auth 2>&1 | Select-String '"level":"error"|500|failed|fatal|error' | Select-Object -Last 15
  $ErrorActionPreference='Stop'
  throw 'GOTRUE_TEST_SIGNUP_FAILED'
 }
 $files=@(
  'docs\verification\fixtures\family-weekly-gotrue-schema.sql',
  'docs\verification\fixtures\family-weekly-pg-runs-constraints.sql',
  'docs\sql\20261028_family_weekly_auto_consent_proposed.sql',
  'docs\sql\20261028_family_weekly_review_notices_proposed.sql',
  'docs\sql\20261028_family_weekly_run_creator_proposed.sql',
  'docs\sql\20261028_family_weekly_once_only_model_attempt_proposed.sql'
 )
 foreach($relative in $files){
  $full=Join-Path $repo $relative
  if(-not(Test-Path -LiteralPath $full)){throw ('GOTRUE_TEST_SQL_MISSING:'+ $relative)}
  Write-Output ('GOTRUE_TEST_DISPOSABLE_SQL_ONLY='+($relative -split '\\')[-1])
  Get-Content -LiteralPath $full -Raw -Encoding UTF8 | docker exec -i $pg psql -U postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE -ne 0){throw ('GOTRUE_TEST_SQL_FAILED:'+ $relative)}
 }
 $loginSql="create role authenticator noinherit login password '$restPass'; grant anon,authenticated to authenticator;"
 $loginSql|docker exec -i $pg psql -U postgres -v ON_ERROR_STOP=1 -q
 if($LASTEXITCODE -ne 0){throw 'GOTRUE_POSTGREST_ROLE_FAILED'}
 $restUri="postgresql://authenticator:$restPass@$($pg):5432/postgres"
 $restArgs=@('run','--rm','-d','--pull=never','--network',$net,
  '--name',$rest,
  '-e',"PGRST_DB_URI=$restUri",
  '-e','PGRST_DB_SCHEMAS=public',
  '-e','PGRST_DB_ANON_ROLE=anon',
  '-e',"PGRST_JWT_SECRET=$jwtSecret",
  '-e','PGRST_DB_POOL=2','-e','PGRST_SERVER_PORT=3000',$restImage)
 $restid=(& docker @restArgs)
 if($LASTEXITCODE -ne 0 -or -not $restid){throw 'GOTRUE_POSTGREST_START_FAILED'}
 $startedRest=$true
 foreach($container in @($pg,$auth,$rest)){
  if((docker port $container|Out-String).Trim()){
   throw 'GOTRUE_TEST_HOST_PORT_EXPOSURE_DETECTED'
  }
 }
 Write-Output 'GOTRUE_TEST_ZERO_HOST_PUBLISHED_PORTS=true'
 $testArgs=$clientBase+@('-e','FAMILY_TEST_PHASE=test',$nodeImage,'node','-')
 Get-Content -LiteralPath $client -Raw -Encoding UTF8 | & docker @testArgs
 if($LASTEXITCODE -ne 0){throw 'GOTRUE_REAL_AUTH_HTTP_RLS_ASSERTIONS_FAILED'}
 Write-Output 'FAMILY_WEEKLY_REAL_GOTRUE_POSTGREST_INTEGRATION_PASS=true'
} finally {
 if($startedRest){docker rm -f $rest *> $null}
 if($startedAuth){docker rm -f $auth *> $null}
 if($startedPg){docker rm -f $pg *> $null}
 if($startedNet){docker network rm $net *> $null}
 Write-Output 'GOTRUE_TEST_ALL_DISPOSABLE_CONTAINERS_REMOVED=true'
}
