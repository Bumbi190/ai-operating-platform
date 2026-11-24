-- REVIEW ONLY. DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT APPROVAL.
-- Source: M0 budget_reserve 20261001160000; existing G2/M0 locks retained.
-- This migration only adds a nullable cap to platform_config and patches
-- the canonical 6-arg budget_reserve function. ZERO rows are updated, cap
-- is NOT populated. Operator must separately approve the pilot cap and release.
begin;

alter table public.platform_config
  add column if not exists atlas_bedrock_monthly_sek numeric(12,4);

alter table public.platform_config
  add constraint atlas_bedrock_monthly_sek_reviewed_limit
  check (atlas_bedrock_monthly_sek is null
    or (atlas_bedrock_monthly_sek >= 0 and atlas_bedrock_monthly_sek <= 750));

comment on column public.platform_config.atlas_bedrock_monthly_sek
  is 'Proposed optional pooled gross SEK/month for AWS Bedrock across projects; NULL disables. No automatic activation.';

create or replace function public.budget_reserve(
  p_project_id      uuid,
  p_estimated_sek   numeric,
  p_idempotency_key text default null,
  p_provider        text default null,
  p_operation       text default null,
  p_stale_minutes   int  default 30
) returns table (
  allowed        boolean,
  reservation_id uuid,
  reason         text,
  budget_sek     numeric,
  committed_sek  numeric,
  reserved_sek   numeric,
  headroom_sek   numeric,
  binding_scope  text
) language plpgsql security definer set search_path to '' as $$
declare
  v_existing public.spend_reservations;
  v_id       uuid;
  v_has_proj boolean;
  v_has_glob boolean;
  v_scope    text;
  v_lim      numeric;
  v_spent    numeric;
  v_held     numeric;
  v_rem      numeric;
  v_aws_limit numeric;
  v_aws_spent numeric;
  v_aws_held numeric;
  v_aws_rem numeric;
  v_month_start timestamptz;
  v_month_end timestamptz;
begin
  -- NaN and Infinity are valid `numeric` values and BOTH slip past a bare
  -- `< 0` test. Named explicitly. For numeric (unlike float) NaN = NaN is true.
  if p_estimated_sek is null
     or p_estimated_sek = 'NaN'::numeric
     or p_estimated_sek = 'Infinity'::numeric
     or p_estimated_sek = '-Infinity'::numeric
     or p_estimated_sek < 0 then
    return query select false, null::uuid, 'invalid_estimate',
                        null::numeric, null::numeric, null::numeric, null::numeric, null::text;
    return;
  end if;

  -- Locks FIRST. Everything below, replay included, is decided under them.
  perform pg_advisory_xact_lock(hashtext('budget_reserve:' || p_project_id::text));
  perform pg_advisory_xact_lock(hashtext('budget_reserve:__platform__'));

  if p_idempotency_key is not null then
    select * into v_existing
      from public.spend_reservations where idempotency_key = p_idempotency_key;
    if found then
      -- ── IDENTITY BINDING ──────────────────────────────────────────────────
      -- A key names ONE spend. Matching the key alone would let a caller mint a
      -- cheap reservation and then present the same key for a different project,
      -- a different provider, a different operation or a LARGER estimate, and
      -- have the old, smaller reservation authorise it. Every field the verdict
      -- depends on is therefore compared, BEFORE the state branch, so a
      -- mismatch cannot even learn which state the reservation is in.
      --
      -- Estimate rule: the held amount must COVER the request. A smaller request
      -- against a larger reservation is safe (it over-reserves) and allowed; a
      -- larger request is refused rather than silently under-reserved. Growing a
      -- reservation would need a full re-evaluation of all six scopes under the
      -- locks, which is a new spend — so it is expressed as one: mint a new key.
      if v_existing.project_id      is distinct from p_project_id
         or v_existing.provider     is distinct from p_provider
         or v_existing.operation    is distinct from p_operation
         or p_estimated_sek > v_existing.estimated_sek then
        return query select false, v_existing.id, 'replay_identity_mismatch'::text,
                            null::numeric, null::numeric, null::numeric, null::numeric, null::text;
        return;
      end if;

      if v_existing.status = 'open'
         and (v_existing.created_at > now() - make_interval(mins => p_stale_minutes)
              -- M0: a reservation whose provider dispatch MAY have happened is in
              -- flight for as long as it is open. Time passing proves nothing.
              or v_existing.dispatched_at is not null) then
        -- ── ONE RESERVATION AUTHORISES ONE DISPATCH ─────────────────────────
        -- REFUSED. A reservation of 30 SEK holds 30 SEK of headroom; handing it
        -- to a second caller would authorise two 30 SEK provider calls against
        -- it, which is an under-reservation and a ceiling bypass. Budget
        -- idempotency is not provider-dispatch idempotency, and this function
        -- can only promise the first.
        return query select false, v_existing.id, 'replay_in_flight'::text,
                            null::numeric, null::numeric, null::numeric, null::numeric, null::text;
      elsif v_existing.status = 'open' then
        -- ── STALE-OPEN: ALSO REFUSED, and this is the load-bearing part ─────
        -- A visibility timeout proves only that no lifecycle progress has been
        -- OBSERVED. It does not prove the original provider request never
        -- executed, or that it is not still executing. An earlier draft
        -- re-decided a stale reservation against current ceilings and returned
        -- it as allowed; that still let one reservation authorise a second
        -- dispatch whenever the first call outlived p_stale_minutes.
        --
        -- The reservation is released — it has already stopped counting toward
        -- headroom, and leaving it open would let it silently start counting
        -- again on a later read. A caller that genuinely wants to spend again
        -- must mint a NEW key, which is a new reservation, honestly accounted.
        --
        -- A safe replay path needs a real dispatch claim, or provider-side
        -- idempotency for the exact request. Until one exists, ZERO replay
        -- states return allowed, which is why runtime keys stay dormant.
        -- M0: reached only for an UNDISPATCHED reservation (a dispatched one is
        -- in flight above), and the predicate restates it so this UPDATE can
        -- never release spend that may have reached a provider.
        update public.spend_reservations
           set status = 'released', resolved_at = now(), release_basis = 'replay_stale_undispatched'
         where id = v_existing.id and dispatched_at is null;
        return query select false, v_existing.id, 'replay_stale'::text,
                            null::numeric, null::numeric, null::numeric, null::numeric, null::text;
      elsif v_existing.status = 'settled' then
        return query select false, v_existing.id, 'replay_settled'::text,
                            null::numeric, null::numeric, null::numeric, null::numeric, null::text;
      else
        return query select false, v_existing.id, 'replay_released'::text,
                            null::numeric, null::numeric, null::numeric, null::numeric, null::text;
      end if;
      return;
    end if;
  end if;

  -- Fail closed on either authority being absent. An unconfigured budget is not
  -- an unlimited budget, and an absent platform ceiling is not "no ceiling".
  select exists (select 1 from public.project_budgets b
                  where b.project_id = p_project_id and b.monthly_sek is not null),
         exists (select 1 from public.platform_config c
                  where c.id = 1 and c.global_daily_sek is not null
                    and c.global_weekly_sek is not null and c.global_monthly_sek is not null)
    into v_has_proj, v_has_glob;

  if not v_has_proj then
    return query select false, null::uuid, 'no_budget_configured',
                        null::numeric, null::numeric, null::numeric, null::numeric, null::text;
    return;
  end if;
  if not v_has_glob then
    return query select false, null::uuid, 'no_global_budget_configured',
                        null::numeric, null::numeric, null::numeric, null::numeric, null::text;
    return;
  end if;

  -- The TIGHTEST configured scope decides, and is named in the verdict so an
  -- operator sees WHICH ceiling refused rather than only that one did.
  select s.scope, s.limit_sek, s.spent_sek, s.held_sek, s.remaining_sek
    into v_scope, v_lim, v_spent, v_held, v_rem
    from public.budget_scope_state(p_project_id, p_stale_minutes) s
   order by s.remaining_sek asc
   limit 1;


  -- Review-only proposed Bedrock pool. Both existing advisory locks were
  -- taken at function entry (project then PLATFORM). This cross-project
  -- read + new reservation are ONE serialized transaction.
  if p_provider = 'aws-bedrock' then
    select c.atlas_bedrock_monthly_sek
      into v_aws_limit
      from public.platform_config c where c.id=1;
    -- NULL / ZERO means no owner-approved monthly AWS pool: NEVER dispatch.
    if v_aws_limit is null or v_aws_limit <= 0 then
      return query select false,null::uuid,'no_global_budget_configured'::text,
        null::numeric,null::numeric,null::numeric,null::numeric,
        'atlas_bedrock_monthly'::text;
      return;
    end if;

    v_month_start := date_trunc('month',now() at time zone 'Europe/Stockholm')
      at time zone 'Europe/Stockholm';
    v_month_end := (date_trunc('month',now() at time zone 'Europe/Stockholm')
      + interval '1 month') at time zone 'Europe/Stockholm';

    -- GROSS settled spend, not net/refunded spend. No outside-project rows
    -- except the exact provider tag; all projects share the same cap.
    select coalesce(sum(greatest(e.cost_sek,0)),0)
      into v_aws_spent
      from public.cost_events e
     where e.provider='aws-bedrock'
       and e.created_at >= v_month_start and e.created_at < v_month_end;

    -- M0: fresh undispatched OPEN + ALL potentially dispatched OPEN, including
    -- one carried across a month boundary. Never refund a possibly sent call.
    select coalesce(sum(r.estimated_sek),0)
      into v_aws_held
      from public.spend_reservations r
     where r.provider='aws-bedrock' and r.status='open'
       and (
         (r.dispatched_at is null
           and r.created_at >= v_month_start
           and r.created_at < v_month_end
           and r.created_at > now()-make_interval(mins=>p_stale_minutes))
         or
         (r.dispatched_at is not null and r.created_at < v_month_end)
       );
    v_aws_rem := least(v_aws_limit,
      v_aws_limit - v_aws_spent - v_aws_held);
    if v_aws_rem < v_rem then
      v_scope := 'atlas_bedrock_monthly';
      v_lim := v_aws_limit;
      v_spent := v_aws_spent;
      v_held := v_aws_held;
      v_rem := v_aws_rem;
    end if;
  end if;

  insert into public.spend_reservations (project_id, estimated_sek, provider, operation,
                                         idempotency_key, status, release_basis)
  values (p_project_id, p_estimated_sek, p_provider, p_operation, p_idempotency_key,
          case when p_estimated_sek <= v_rem then 'open' else 'released' end,
          case when p_estimated_sek <= v_rem then null else 'refused_at_reserve' end)
  returning id into v_id;

  if p_estimated_sek <= v_rem then
    return query select true, v_id, 'ok'::text, v_lim, v_spent, v_held, v_rem, v_scope;
  else
    return query select false, v_id, 'budget_exceeded'::text, v_lim, v_spent, v_held, v_rem, v_scope;
  end if;
end $$;

revoke all on function public.budget_reserve(uuid,numeric,text,text,text,int)
 from public,anon,authenticated;
grant execute on function public.budget_reserve(uuid,numeric,text,text,text,int)
 to service_role;

-- Presence marker installed atomically with the patched budget_reserve.
-- It attests only the schema version; it does NOT authorize spend or mint
-- a financial grant. Service-role only, never anon/authenticated.
create or replace function public.atlas_bedrock_monthly_pool_version_v1()
returns text language sql stable security definer set search_path='' as $tag$
 select 'aws-bedrock-monthly-pool-v1'::text;
$tag$;
revoke all on function public.atlas_bedrock_monthly_pool_version_v1()
 from public,anon,authenticated;
grant execute on function public.atlas_bedrock_monthly_pool_version_v1()
 to service_role;
commit;