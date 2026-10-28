#!/usr/bin/env bash
# Multi-connection PostgreSQL 17 test of the PROPOSED website_article_jobs migration.
#
# Isolation: a throwaway container from a LOCAL Supabase Postgres image
# (--pull never: nothing is downloaded), --network none (unreachable from the
# host or any network), a random password, removed on exit. It never touches
# a shared, local-dev or production database.
#
# Runs the suite against the migration as written (must be all PASS), then
# against deliberately broken copies (each must produce a named FAIL), which
# proves the suite can see the races it claims to test.
#
# Usage: bash 20261028150000_website_article_jobs.pg17-concurrency.sh [image]
set -euo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
MIGRATION="$HERE/20261028150000_website_article_jobs.sql"
SUITE="$HERE/20261028150000_website_article_jobs.pg17-concurrency.sql"
IMAGE="${1:-public.ecr.aws/supabase/postgres:17.11.0.004}"
NAME="omnira-articlejobs-pgtest-$$"
PW="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
WORK="$(mktemp -d)"

docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "image $IMAGE not present locally (refusing to pull)"; exit 2; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

docker run -d --rm --pull never --network none --name "$NAME" -e POSTGRES_PASSWORD="$PW" "$IMAGE" >/dev/null
psql_in() { docker exec -i -e PGPASSWORD="$PW" "$NAME" psql -h localhost -U supabase_admin -X -q -v ON_ERROR_STOP=1 "$@"; }

for _ in $(seq 1 120); do
  if psql_in -d postgres -tAc "select 1 from pg_roles where rolname = 'service_role'" 2>/dev/null | grep -q 1; then break; fi
  sleep 1
done
echo "server: $(psql_in -d postgres -tAc 'select version()')"

run_variant() {
  local label="$1" migration="$2" db="t_$3"
  psql_in -d postgres -c "create database $db" >/dev/null
  psql_in -d "$db" >/dev/null <<SQL
-- What Supabase provides in its own database: API roles (cluster-wide, real),
-- the same default privileges on public, and auth.uid() with Supabase's definition.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as \$\$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')), '')::uuid \$\$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema extensions;
create extension dblink schema extensions;
-- Minimal stand-ins for the existing tables the migration references, plus the social table.
create table public.projects (id uuid primary key default gen_random_uuid(), owner_id uuid, slug text);
create table public.website_content (id uuid primary key default gen_random_uuid());
create table public.media_scripts (id uuid primary key, news_item_id uuid, status text);
create schema t;
create table t.conf (connstr text);
create table t.results (name text, ok boolean, detail text);
create table t.ids (k text primary key, id uuid);
insert into t.conf values ('host=localhost dbname=$db user=supabase_admin password=$PW');
SQL
  psql_in -d "$db" < "$migration" >/dev/null
  local out; out="$(psql_in -d "$db" -tA -v ON_ERROR_STOP=0 < "$SUITE" 2>&1 | grep -E '^(PASS|FAIL|SUMMARY)|ERROR' || true)"
  echo "=== $label"
  echo "$out"
  LAST_OUT="$out"
}

VERDICT=0

mutant() { # label, db-suffix, sed expression that must change the file
  local f="$WORK/$2.sql"
  sed -E "$3" "$MIGRATION" > "$f"
  if cmp -s "$f" "$MIGRATION"; then echo "=== MUTANT $1: sed did not apply"; return 1; fi
  run_variant "MUTANT $1" "$f" "$2"
  if ! grep -q '^FAIL' <<<"$LAST_OUT"; then echo "!!! MUTANT NOT DETECTED: $1"; VERDICT=1; fi
}
trap 'cleanup; [ "$VERDICT" = 0 ] && echo "VERDICT: PASS" || echo "VERDICT: FAIL"; exit $VERDICT' EXIT

run_variant "MIGRATION AS PROPOSED" "$MIGRATION" baseline
if grep -q '^FAIL' <<<"$LAST_OUT" || ! grep -q '^SUMMARY .* 0 failed' <<<"$LAST_OUT"; then VERDICT=1; fi
[ "${ONLY_BASELINE:-0}" = 1 ] && exit 0
mutant "claim waits instead of SKIP LOCKED"        m_nowait   's/for update skip locked/for update/'
mutant "claim without row locking"                 m_nolock   '/^ +for update skip locked$/d'
mutant "enqueue without the per-project lock"      m_noadv    '/pg_advisory_xact_lock/d'
mutant "finish not fenced on the lease token"      m_nofence  's/ and lease_token = p_lease_token//'
mutant "deferral consumes an attempt"              m_defer    's/greatest\(v_job\.attempts - 1, 0\)/v_job.attempts/'
mutant "null daily cap accepted"                   m_nullcap  's/p_daily_max is null or //'
