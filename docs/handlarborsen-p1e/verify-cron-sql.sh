#!/usr/bin/env bash
# P1E: behavioural proof of activate-cron.sql / rollback-cron.sql against a THROWAWAY local
# Postgres container (never production) that has pg_cron, the P1B table and the P1E migration.
# It stubs omnira_cron.call_vercel and adds a decoy job; nothing here can reach a real database.
#
#   CONTAINER=p1e-pg bash verify-cron-sql.sh
set -uo pipefail
C="${CONTAINER:-p1e-pg}"
HERE="$(cd "$(dirname "$0")" && pwd)"
HB="8f673c09-1c8f-4d78-876e-4c14bf1c89b3"
T="public.handlarborsen_marketplace_snapshots"
pg()  { docker exec "$C" psql -U postgres -q -t -A "$@"; }
pgin() { docker exec -i "$C" psql -U postgres -q -t -A "$@"; }  # stdin carries the SQL
run() { tr -d '\r' < "$1" | docker exec -i "$C" psql -U postgres -q -t -A -v ON_ERROR_STOP=1 2>&1; }
jobs() { pg -c "select count(*) from cron.job where command ilike '%/api/collectors/handlarborsen/%'"; }
fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1: got [$2] want [$3]"; fail=1; fi; }

pg -c "create extension if not exists pg_cron" >/dev/null 2>&1
pgin >/dev/null <<'SQL'
CREATE SCHEMA IF NOT EXISTS omnira_cron;
CREATE OR REPLACE FUNCTION omnira_cron.call_vercel(p_path text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS slug text, ADD COLUMN IF NOT EXISTS atlas_mode text;
UPDATE public.projects SET slug = 'handlarborsen', atlas_mode = 'observer' WHERE id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('omnira_handlarborsen_marketplace', 'decoy_hb');
SQL
before="$(pg -c "select count(*) from cron.job")"

# 1. activation schedules exactly one job with the intended definition
out="$(run "$HERE/activate-cron.sql")"; check "activation succeeds" "$(echo "$out" | grep -ci 'error')" 0
check "  exactly one Handlarborsen job" "$(jobs)" 1
check "  definition"  "$(pg -c "select schedule || ' | ' || command || ' | ' || active from cron.job where jobname='omnira_handlarborsen_marketplace'")" "55 6 * * * | select omnira_cron.call_vercel('/api/collectors/handlarborsen/marketplace') | true"
check "  total job count +1" "$(pg -c "select count(*) from cron.job")" "$((before + 1))"
# 2. idempotent
out="$(run "$HERE/activate-cron.sql")"; check "second activation is a no-op" "$(echo "$out" | grep -ci 'error')" 0
check "  still exactly one job" "$(jobs)" 1
check "  still +1 only" "$(pg -c "select count(*) from cron.job")" "$((before + 1))"
# 3. rollback removes only that job; idempotent
out="$(run "$HERE/rollback-cron.sql")"; check "rollback succeeds" "$(echo "$out" | grep -ci 'error')" 0
check "  no Handlarborsen job left" "$(jobs)" 0
check "  job count back to baseline" "$(pg -c "select count(*) from cron.job")" "$before"
out="$(run "$HERE/rollback-cron.sql")"; check "second rollback is a no-op" "$(echo "$out" | grep -ci 'error')" 0

# 4. a duplicate under another name blocks activation and schedules nothing
pg -c "select cron.schedule('decoy_hb', '0 1 * * *', 'select omnira_cron.call_vercel(''/api/collectors/handlarborsen/marketplace'')')" >/dev/null
out="$(run "$HERE/activate-cron.sql")"
check "activation refuses when another job targets the route" "$(echo "$out" | grep -c 'already targets')" 1
check "  nothing new was scheduled" "$(pg -c "select count(*) from cron.job where jobname='omnira_handlarborsen_marketplace'")" 0
pg -c "select cron.unschedule('decoy_hb')" >/dev/null

# 5. activation refuses without the protection
pg -c "GRANT INSERT, UPDATE ON $T TO service_role" >/dev/null
out="$(run "$HERE/activate-cron.sql")"
check "activation refuses while service_role can still write the table" "$(echo "$out" | grep -c 'still write the snapshot table')" 1
check "  nothing scheduled" "$(jobs)" 0
pg -c "REVOKE INSERT, UPDATE ON $T FROM service_role" >/dev/null
pg -c "ALTER FUNCTION public.handlarborsen_store_marketplace_snapshot(date, timestamptz, jsonb, jsonb) RENAME TO hb_tmp_renamed" >/dev/null
out="$(run "$HERE/activate-cron.sql")"
check "activation refuses without the guarded store" "$(echo "$out" | grep -c 'guarded snapshot store is not applied')" 1
pg -c "ALTER FUNCTION public.hb_tmp_renamed(date, timestamptz, jsonb, jsonb) RENAME TO handlarborsen_store_marketplace_snapshot" >/dev/null
# 6. activation refuses when the project is not collectable
pg -c "UPDATE public.projects SET atlas_mode = 'hibernate' WHERE id = '$HB'" >/dev/null
out="$(run "$HERE/activate-cron.sql")"
check "activation refuses outside observer/active mode" "$(echo "$out" | grep -c 'not in observer or active')" 1
pg -c "UPDATE public.projects SET atlas_mode = 'observer' WHERE id = '$HB'" >/dev/null
check "no job exists after all refusals" "$(jobs)" 0
check "other jobs untouched (count == baseline)" "$(pg -c "select count(*) from cron.job")" "$before"

if [ "$fail" = 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED"; exit 1; fi
