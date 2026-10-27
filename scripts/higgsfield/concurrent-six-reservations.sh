#!/bin/sh
set -eu
i=1
while [ "$i" -le 6 ]; do
 (psql -U postgres -d postgres -XAt -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT public.higgsfield_daily_budget_reserve(gen_random_uuid(), '20000000-0000-4000-8000-000000000001'::uuid, 4::numeric);" > "/tmp/hold_$i.out" 2> "/tmp/hold_$i.err") &
 i=$((i+1))
done
wait
success=0
limit=0
for i in 1 2 3 4 5 6; do
 f="/tmp/hold_$i.out"
 printf 'worker%s: ' "$i"
 tail -n 1 "$f"
 grep -q '"allowed": true' "$f" && success=$((success+1)) || true
 grep -q '"reason": "daily_limit"' "$f" && limit=$((limit+1)) || true
done
printf 'CONCURRENT_ALLOWED=%s CONCURRENT_REFUSED_DAILY_LIMIT=%s\n' "$success" "$limit"
test "$success" -eq 1
test "$limit" -eq 5
psql -U postgres -d postgres -XAt -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT public.higgsfield_daily_budget_status();" | tail -n 1 > /tmp/final_status.out
cat /tmp/final_status.out
grep -q '"reserved_sek": 4' /tmp/final_status.out
grep -q '"remaining_sek": 1' /tmp/final_status.out
printf 'CONCURRENCY_LOCK_AND_FIVE_SEK_ENVELOPE=PASS\n'
