-- Atlas Creative P7: private, dormant creative job staging and one-use claim.
-- DOES NOT authorize editor execution, publish an asset, register a route, or
-- alter any code-work broker authorization.
-- Run only after review. NOT applied by this PR.
begin;

create table public.atlas_creative_queue_staging (
  work_id text primary key check (work_id ~ '^[A-Za-z][A-Za-z0-9_-]{2,63}$'),
  project_id uuid not null references public.projects(id) on delete restrict,
  source_asset_id uuid not null references public.assets(id) on delete restrict,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  worker_id text not null check (worker_id ~ '^[A-Za-z][A-Za-z0-9_-]{2,63}$'),
  operation_id text not null check (operation_id in (
    'photocraft.convert-webp','filmcraft.demo-export-mp4'
  )),
  binary_sha256 text not null check (binary_sha256 ~ '^[a-f0-9]{64}$'),
  approval_receipt_sha256 text not null check (approval_receipt_sha256 ~ '^[a-f0-9]{64}$'),
  signed_ticket_sha256 text not null unique check (signed_ticket_sha256 ~ '^[a-f0-9]{64}$'),
  claim_nonce_sha256 text not null unique check (claim_nonce_sha256 ~ '^[a-f0-9]{64}$'),
  output_max_bytes integer not null check (output_max_bytes between 100 and 41943040),
  ticket_issued_at timestamptz not null,
  ticket_expires_at timestamptz not null,
  status text not null default 'staged' check (status in (
    'staged','claimed_preview_only','cancelled','expired'
  )),
  claim_id uuid unique,
  claim_fence bigint not null default 0 check (claim_fence between 0 and 1),
  claimed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint atlas_creative_ticket_short_lived check (
    ticket_expires_at > ticket_issued_at
    and ticket_expires_at <= ticket_issued_at + interval '5 minutes'
  ),
  constraint atlas_creative_claim_projection check (
    (status = 'claimed_preview_only' and claim_id is not null
      and claimed_at is not null and claim_fence = 1)
    or (status <> 'claimed_preview_only' and claim_id is null
      and claimed_at is null and claim_fence = 0)
  )
);
create index atlas_creative_queue_staged_by_worker
  on public.atlas_creative_queue_staging (worker_id, ticket_expires_at)
  where status = 'staged';

alter table public.atlas_creative_queue_staging enable row level security;
-- Do NOT FORCE RLS here: the reviewed SECURITY DEFINER primitive must work
-- under its owner. Public/anon/authenticated receive no table grants or policies.
revoke all on public.atlas_creative_queue_staging
  from public, anon, authenticated, service_role;
-- Only a trusted server can create a staged item; no browser or agent writes.
-- There is intentionally no UPDATE or DELETE grant.
grant select, insert on public.atlas_creative_queue_staging to service_role;

-- The caller is a separately-authenticated, trusted server. Its worker identity
-- must be derived from an enrolled creative broker, not from a request body.
-- Exact hashes bind the SQL claim to the previously verified signed ticket.
-- The SQL function cannot verify a signature or a human approver; that remains
-- an independent mandatory server-side prerequisite.
create function public.atlas_creative_claim_staging_p7(
  p_work_id text,
  p_worker_id text,
  p_signed_ticket_sha256 text,
  p_claim_nonce_sha256 text,
  p_approval_receipt_sha256 text
)
returns table (
  claimed_work_id text,
  claimed_id uuid,
  claimed_fence bigint,
  claimed_state text
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_job public.atlas_creative_queue_staging%rowtype;
  v_asset_project uuid;
  v_asset_sha text;
  v_asset_kind text;
  v_claim uuid;
begin
  -- Fail closed for untrusted roles, including direct authenticated callers.
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role'
  then
    raise exception 'creative queue caller rejected' using errcode = 'insufficient_privilege';
  end if;
  if p_work_id is null
    or p_worker_id is null or p_worker_id !~ '^[A-Za-z][A-Za-z0-9_-]{2,63}$'
    or p_signed_ticket_sha256 is null or p_signed_ticket_sha256 !~ '^[a-f0-9]{64}$'
    or p_claim_nonce_sha256 is null or p_claim_nonce_sha256 !~ '^[a-f0-9]{64}$'
    or p_approval_receipt_sha256 is null or p_approval_receipt_sha256 !~ '^[a-f0-9]{64}$'
  then
    raise exception 'creative claim invalid' using errcode = 'invalid_parameter_value';
  end if;
  select * into v_job
    from public.atlas_creative_queue_staging
    where work_id = p_work_id
    for update;
  if not found or v_job.status <> 'staged' or v_job.claim_fence <> 0
    or v_job.claim_id is not null
    or v_job.ticket_expires_at <= clock_timestamp()
    or v_job.ticket_issued_at > clock_timestamp() + interval '30 seconds'
    or v_job.worker_id is distinct from p_worker_id
    or v_job.signed_ticket_sha256 is distinct from p_signed_ticket_sha256
    or v_job.claim_nonce_sha256 is distinct from p_claim_nonce_sha256
    or v_job.approval_receipt_sha256 is distinct from p_approval_receipt_sha256
  then
    raise exception 'creative job unavailable' using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- Recheck source ownership and the immutable input hash while row is locked.
  select a.project_id, a.checksum_sha256, a.kind
    into v_asset_project, v_asset_sha, v_asset_kind
    from public.assets a
    where a.id = v_job.source_asset_id and a.status = 'active';
  if v_asset_project is distinct from v_job.project_id
    or v_asset_sha is distinct from v_job.source_sha256
    or (v_job.operation_id = 'photocraft.convert-webp' and v_asset_kind <> 'image')
    or (v_job.operation_id = 'filmcraft.demo-export-mp4' and v_asset_kind <> 'video')
  then
    raise exception 'creative source invalid' using errcode = 'object_not_in_prerequisite_state';
  end if;

  v_claim := gen_random_uuid();
  update public.atlas_creative_queue_staging q
    set status = 'claimed_preview_only', claim_id = v_claim,
        claimed_at = clock_timestamp(), claim_fence = 1
    where q.work_id = p_work_id;
  claimed_work_id := p_work_id;
  claimed_id := v_claim;
  claimed_fence := 1;
  claimed_state := 'claimed_preview_only';
  return next;
end;
$fn$;

revoke all on function public.atlas_creative_claim_staging_p7(
  text,text,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.atlas_creative_claim_staging_p7(
  text,text,text,text,text
) to service_role;

-- Claim state is PREVIEW-ONLY. No execution, file paths, credentials or
-- commands leave SQL. No unclaim/replay/lease-renewal primitive is exposed.
commit;
