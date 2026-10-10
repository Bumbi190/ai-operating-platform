#!/usr/bin/env bash
# P1E: behavioural proof of public.handlarborsen_store_marketplace_snapshot against a
# THROWAWAY local Postgres container (never production). Prerequisites in that database:
# public.projects with the Handlarborsen id, the P1B table migration and the P1E migration.
#
#   docker run -d --name p1e-pg -e POSTGRES_PASSWORD=x public.ecr.aws/supabase/postgres:<tag>
#   CONTAINER=p1e-pg bash verify-guarded-store.sh
#
# Every scenario starts from an empty table (truncated as superuser) and calls the function
# as service_role, the role the collector uses. Exits non-zero if any check fails.
set -uo pipefail
C="${CONTAINER:-p1e-pg}"
HB="8f673c09-1c8f-4d78-876e-4c14bf1c89b3"
T="public.handlarborsen_marketplace_snapshots"
ALLCOLS="companies_registered_total,companies_verified_total,vehicles_published_active,vehicles_reserved,vehicles_published_last_24h,bids_total,bids_last_24h,interests_last_24h,offers_last_24h,deals_completed_total,deals_completed_last_24h"

pg()    { docker exec "$C" psql -U postgres -v ON_ERROR_STOP=1 -q -t -A "$@"; }
pgin()  { docker exec -i "$C" psql -U postgres -v ON_ERROR_STOP=1 -q -t -A "$@"; }  # stdin carries the SQL
sr()    { pg -c "SET ROLE service_role; $1" | tail -n 1; }
sr_raw() { docker exec "$C" psql -U postgres -q -t -A -c "SET ROLE service_role; $1" 2>&1; }
reset() { pg -c "TRUNCATE $T" >/dev/null; }
rows()  { pg -c "SELECT count(*) FROM $T"; }
col()   { pg -c "SELECT $1 FROM $T"; }
nonnull() { pg -c "SELECT num_nonnulls($ALLCOLS) FROM $T"; }
field() { sr "SELECT ($1) ->> '$2'"; }
fail=0
check() { # name got want
  if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1: got [$2] want [$3]"; fail=1; fi
}

pgin >/dev/null <<'SQL'
DROP SCHEMA IF EXISTS p1e_test CASCADE;
CREATE SCHEMA p1e_test;
GRANT USAGE ON SCHEMA p1e_test TO service_role;
-- n available metrics (the first n are numbers, the rest JSON null); bump shifts the values.
CREATE FUNCTION p1e_test.m(n int, bump int DEFAULT 0) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_object_agg(k, CASE WHEN i <= n THEN to_jsonb(i * 10 + bump) ELSE 'null'::jsonb END)
  FROM unnest(ARRAY['companies_registered_total','companies_verified_total','vehicles_published_active',
    'vehicles_reserved','vehicles_published_last_24h','bids_total','bids_last_24h','interests_last_24h',
    'offers_last_24h','deals_completed_total','deals_completed_last_24h']) WITH ORDINALITY AS u(k, i) $$;
CREATE FUNCTION p1e_test.u(n int) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_object_agg(k, 'query_failed'), '{}'::jsonb)
  FROM unnest(ARRAY['companies_registered_total','companies_verified_total','vehicles_published_active',
    'vehicles_reserved','vehicles_published_last_24h','bids_total','bids_last_24h','interests_last_24h',
    'offers_last_24h','deals_completed_total','deals_completed_last_24h']) WITH ORDINALITY AS u(k, i)
  WHERE i > n $$;
-- Observed `ago_min` minutes ago, on today's UTC date.
CREATE FUNCTION p1e_test.store(n int, ago_min int, bump int DEFAULT 0) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.handlarborsen_store_marketplace_snapshot(
    (now() AT TIME ZONE 'UTC')::date, date_trunc('second', now()) - make_interval(mins => ago_min),
    p1e_test.u(n), p1e_test.m(n, bump)) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA p1e_test TO service_role;
SQL

if [ "$(pg -c "select (extract(hour from now() at time zone 'utc')*60 + extract(minute from now() at time zone 'utc')) < 45")" = "t" ]; then
  echo "SKIP  too close to UTC midnight for relative observation times; rerun later"; exit 0
fi

reset
check "first run inserts"                         "$(field 'p1e_test.store(11,5)' outcome)" inserted
check "  one complete row"                        "$(rows) $(col completeness)" "1 complete"
check "same observation again is unchanged"       "$(field "public.handlarborsen_store_marketplace_snapshot((now() at time zone 'utc')::date, (SELECT observed_at FROM $T), p1e_test.u(11), p1e_test.m(11))" outcome)" unchanged
check "  still one row"                           "$(rows)" 1
check "newer complete refreshes"                  "$(field 'p1e_test.store(11,1,7)' outcome)" refreshed
check "  value taken from the newer run"          "$(col companies_registered_total)" 17
check "older complete is rejected"                "$(field 'p1e_test.store(11,30,1)' outcome)" rejected
check "  reason older_observation"                "$(field 'p1e_test.store(11,30,1)' reason)" older_observation
check "  value untouched"                         "$(col companies_registered_total)" 17

reset; sr "SELECT p1e_test.store(11,10)" >/dev/null
check "partial after complete rejected"           "$(field 'p1e_test.store(6,1)' outcome)" rejected
check "  reason lower_quality"                    "$(field 'p1e_test.store(6,1)' reason)" lower_quality
check "  stored=false"                            "$(field 'p1e_test.store(6,1)' stored)" false
check "unavailable after complete rejected"       "$(field 'p1e_test.store(0,0)' outcome)" rejected
check "  complete row intact (11 values)"         "$(col completeness) $(nonnull)" "complete 11"

reset; sr "SELECT p1e_test.store(6,10)" >/dev/null
check "complete upgrades an earlier partial"      "$(field 'p1e_test.store(11,1)' outcome)" upgraded
check "  completeness now complete"               "$(col completeness)" complete
check "  unavailable cleared"                     "$(col unavailable)" "{}"
reset; sr "SELECT p1e_test.store(6,1)" >/dev/null
check "an OLDER complete still upgrades a newer partial" "$(field 'p1e_test.store(11,20)' outcome)" upgraded
reset; sr "SELECT p1e_test.store(6,10)" >/dev/null
check "newer partial with more metrics upgrades"  "$(field 'p1e_test.store(8,1)' outcome)" upgraded
check "newer partial with fewer metrics rejected" "$(field 'p1e_test.store(5,0)' outcome)" rejected
check "  3 columns are NULL, none were coerced to 0" "$(nonnull)" 8
check "  completeness derived from values"        "$(col completeness)" partial

reset
check "all-unavailable stores all NULL"           "$(field 'p1e_test.store(0,1)' completeness) $(nonnull)" "unavailable 0"

# History: a row from an earlier day is never touched, and the function cannot target it.
reset
pg -c "INSERT INTO $T (project_id,snapshot_date,observed_at,schema_version,window_hours,completeness,unavailable,$ALLCOLS) VALUES ('$HB', (now() at time zone 'utc')::date - 1, now() - interval '1 day', 1,24,'complete','{}',1,1,1,1,1,1,1,1,1,1,1)" >/dev/null
sr "SELECT p1e_test.store(11,3)" >/dev/null
check "a new day creates a new row, yesterday untouched" "$(rows) $(pg -c "SELECT companies_registered_total FROM $T WHERE snapshot_date < (now() at time zone 'utc')::date")" "2 1"
r="$(sr_raw "SELECT public.handlarborsen_store_marketplace_snapshot((now() at time zone 'utc')::date - 1, now() - interval '1 day', '{}', p1e_test.m(11,99))")"
check "writing yesterday is refused"              "$(echo "$r" | grep -c 'handlarborsen_snapshot_invalid:not_today')" 1
check "  yesterday still value 1"                 "$(pg -c "SELECT companies_registered_total FROM $T WHERE snapshot_date < (now() at time zone 'utc')::date")" 1

# Input validation
reset
expect_invalid() { # name args code
  r="$(sr_raw "SELECT public.handlarborsen_store_marketplace_snapshot((now() at time zone 'utc')::date, now(), $2)")"
  check "$1 refused ($3)" "$(echo "$r" | grep -c "handlarborsen_snapshot_invalid:$3")" 1
}
expect_invalid "negative value"      "p1e_test.u(11), p1e_test.m(11) || '{\"bids_total\": -1}'::jsonb" metric_value
expect_invalid "fractional value"    "p1e_test.u(11), p1e_test.m(11) || '{\"bids_total\": 1.5}'::jsonb" metric_value
expect_invalid "string value"        "p1e_test.u(11), p1e_test.m(11) || '{\"bids_total\": \"7\"}'::jsonb" metric_type
expect_invalid "missing metric key"  "p1e_test.u(11), p1e_test.m(11) - 'bids_total'" metric_keys
expect_invalid "extra metric key"    "p1e_test.u(11), p1e_test.m(11) || '{\"x\": 1}'::jsonb" metric_keys
expect_invalid "null without reason" "'{}'::jsonb, p1e_test.m(10)" unavailable_keys
expect_invalid "reason without null" "p1e_test.u(10), p1e_test.m(11)" unavailable_keys
expect_invalid "unknown reason"      "'{\"bids_total\":\"boom\"}'::jsonb, p1e_test.m(11) || '{\"bids_total\": null}'::jsonb" unavailable_reason
check "  nothing was written by refused calls"   "$(rows)" 0

# Privileges: service_role cannot bypass the function.
r="$(sr_raw "INSERT INTO $T (project_id,snapshot_date,observed_at,schema_version,window_hours,completeness) VALUES ('$HB', current_date, now(), 1,24,'unavailable')")"
check "direct INSERT by service_role denied"      "$(echo "$r" | grep -c 'permission denied')" 1
pg -c "SELECT p1e_test.store(11,5)" >/dev/null
r="$(sr_raw "UPDATE $T SET bids_total = 0")"
check "direct UPDATE by service_role denied"      "$(echo "$r" | grep -c 'permission denied')" 1
r="$(sr_raw "DELETE FROM $T")"
check "direct DELETE by service_role denied"      "$(echo "$r" | grep -c 'permission denied')" 1
r="$(docker exec "$C" psql -U postgres -q -t -A -c "SET ROLE anon; SELECT public.handlarborsen_store_marketplace_snapshot(current_date, now(), '{}', '{}')" 2>&1)"
check "anon cannot execute the function"          "$(echo "$r" | grep -c 'permission denied')" 1
r="$(docker exec "$C" psql -U postgres -q -t -A -c "SET ROLE authenticated; SELECT public.handlarborsen_store_marketplace_snapshot(current_date, now(), '{}', '{}')" 2>&1)"
check "authenticated cannot execute the function" "$(echo "$r" | grep -c 'permission denied')" 1

# Concurrency: 12 parallel sessions, mixed quality and observation times, same day.
reset
pids=()
for i in $(seq 1 12); do
  case $((i % 4)) in 0) q=11 ;; 1) q=6 ;; 2) q=0 ;; 3) q=8 ;; esac
  ( sr "SELECT p1e_test.store($q, $((40 - i)), $i)" >/dev/null 2>&1 ) &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done
check "12 concurrent runs leave exactly one row"  "$(rows)" 1
check "  best quality won (complete)"             "$(col completeness)" complete
check "  winner is the newest complete (i=12)"    "$(col companies_registered_total)" 22

# Deterministic lock proof. Session A (a writer that already holds the row, as the function itself
# does when it decides) locks the stored partial row, then turns it into a COMPLETE report and
# commits 3 s later. Session B calls the function 1 s in with a partial that has MORE metrics than
# the committed partial, so against the committed state alone it looks like an upgrade. With the
# function's FOR UPDATE, B waits for A, sees the complete report and is rejected. Without the row
# lock B decides on the stale partial and overwrites the complete report.
reset; sr "SELECT p1e_test.store(6,10)" >/dev/null
( docker exec "$C" psql -U postgres -q -t -A -c "BEGIN; SELECT 1 FROM $T FOR UPDATE; SELECT pg_sleep(3); UPDATE $T SET completeness='complete', unavailable='{}', observed_at=now(), companies_registered_total=7, companies_verified_total=7, vehicles_published_active=7, vehicles_reserved=7, vehicles_published_last_24h=7, bids_total=7, bids_last_24h=7, interests_last_24h=7, offers_last_24h=7, deals_completed_total=7, deals_completed_last_24h=7; COMMIT;" >/dev/null 2>&1 ) &
sleep 1
b_outcome="$(field 'p1e_test.store(8,0)' outcome)"
wait
check "lock: a writer that waited for the row lock decides on the NEW state (rejected)" "$b_outcome" rejected
check "  the complete report survived the overlap"  "$(col completeness) $(nonnull)" "complete 11"

# Complete vs partial started together, 20 times: the complete report must always survive.
bad=0
for n in $(seq 1 20); do
  reset
  ( sr "SELECT p1e_test.store(11, 5)" >/dev/null 2>&1 ) &
  ( sr "SELECT p1e_test.store(5, 0)"  >/dev/null 2>&1 ) &
  wait
  [ "$(col completeness)" = "complete" ] || bad=$((bad+1))
done
check "complete vs partial raced 20x: complete never lost" "$bad" 0

pg -c "DROP SCHEMA p1e_test CASCADE" >/dev/null
reset
if [ "$fail" = 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED"; exit 1; fi
