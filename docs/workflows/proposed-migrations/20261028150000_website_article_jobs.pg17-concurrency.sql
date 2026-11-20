-- Multi-connection behaviour test for the PROPOSED website_article_jobs migration.
--
-- Runs in a THROWAWAY PostgreSQL 17 database (Supabase image) — never against a
-- shared or production database. Driven by ...pg17-concurrency.sh, which creates
-- the database, applies stubs + the migration, sets t.conf and runs this file.
--
-- Every worker is a SEPARATE backend connection (dblink) acting as service_role,
-- exactly like the tick route via PostgREST. The controller (this session) holds
-- or releases those workers' transactions to make races deterministic.
-- Each controller DO block is ONE transaction, so the controller never writes the
-- jobs table itself: test set-up writes go through a separate autocommit admin
-- connection ("ctl"). Otherwise its own locks would block or distort the workers.
-- Each test records PASS/FAIL in t.results; the driver fails on any FAIL.

\set ON_ERROR_STOP 0
set search_path = public, extensions, t;
set client_min_messages = warning;
set statement_timeout = '90s';   -- a hang is a failure, never a stuck run

-- ── helpers ──────────────────────────────────────────────────────────────────
create or replace function t.open(n text, r text default 'service_role') returns int
language plpgsql set search_path = public, extensions as $$
begin
  perform dblink_connect(n, (select connstr from t.conf));
  if r is not null then perform dblink_exec(n, format('set role %I', r)); end if;
  return (select pid from dblink(n, 'select pg_backend_pid()') as x(pid int));
end $$;

create or replace function t.close_all() returns void
language plpgsql set search_path = public, extensions as $$
declare c text;
begin
  for c in select unnest(coalesce(dblink_get_connections(), '{}'::text[])) loop
    perform dblink_disconnect(c);
  end loop;
end $$;

/** Test set-up write, committed immediately on the admin connection. */
create or replace function t.admin(sql text) returns void
language plpgsql set search_path = public, extensions as $$
begin
  perform dblink_exec('ctl', sql);
end $$;

create or replace function t.reset() returns void
language plpgsql set search_path = public, extensions as $$
begin
  perform t.close_all();
  perform t.open('ctl', null);
  perform t.admin('delete from public.website_article_jobs');
  perform t.admin('delete from public.website_content');
end $$;

/** Wait until the async query on n finishes; false if still running after ms. */
create or replace function t.wait(n text, ms int) returns boolean
language plpgsql set search_path = public, extensions as $$
declare t0 timestamptz := clock_timestamp();
begin
  while dblink_is_busy(n) = 1 loop
    if clock_timestamp() - t0 > make_interval(secs => ms / 1000.0) then return false; end if;
    perform pg_sleep(0.02);
  end loop;
  return true;
end $$;

/** Fetch the single text result of an async query and drain the connection. */
create or replace function t.result(n text) returns text
language plpgsql set search_path = public, extensions as $$
declare v text;
begin
  if dblink_is_busy(n) = 1 then return '<still waiting>'; end if;
  select r into v from dblink_get_result(n) as x(r text);
  perform * from dblink_get_result(n) as x(r text);
  return v;
end $$;

/** Synchronous single-text query on a worker connection. */
create or replace function t.q(n text, sql text) returns text
language plpgsql set search_path = public, extensions as $$
declare v text;
begin
  select r into v from dblink(n, sql) as x(r text);
  return v;
end $$;

create or replace function t.claim_sql(lease int default 600) returns text language sql as $$
  select format('select coalesce(max(c.id::text || ''|'' || c.lease_token::text || ''|'' || c.attempts), ''none'') '
                'from public.website_article_job_claim(%s) c', lease)
$$;

create or replace function t.enq_sql(news uuid, cap int default 24) returns text language sql as $$
  select format('select public.website_article_job_enqueue(%L::uuid, %L::uuid, null, %L, %s, 3)',
                (select id from t.ids where k = 'P'), news, 'omnira_' || news, cap)
$$;

create or replace function t.finish_sql(id uuid, tok uuid, outcome text, delay int default 0) returns text language sql as $$
  select format('select public.website_article_job_finish(%L::uuid, %L::uuid, %L, %L, null, null, null, %s)::text',
                id, tok, outcome, 'test', delay)
$$;

/** The fenced save exactly as store.ts calls it (p_row = the reviewable row; identity comes from the job). */
create or replace function t.save_sql(id uuid, tok uuid, title text default 'Acme releases Model X') returns text language sql as $$
  select format('select public.website_article_job_save_content(%L::uuid, %L::uuid, %L::jsonb)::text', id, tok,
    jsonb_build_object('title', title, 'summary', 'Lede.', 'content_type', 'article', 'source_kind', 'news_item',
      'generated_by', 'omnira-article-job:factcheck-v1', 'qa', '{"pass":true}'::jsonb, 'meta', '{"factcheck_required":true}'::jsonb,
      'project_id', gen_random_uuid(),   -- a hostile caller value: must be ignored in favour of the job's project
      'payload', jsonb_build_object('version', 1, 'external_id',
        (select external_id from public.website_article_jobs j where j.id = save_sql.id), 'title', title)))
$$;

create or replace function t.ok(name text, cond boolean, detail text default null) returns void
language plpgsql as $$
begin
  insert into t.results values (name, coalesce(cond, false), detail);
  if not coalesce(cond, false) then raise warning 'FAIL % %', name, coalesce(detail, ''); end if;
end $$;

insert into t.ids values
  ('P', gen_random_uuid()), ('P2', gen_random_uuid()), ('O', gen_random_uuid()), ('O2', gen_random_uuid());
insert into public.projects (id, owner_id, slug)
  select (select id from t.ids where k = 'P'), (select id from t.ids where k = 'O'), 'ai-media-automation'
  union all
  select (select id from t.ids where k = 'P2'), (select id from t.ids where k = 'O2'), 'other';

-- ── T1: SKIP LOCKED — a second worker neither blocks nor takes a held job ────
do $$
#variable_conflict use_variable
declare a text; b text; c text; n int;
begin
  perform t.reset();
  perform t.open('w1'); perform t.open('w2');
  perform t.q('w1', t.enq_sql(gen_random_uuid())); perform t.q('w1', t.enq_sql(gen_random_uuid()));
  perform dblink_exec('w1', 'begin');
  a := t.q('w1', t.claim_sql());                       -- w1 holds job A's row lock (uncommitted)
  perform dblink_send_query('w2', t.claim_sql());
  if not t.wait('w2', 3000) then
    perform t.ok('T1 second claim does not block on the held job', false, 'w2 waited on w1''s row lock');
    perform t.close_all();
    return;
  end if;
  perform t.ok('T1 second claim does not block on the held job', true);
  b := t.result('w2');
  perform t.ok('T1 second worker gets a different job', b <> 'none' and split_part(b,'|',1) <> split_part(a,'|',1), a || ' / ' || b);
  c := t.q('w2', t.claim_sql());
  perform t.ok('T1 nothing else is claimable while A is held', c = 'none', c);
  perform dblink_exec('w1', 'commit');
  select count(*) into n from public.website_article_jobs where state = 'running' and attempts = 1;
  perform t.ok('T1 both jobs running exactly once', n = 2, n::text);
  perform t.ok('T1 distinct lease tokens',
    (select count(distinct lease_token) from public.website_article_jobs) = 2);
end $$;

-- ── T2: 8 workers claim simultaneously, 20 rounds — every job exactly once ───
do $$
#variable_conflict use_variable
declare round int; i int; res text[]; got text; t0 timestamptz; dup int; claimed int; nonnone int;
begin
  perform t.reset();
  for i in 1..8 loop perform t.open('s' || i); end loop;
  for round in 1..20 loop
    perform t.admin('delete from public.website_article_jobs');
    for i in 1..5 loop perform t.q('s1', t.enq_sql(gen_random_uuid())); end loop;
    t0 := clock_timestamp() + interval '300 milliseconds';   -- all 8 start at the same instant
    for i in 1..8 loop
      perform dblink_send_query('s' || i, format(
        'with w as materialized (select pg_sleep_until(%L::timestamptz)) ' ||
        'select coalesce(max(c.id::text), ''none'') from w left join lateral public.website_article_job_claim(600) c on true', t0));
    end loop;
    res := '{}';
    for i in 1..8 loop
      perform t.wait('s' || i, 10000);
      res := res || t.result('s' || i);
    end loop;
    select count(*) filter (where r <> 'none'), count(distinct r) filter (where r <> 'none')
      into nonnone, claimed from unnest(res) r;
    dup := nonnone - claimed;
    if nonnone <> 5 or dup <> 0
       or (select count(*) from public.website_article_jobs where state = 'running' and attempts = 1) <> 5 then
      perform t.ok('T2 concurrent claims: each job exactly once', false,
        format('round %s: claims=%s distinct=%s results=%s', round, nonnone, claimed, res));
      return;
    end if;
  end loop;
  perform t.ok('T2 concurrent claims: each job exactly once (20 rounds x 8 workers x 5 jobs)', true);
end $$;

-- ── T3: concurrent enqueues cannot both pass the daily cap ──────────────────
do $$
#variable_conflict use_variable
declare r1 text; r2 text; p2 int; we text;
begin
  perform t.reset();
  perform t.open('w1'); p2 := t.open('w2');
  perform dblink_exec('w1', 'begin');
  r1 := t.q('w1', t.enq_sql(gen_random_uuid(), 1));    -- cap 1, inserted but NOT committed
  perform dblink_send_query('w2', t.enq_sql(gen_random_uuid(), 1));
  perform pg_sleep(0.5);
  select wait_event_type into we from pg_stat_activity where pid = p2;
  perform t.ok('T3 second enqueue waits on the per-project lock', dblink_is_busy('w2') = 1 and we = 'Lock', coalesce(we, '<none>'));
  perform dblink_exec('w1', 'commit');
  perform t.wait('w2', 3000);
  r2 := t.result('w2');
  perform t.ok('T3 first enqueued, second capped', r1 = 'enqueued' and r2 = 'daily_cap', r1 || ' / ' || coalesce(r2, '<null>'));
  perform t.ok('T3 exactly cap rows', (select count(*) from public.website_article_jobs) = 1);
end $$;

-- ── T4: same news item enqueued by 8 simultaneous triggers → one job ───────
do $$
#variable_conflict use_variable
declare news uuid := gen_random_uuid(); i int; res text[] := '{}'; t0 timestamptz;
begin
  perform t.reset();
  for i in 1..8 loop perform t.open('s' || i); end loop;
  t0 := clock_timestamp() + interval '300 milliseconds';
  for i in 1..8 loop
    perform dblink_send_query('s' || i, format('with w as materialized (select pg_sleep_until(%L::timestamptz)) select (%s) from w',
      t0, t.enq_sql(news)));
  end loop;
  for i in 1..8 loop perform t.wait('s' || i, 10000); res := res || t.result('s' || i); end loop;
  perform t.ok('T4 one enqueued, seven exists',
    (select count(*) from unnest(res) r where r = 'enqueued') = 1 and (select count(*) from unnest(res) r where r = 'exists') = 7,
    res::text);
  perform t.ok('T4 exactly one job row', (select count(*) from public.website_article_jobs where news_item_id = news) = 1);
end $$;

-- ── T5: expired lease → new worker takes over; the stale worker is fenced out ─
do $$
#variable_conflict use_variable
declare a text; b text; id uuid; t1 uuid; t2 uuid; rows int; fin text;
begin
  perform t.reset();
  perform t.open('w1'); perform t.open('w2');
  perform t.q('w1', t.enq_sql(gen_random_uuid()));
  a := t.q('w1', t.claim_sql(30));
  id := split_part(a, '|', 1)::uuid; t1 := split_part(a, '|', 2)::uuid;
  perform t.ok('T5 live lease is not reclaimable', t.q('w2', t.claim_sql()) = 'none');
  perform t.admin(format('update public.website_article_jobs set lease_expires_at = now() - interval ''1 second'' where id = %L', id));
  b := t.q('w2', t.claim_sql());
  t2 := split_part(b, '|', 2)::uuid;
  perform t.ok('T5 expired lease reclaimed with a new token and attempt 2',
    split_part(b, '|', 1)::uuid = id and t2 <> t1 and split_part(b, '|', 3) = '2', b);
  -- The stale worker's checkpoint write uses the exact repo.ts fence (id + token + running).
  rows := t.q('w1', format('with u as (update public.website_article_jobs set checkpoint = ''{"stale":true}'' ' ||
    'where id = %L and lease_token = %L and state = ''running'' returning 1) select count(*)::text from u', id, t1))::int;
  perform t.ok('T5 stale checkpoint write affects 0 rows (runner raises LeaseLostError)', rows = 0, rows::text);
  fin := t.q('w1', t.finish_sql(id, t1, 'saved'));
  perform t.ok('T5 stale finish returns false', fin = 'false', fin);
  fin := t.q('w2', t.finish_sql(id, t2, 'saved'));
  perform t.ok('T5 current owner finishes', fin = 'true', fin);
  perform t.ok('T5 final state saved, stale checkpoint never landed',
    (select state = 'saved' and not (checkpoint ? 'stale') from public.website_article_jobs where website_article_jobs.id = id));
end $$;

-- ── T6: retry back-off is respected and attempts run out into failed ────────
do $$
#variable_conflict use_variable
declare a text; id uuid; i int; fin text; st text; na timestamptz;
begin
  perform t.reset();
  perform t.open('w1');
  perform t.q('w1', t.enq_sql(gen_random_uuid()));
  for i in 1..3 loop
    a := t.q('w1', t.claim_sql());
    id := split_part(a, '|', 1)::uuid;
    perform t.ok('T6 attempt ' || i || ' claimed', split_part(a, '|', 3) = i::text, a);
    fin := t.q('w1', t.finish_sql(id, split_part(a, '|', 2)::uuid, 'retry', 300));
    select state, next_attempt_at into st, na from public.website_article_jobs where website_article_jobs.id = id;
    if i < 3 then
      perform t.ok('T6 retry ' || i || ' re-queued with back-off', st = 'queued' and na > now() + interval '290 seconds', st);
      perform t.ok('T6 back-off respected (nothing claimable yet)', t.q('w1', t.claim_sql()) = 'none');
      perform t.admin(format('update public.website_article_jobs set next_attempt_at = now() where id = %L', id));
    else
      perform t.ok('T6 retry at max attempts → failed with finished_at', st = 'failed'
        and (select finished_at is not null from public.website_article_jobs where website_article_jobs.id = id), st);
    end if;
  end loop;
  perform t.admin('update public.website_article_jobs set next_attempt_at = now() - interval ''1 hour''');
  perform t.ok('T6 failed job is never claimed again', t.q('w1', t.claim_sql()) = 'none');
end $$;

-- ── T7: cost-gate deferral never consumes an attempt ────────────────────────
do $$
#variable_conflict use_variable
declare a text; id uuid; i int; att int; st text;
begin
  perform t.reset();
  perform t.open('w1');
  perform t.q('w1', t.enq_sql(gen_random_uuid()));
  for i in 1..6 loop
    a := t.q('w1', t.claim_sql());
    if a = 'none' then
      perform t.ok('T7 deferrals never exhaust attempts', false, format('job unclaimable after %s deferrals', i - 1));
      return;
    end if;
    id := split_part(a, '|', 1)::uuid;
    perform t.q('w1', t.finish_sql(id, split_part(a, '|', 2)::uuid, 'deferred', 3600));
    perform t.ok('T7 deferred ' || i || ': not claimable during the deferral', t.q('w1', t.claim_sql()) = 'none');
    perform t.admin(format('update public.website_article_jobs set next_attempt_at = now() where id = %L', id));
  end loop;
  select attempts, state into att, st from public.website_article_jobs where website_article_jobs.id = id;
  perform t.ok('T7 six deferrals: attempts still 0, still queued', att = 0 and st = 'queued', att || ' ' || st);
end $$;

-- ── T8: worker died on its last attempt → failed, not retried forever ───────
do $$
#variable_conflict use_variable
declare id uuid;
begin
  perform t.reset();
  perform t.open('w1');
  perform t.q('w1', t.enq_sql(gen_random_uuid()));
  select website_article_jobs.id into id from public.website_article_jobs limit 1;
  perform t.admin(format('update public.website_article_jobs set state = ''running'', attempts = 3, ' ||
    'lease_token = gen_random_uuid(), lease_expires_at = now() - interval ''1 second'' where id = %L', id));
  perform t.ok('T8 not reclaimed', t.q('w1', t.claim_sql()) = 'none');
  perform t.ok('T8 marked failed with reason', (select state = 'failed' and lease_token is null
    and last_error like '%lease_expired_after_max_attempts%' from public.website_article_jobs where website_article_jobs.id = id));
end $$;

-- ── T9: crashed worker (connection dropped) → resumed with its checkpoint ───
do $$
#variable_conflict use_variable
declare a text; b text; id uuid; cp jsonb;
begin
  perform t.reset();
  perform t.open('w1'); perform t.open('w2');
  perform t.q('w1', t.enq_sql(gen_random_uuid()));
  a := t.q('w1', t.claim_sql());
  id := split_part(a, '|', 1)::uuid;
  perform t.q('w1', format('with u as (update public.website_article_jobs set checkpoint = ''{"draft":{"title":"x"},"costUsd":0.05}'' ' ||
    'where id = %L and lease_token = %L and state = ''running'' returning 1) select count(*)::text from u', id, split_part(a, '|', 2)));
  perform dblink_disconnect('w1');                       -- process killed, no finish
  perform t.admin(format('update public.website_article_jobs set lease_expires_at = now() - interval ''1 second'' where id = %L', id));
  b := t.q('w2', t.claim_sql());
  select checkpoint into cp from public.website_article_jobs where website_article_jobs.id = id;
  perform t.ok('T9 reclaimed after crash', split_part(b, '|', 1)::uuid = id, b);
  perform t.ok('T9 paid draft kept in checkpoint for resume', cp ? 'draft' and (cp->>'costUsd')::numeric = 0.05, cp::text);
end $$;

-- ── T10: fail-closed input validation and structural constraints ───────────
do $$
#variable_conflict use_variable
declare news uuid := gen_random_uuid(); code text; P uuid := (select id from t.ids where k = 'P');
begin
  perform t.reset();
  begin perform public.website_article_job_enqueue(P, news, null, 'omnira_' || news, null, 3); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok('T10 null daily cap rejected (would disable the cap)', code = '22023', code);
  begin perform public.website_article_job_enqueue(P, news, null, 'omnira_' || gen_random_uuid(), 2, 3); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok('T10 external_id not bound to news item rejected', code = '22023', code);
  begin perform public.website_article_job_claim(null); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok('T10 null lease rejected (job could never be reclaimed)', code = '22023', code);
  begin perform public.website_article_job_finish(gen_random_uuid(), gen_random_uuid(), 'lease_lost', 'x', null, null, null, 0); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok('T10 unknown outcome rejected (no silent re-queue)', code = '22023', code);
  begin insert into public.website_article_jobs (project_id, news_item_id, external_id) values (P, news, 'omnira_other'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok('T10 identity check constraint', code = '23514', code);
  perform public.website_article_job_enqueue(P, news, null, 'omnira_' || news, 2, 3);
  begin update public.website_article_jobs set state = 'running' where news_item_id = news; code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok('T10 running without a lease is impossible', code = '23514', code);
end $$;

-- ── T11: privileges and RLS ──────────────────────────────────────────────────
do $$
#variable_conflict use_variable
declare code text; r text; n1 uuid := gen_random_uuid(); n2 uuid := gen_random_uuid();
begin
  perform t.reset();
  perform t.q('ctl', t.enq_sql(n1));
  perform t.q('ctl', format('select public.website_article_job_enqueue(%L::uuid, %L::uuid, null, %L, 5, 3)',
    (select id from t.ids where k = 'P2'), n2, 'omnira_' || n2));
  perform t.open('anon', 'anon'); perform t.open('authenticated', 'authenticated');
  foreach r in array array['anon', 'authenticated'] loop
    begin perform t.q(r, t.claim_sql()); code := 'none'; exception when others then code := sqlstate; end;
    perform t.ok('T11 ' || r || ' cannot claim', code = '42501', code);
    begin perform t.q(r, t.enq_sql(gen_random_uuid())); code := 'none'; exception when others then code := sqlstate; end;
    perform t.ok('T11 ' || r || ' cannot enqueue', code = '42501', code);
    begin perform t.q(r, t.finish_sql(gen_random_uuid(), gen_random_uuid(), 'saved')); code := 'none'; exception when others then code := sqlstate; end;
    perform t.ok('T11 ' || r || ' cannot finish', code = '42501', code);
    begin perform t.q(r, 'with u as (update public.website_article_jobs set state = ''cancelled'' returning 1) select count(*)::text from u');
      code := 'none'; exception when others then code := sqlstate; end;
    perform t.ok('T11 ' || r || ' cannot update jobs', code = '42501', code);
  end loop;
  perform dblink_exec('authenticated', format('set request.jwt.claims = %L',
    json_build_object('sub', (select id from t.ids where k = 'O'), 'role', 'authenticated')::text));
  r := t.q('authenticated', 'select string_agg(project_id::text, '','') from public.website_article_jobs');
  perform t.ok('T11 owner sees only their own project''s jobs', r = (select id::text from t.ids where k = 'P'), coalesce(r, '<none>'));
  begin r := t.q('anon', 'select count(*)::text from public.website_article_jobs'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok('T11 anon cannot read jobs', code = '42501', code);
end $$;

-- ── T12: the social pipeline is independent of Workflow B ───────────────────
do $$
#variable_conflict use_variable
declare before_md5 text; after_md5 text; a text; ok boolean; n int;
begin
  perform t.reset();
  perform t.admin('insert into public.media_scripts (id, news_item_id, status) ' ||
    'values (gen_random_uuid(), gen_random_uuid(), ''published'')');
  select md5(string_agg(m::text, ',' order by id)) into before_md5 from public.media_scripts m;
  perform t.open('w1'); perform t.open('social');
  perform t.q('w1', t.enq_sql(gen_random_uuid()));
  perform dblink_exec('w1', 'begin');
  perform t.q('w1', t.claim_sql());                                   -- job row lock held
  perform t.q('w1', t.enq_sql(gen_random_uuid()));                    -- per-project advisory lock held
  perform dblink_send_query('social', 'with i as (insert into public.media_scripts (id, news_item_id, status) ' ||
    'values (gen_random_uuid(), gen_random_uuid(), ''approved'') returning 1) select count(*)::text from i');
  ok := t.wait('social', 3000);
  perform t.ok('T12 social writes never wait on article-job locks', ok);
  if ok then perform t.result('social'); end if;
  perform dblink_exec('w1', 'rollback');
  perform t.admin('delete from public.media_scripts where status = ''approved''');
  select md5(string_agg(m::text, ',' order by id)) into after_md5 from public.media_scripts m;
  perform t.ok('T12 job operations never modify media_scripts', before_md5 = after_md5);
  select count(*) into n from pg_constraint c where c.conrelid = 'public.website_article_jobs'::regclass and c.contype = 'f'
    and c.confrelid not in ('public.projects'::regclass, 'public.website_content'::regclass);
  perform t.ok('T12 no foreign key to any social/media table', n = 0, n::text);
  select count(*) into n from pg_proc where proname like 'website_article_job_%' and prosrc ~* '\m(media_scripts|media_news_items|media_[a-z]+_posts|social_[a-z_]+|approvals)\M';
  perform t.ok('T12 no job function touches media/social/approvals', n = 0, n::text);
  select count(*) into n from pg_trigger where tgrelid = 'public.media_scripts'::regclass and not tgisinternal;
  perform t.ok('T12 no trigger added to media_scripts', n = 0, n::text);
end $$;

-- ── T13: no duplicate AI spend per news item ───────────────────────────────
do $$
#variable_conflict use_variable
declare news uuid := gen_random_uuid(); i int; res text[] := '{}'; t0 timestamptz; id uuid; tok uuid; a text;
begin
  perform t.reset();
  for i in 1..8 loop perform t.open('s' || i); end loop;
  perform t.q('s1', t.enq_sql(news));
  t0 := clock_timestamp() + interval '300 milliseconds';
  for i in 1..8 loop
    perform dblink_send_query('s' || i, format('with w as materialized (select pg_sleep_until(%L::timestamptz)) ' ||
      'select coalesce(max(c.id::text || ''|'' || c.lease_token::text), ''none'') from w left join lateral public.website_article_job_claim(600) c on true', t0));
  end loop;
  for i in 1..8 loop perform t.wait('s' || i, 10000); res := res || t.result('s' || i); end loop;
  perform t.ok('T13 one news item → exactly one worker may run paid steps',
    (select count(*) from unnest(res) r where r <> 'none') = 1, res::text);
  select r into a from unnest(res) r where r <> 'none';
  id := split_part(a, '|', 1)::uuid; tok := split_part(a, '|', 2)::uuid;
  perform t.q('s1', t.finish_sql(id, tok, 'saved'));
  perform t.ok('T13 completed article: re-trigger is a no-op', t.q('s2', t.enq_sql(news)) = 'exists');
  perform t.admin('update public.website_article_jobs set next_attempt_at = now() - interval ''1 day''');
  perform t.ok('T13 completed article is never claimed again', t.q('s3', t.claim_sql()) = 'none');
  perform t.ok('T13 still one job row', (select count(*) from public.website_article_jobs where news_item_id = news) = 1);
end $$;

-- ── T14: the final save is fenced on the lease, atomically ─────────────────
do $$
#variable_conflict use_variable
declare a text; b text; id uuid; t1 uuid; t2 uuid; r jsonb; cid uuid;
begin
  perform t.reset();
  perform t.open('w1'); perform t.open('w2');
  perform t.q('w1', t.enq_sql(gen_random_uuid()));
  a := t.q('w1', t.claim_sql());
  id := split_part(a, '|', 1)::uuid; t1 := split_part(a, '|', 2)::uuid;
  perform t.admin(format('update public.website_article_jobs set lease_expires_at = now() - interval ''1 second'' where id = %L', id));
  r := t.q('w1', t.save_sql(id, t1))::jsonb;
  perform t.ok('T14 expired (not yet reclaimed) lease: save refused', r ->> 'reason' = 'lease_lost', r::text);
  perform t.ok('T14 ... and nothing written', (select count(*) from public.website_content) = 0);
  b := t.q('w2', t.claim_sql());
  t2 := split_part(b, '|', 2)::uuid;
  r := t.q('w1', t.save_sql(id, t1, 'STALE'))::jsonb;
  perform t.ok('T14 stale worker after takeover: save refused', r ->> 'reason' = 'lease_lost', r::text);
  perform t.ok('T14 stale worker wrote zero website_content rows', (select count(*) from public.website_content) = 0);
  r := t.q('w2', t.save_sql(id, t2))::jsonb;
  cid := (r ->> 'id')::uuid;
  perform t.ok('T14 current owner saves', (r ->> 'ok')::boolean and cid is not null, r::text);
  r := t.q('w2', t.save_sql(id, t2, 'Acme releases Model X (retry)'))::jsonb;
  perform t.ok('T14 owner retry updates the same row (exactly one row)',
    (r ->> 'id')::uuid = cid and (select count(*) from public.website_content) = 1, r::text);
  perform t.ok('T14 row is pending_review, owned by the job''s project, linked from the job',
    (select c.status = 'pending_review' and c.project_id = j.project_id and j.website_content_id = c.id
            and c.title <> 'STALE'
       from public.website_content c join public.website_article_jobs j on j.external_id = c.external_id));
  perform t.q('w2', t.finish_sql(id, t2, 'saved'));
  r := t.q('w2', t.save_sql(id, t2, 'AFTER FINISH'))::jsonb;
  perform t.ok('T14 no save after finish', r ->> 'reason' = 'lease_lost'
    and not exists (select 1 from public.website_content where title = 'AFTER FINISH'), r::text);
end $$;

-- ── T15: a claim during an in-flight save neither steals the job nor waits ───
do $$
#variable_conflict use_variable
declare a text; id uuid; t1 uuid; r jsonb; got text; ok boolean;
begin
  perform t.reset();
  perform t.open('w1'); perform t.open('w2');
  perform t.q('w1', t.enq_sql(gen_random_uuid()));
  a := t.q('w1', t.claim_sql());
  id := split_part(a, '|', 1)::uuid; t1 := split_part(a, '|', 2)::uuid;
  perform t.admin(format('update public.website_article_jobs set lease_expires_at = now() + interval ''1 second'' where id = %L', id));
  perform dblink_exec('w1', 'begin');
  r := t.q('w1', t.save_sql(id, t1))::jsonb;               -- valid at this instant; transaction left open
  perform pg_sleep(1.5);                                    -- the lease has now expired in wall-clock time
  perform dblink_send_query('w2', t.claim_sql());
  ok := t.wait('w2', 3000);
  got := case when ok then t.result('w2') else '<blocked>' end;
  perform t.ok('T15 claim during the save does not take the job (row locked) and does not block',
    (r ->> 'ok')::boolean and got = 'none', r::text || ' / ' || got);
  perform dblink_exec('w1', 'commit');
  perform t.ok('T15 the in-flight save committed exactly one row', (select count(*) from public.website_content) = 1);
end $$;

-- ── T16: save rules (same as store.ts reviewable_only) and privileges ────────
do $$
#variable_conflict use_variable
declare a text; id uuid; tok uuid; r jsonb; code text; ext text; before text;
begin
  perform t.reset();
  perform t.open('w1'); perform t.open('anon', 'anon'); perform t.open('authenticated', 'authenticated');
  perform t.q('w1', t.enq_sql(gen_random_uuid()));
  a := t.q('w1', t.claim_sql());
  id := split_part(a, '|', 1)::uuid; tok := split_part(a, '|', 2)::uuid;
  select external_id into ext from public.website_article_jobs where website_article_jobs.id = id;
  perform t.admin(format('insert into public.website_content (project_id, external_id, title, status, payload) ' ||
    'values (%L, %L, ''Published by the owner'', ''published'', ''{"version":1}'')', (select i.id from t.ids i where i.k = 'P'), ext));
  select md5(c::text) into before from public.website_content c where external_id = ext;
  r := t.q('w1', t.save_sql(id, tok))::jsonb;
  perform t.ok('T16 published row: skipped, never overwritten',
    r ->> 'skipped' = 'existing_row_published' and (select md5(c::text) from public.website_content c where external_id = ext) = before, r::text);
  perform t.admin(format('update public.website_content set status = ''pending_review'', hero_image_status = ''ready'', ' ||
    'hero_image_url = ''https://img.example/h.png'' where external_id = %L', ext));
  r := t.q('w1', t.save_sql(id, tok, 'Regenerated'))::jsonb;
  perform t.ok('T16 pending row updated; an operator''s hero image is preserved',
    (select title = 'Regenerated' and hero_image_status = 'ready' and hero_image_url = 'https://img.example/h.png'
       from public.website_content where external_id = ext), r::text);
  begin perform t.q('w1', format('select public.website_article_job_save_content(%L::uuid, %L::uuid, %L::jsonb)::text',
      id, tok, '{"payload":{"external_id":"omnira_someone_else"}}')); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok('T16 payload.external_id must be the job''s', code = '22023', code);
  foreach a in array array['anon', 'authenticated'] loop
    begin perform t.q(a, t.save_sql(id, tok)); code := 'none'; exception when others then code := sqlstate; end;
    perform t.ok('T16 ' || a || ' cannot call the save function', code = '42501', code);
  end loop;
end $$;

select t.close_all();
insert into t.results
  select g || ' produced no results (block aborted)', false, null
    from unnest(array['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12','T13','T14','T15','T16']) g
   where not exists (select 1 from t.results r where r.name like g || ' %');
\set ON_ERROR_STOP 1
select case when ok then 'PASS' else 'FAIL' end || '  ' || name || coalesce('  [' || detail || ']', '') as result
  from t.results order by ctid;
select format('SUMMARY %s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from t.results;
