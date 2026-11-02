-- Finite owner-requested public discovery; candidates never establish outreach eligibility.
create table public.sales_discovery_batches(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),owner_id uuid not null,
 request_key uuid not null,query jsonb not null,state text not null default 'pending' check(state in('pending','completed','failed')),
 candidate_ids uuid[] not null default '{}',error_code text,completion jsonb,
 created_at timestamptz not null default clock_timestamp(),completed_at timestamptz,
 unique(project_id,id),unique(project_id,request_key),check(cardinality(candidate_ids)<=25)
);
create table public.sales_discovery_candidates(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),
 source_key text not null,data jsonb not null,name_key text not null,email_key text,website_key text,
 version integer not null default 1 check(version>0),status text not null default 'needs_review' check(status in('needs_review','rejected','excluded','suppressed','duplicate','promoted')),
 exclusions text[] not null default '{}',review_note text,reviewed_by uuid,reviewed_at timestamptz,
 first_seen_at timestamptz not null,last_seen_at timestamptz not null,promoted_contact_id uuid,promotion_request jsonb,
 unique(project_id,id),unique(project_id,source_key),unique(project_id,promoted_contact_id),
 foreign key(project_id,promoted_contact_id) references public.sales_contacts(project_id,id),
 check((status='promoted')=(promoted_contact_id is not null)),check((status='promoted')=(promotion_request is not null)),check(cardinality(exclusions)<=16)
);
create index sales_discovery_recent on public.sales_discovery_batches(project_id,created_at desc);
create index sales_discovery_identity on public.sales_discovery_candidates(project_id,name_key);
alter table public.sales_discovery_batches enable row level security;
alter table public.sales_discovery_candidates enable row level security;
revoke all on public.sales_discovery_batches,public.sales_discovery_candidates from public,anon,authenticated,service_role;
grant select,insert,update on public.sales_discovery_batches,public.sales_discovery_candidates to service_role;

create function public.sales_discovery_text(v jsonb,max_length integer,min_length integer default 1) returns text language plpgsql security invoker set search_path='' as $$
declare s text:=v#>>'{}';begin
 if jsonb_typeof(v) is distinct from 'string' or length(s)>max_length or length(btrim(s))<min_length or s ~ '[[:cntrl:]]' then raise exception 'INVALID_BODY' using errcode='22023';end if;return btrim(s);
end$$;
create function public.sales_discovery_email(v jsonb) returns text language plpgsql security invoker set search_path='' as $$
declare s text;begin
 if v='null'::jsonb then return null;end if;s:=lower(public.sales_discovery_text(v,254));
 if s !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' then raise exception 'INVALID_BODY' using errcode='22023';end if;return s;
end$$;
create function public.sales_discovery_website(v jsonb,https_only boolean default false) returns text language plpgsql security invoker set search_path='' as $$
declare s text;h text;begin
 if v='null'::jsonb then return null;end if;s:=public.sales_discovery_text(v,2048);
 if s !~* '^https?://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(/[^[:space:]#]*)?$' or (https_only and s !~ '^https://') then raise exception 'INVALID_BODY' using errcode='22023';end if;
 h:=substring(lower(s) from '^https?://([^/]+)');if h ~ '\.(localhost|local|localdomain|internal|lan|home|arpa|corp|intranet|test|invalid|onion)$' then raise exception 'INVALID_BODY' using errcode='22023';end if;return s;
end$$;
create function public.sales_discovery_domain(v text) returns text language sql immutable security invoker set search_path='' as $$
 select nullif(regexp_replace(lower(substring(v from '^https?://([^/?#]+)')),'^www\.',''),'')
$$;
create function public.sales_discovery_name(v text) returns text language sql immutable security invoker set search_path='' as $$
 select btrim(regexp_replace(regexp_replace(regexp_replace(replace(translate(lower(coalesce(v,'')),'åäöéèêëáàâãíìîïóòôõúùûüçñ','aaoeeeeaaaaiiiioooouuuucn'),'&',' och '),'[^a-z0-9 ]',' ','g'),'\m(aktiebolag|ab|hb|kb|handelsbolag|kommanditbolag|ekonomisk forening|ek for|enskild firma)\M',' ','g'),'\s+',' ','g'))
$$;
create function public.sales_discovery_reasons(v jsonb) returns text[] language plpgsql security invoker set search_path='' as $$
declare x jsonb;s text;result text[]:='{}';begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>16 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 for x in select value from jsonb_array_elements(v) loop
  s:=public.sales_discovery_text(x,60);if s not in('existing_account','pilot_contact','declined','already_contacted','suppressed','excluded','existing_contact','duplicate_candidate') then raise exception 'INVALID_BODY' using errcode='22023';end if;
  if not(s=any(result)) then result:=array_append(result,s);end if;
 end loop;return result;
end$$;
create function public.sales_discovery_query(v jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform public.sales_timing_fields(v,array['city','category','radiusKm','limit']);
 if coalesce(v->>'city','') not in('stockholm','goteborg','malmo','uppsala','orebro','jonkoping') or coalesce(v->>'category','') not in('car_dealer','car_repair','restaurant','cafe','hairdresser','dentist')
 or jsonb_typeof(v->'radiusKm') is distinct from 'number' or v->>'radiusKm' !~ '^[0-9]{1,2}$' or (v->>'radiusKm')::integer not between 1 and 25
 or jsonb_typeof(v->'limit') is distinct from 'number' or v->>'limit' !~ '^[0-9]{1,2}$' or (v->>'limit')::integer not between 1 and 25 then raise exception 'INVALID_BODY' using errcode='22023';end if;
end$$;
create function public.sales_discovery_version(v jsonb) returns integer language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(v) is distinct from 'number' or v#>>'{}' !~ '^[1-9][0-9]{0,9}$' or (v#>>'{}')::bigint>2147483647 then raise exception 'INVALID_BODY' using errcode='22023';end if;return (v#>>'{}')::integer;
end$$;
create function public.sales_discovery_contact_reasons(pid uuid,n text,address text,site text) returns text[] language sql stable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct reason order by reason),'{}'::text[]) from public.sales_contacts c cross join lateral unnest(array['existing_contact',case when c.data->>'suppressed'='true' then 'suppressed' end,case when c.data->>'excluded'='true' then 'excluded' end,case when c.data->>'history'='contacted' then 'already_contacted' end]) reason
 where c.project_id=pid and reason is not null and (
 (address is not null and lower(btrim(c.data->>'email'))=address) or
 (length(public.sales_discovery_name(n))>=3 and public.sales_discovery_name(c.data->>'companyName')=public.sales_discovery_name(n)) or
 (public.sales_discovery_domain(site) is not null and public.sales_discovery_domain(c.data->>'websiteUrl')=public.sales_discovery_domain(site)))
$$;
create function public.sales_discovery_candidate_reasons(pid uuid,own_id uuid,n text,address text,site text) returns text[] language sql stable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct reason order by reason),'{}'::text[])
 from public.sales_discovery_candidates other
 cross join lateral unnest(other.exclusions||array['duplicate_candidate']||case when other.status='suppressed' then array['suppressed'] when other.status in('excluded','rejected') then array['excluded'] else '{}'::text[] end) reason
 where other.project_id=pid and other.id<>own_id
 -- A technical duplicate alone must not veto its canonical candidate.
 and (other.status in('suppressed','excluded','rejected') or other.exclusions && array['existing_account','pilot_contact','declined','already_contacted','suppressed','excluded','existing_contact'])
 and (
  (address is not null and (other.email_key=address or lower(btrim(other.promotion_request->>'email'))=address)) or
  (length(public.sales_discovery_name(n))>=3 and (other.name_key=public.sales_discovery_name(n) or public.sales_discovery_name(other.promotion_request->>'companyName')=public.sales_discovery_name(n))) or
  (public.sales_discovery_domain(site) is not null and (other.website_key=public.sales_discovery_domain(site) or public.sales_discovery_domain(other.promotion_request->>'websiteUrl')=public.sales_discovery_domain(site)))
 )
$$;
create function public.sales_discovery_candidate_json(c public.sales_discovery_candidates) returns jsonb language sql stable security invoker set search_path='' as $$
 select c.data||jsonb_build_object('id',c.id,'projectId',c.project_id,'version',c.version,'status',c.status,'exclusions',to_jsonb(c.exclusions),'reviewNote',c.review_note,'firstSeenAt',c.first_seen_at,'lastSeenAt',c.last_seen_at,'promotedContactId',c.promoted_contact_id,'historyCoverage','partial','outreachReady',false)
$$;
create function public.sales_discovery_batch_json(b public.sales_discovery_batches) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',b.id,'query',b.query,'state',b.state,'errorCode',b.error_code,'createdAt',b.created_at,'completedAt',b.completed_at,'candidateCount',cardinality(b.candidate_ids))
$$;
create function public.sales_discovery_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid;bid uuid;b public.sales_discovery_batches;recent jsonb;rows jsonb;begin
 perform public.sales_timing_fields(p_input,array['projectId','batchId']);pid:=public.sales_timing_uuid(p_input->'projectId');perform public.sales_owner(p_principal,pid);
 if p_input->'batchId'<>'null'::jsonb then bid:=public.sales_timing_uuid(p_input->'batchId');select * into b from public.sales_discovery_batches where project_id=pid and id=bid;if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 else select * into b from public.sales_discovery_batches where project_id=pid order by created_at desc,id desc limit 1;end if;
 select coalesce(jsonb_agg(public.sales_discovery_batch_json(r::public.sales_discovery_batches) order by r.created_at desc,r.id desc),'[]'::jsonb) into recent from (select * from public.sales_discovery_batches where project_id=pid order by created_at desc,id desc limit 10) r;
 select coalesce(jsonb_agg(public.sales_discovery_candidate_json(c) order by ref.ordinality),'[]'::jsonb) into rows from unnest(b.candidate_ids) with ordinality ref(id,ordinality) join public.sales_discovery_candidates c on c.id=ref.id and c.project_id=pid;
 return jsonb_build_object('projectId',pid,'batch',case when b.id is null then null else public.sales_discovery_batch_json(b) end,'batches',recent,'candidates',rows,'historyCoverage','partial','customerSendingEnabled',false);
end$$;
create function public.sales_discovery_candidate(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid;c public.sales_discovery_candidates;begin
 perform public.sales_timing_fields(p_input,array['projectId','candidateId']);pid:=public.sales_timing_uuid(p_input->'projectId');perform public.sales_owner(p_principal,pid);
 select * into c from public.sales_discovery_candidates where project_id=pid and id=public.sales_timing_uuid(p_input->'candidateId');if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;return public.sales_discovery_candidate_json(c);
end$$;
create function public.sales_discovery_begin(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid;request_id uuid;b public.sales_discovery_batches;begin
 perform public.sales_timing_fields(p_input,array['projectId','idempotencyKey','query']);pid:=public.sales_timing_uuid(p_input->'projectId');perform public.sales_owner(p_principal,pid);perform public.sales_discovery_query(p_input->'query');request_id:=public.sales_timing_uuid(p_input->'idempotencyKey');
 perform public.sales_stop(pid);perform pg_advisory_xact_lock(hashtextextended('sales-discovery-overpass-admission',0));perform pg_advisory_xact_lock(hashtextextended(pid::text||':sales-discovery-batch',0));
 select * into b from public.sales_discovery_batches where project_id=pid and request_key=request_id;
 if found then if b.query is distinct from p_input->'query' then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return jsonb_build_object('batchId',b.id,'fetchRequired',false);end if;
 -- Shared approved-source pilot limits: one admission at a time, 30s after a
 -- terminal response, 90s for unresolved work (45s route +30s cooldown +margin),
 -- and at most 25 admitted attempts in a rolling 24h across all projects.
 if exists(select from public.sales_discovery_batches where
   greatest(created_at,coalesce(completed_at,created_at))>clock_timestamp()-interval '30 seconds'
   or (state='pending' and created_at>clock_timestamp()-interval '90 seconds'))
 or (select count(*) from public.sales_discovery_batches where created_at>clock_timestamp()-interval '24 hours')>=25
 then return jsonb_build_object('rateLimited',true,'fetchRequired',false);end if;
 insert into public.sales_discovery_batches(project_id,owner_id,request_key,query) values(pid,(p_principal->>'userId')::uuid,request_id,p_input->'query') returning * into b;
 return jsonb_build_object('batchId',b.id,'fetchRequired',true);
end$$;
create function public.sales_discovery_finish(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid;b public.sales_discovery_batches;c public.sales_discovery_candidates;item jsonb;source_id text;n text;address text;site text;reasons text[];more text[];seen uuid[]:='{}';at timestamptz;new_status text;begin
 perform public.sales_timing_fields(p_input,array['projectId','batchId','retrievedAt','candidates']);pid:=public.sales_timing_uuid(p_input->'projectId');perform public.sales_owner(p_principal,pid);
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':sales-contact-eligibility',0));
 select * into b from public.sales_discovery_batches where project_id=pid and id=public.sales_timing_uuid(p_input->'batchId') for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if b.state='completed' then if b.completion is distinct from p_input then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return jsonb_build_object('batchId',b.id);end if;
 if b.state<>'pending' then raise exception 'BATCH_CLOSED' using errcode='55000';end if;
 if jsonb_typeof(p_input->'candidates') is distinct from 'array' or jsonb_array_length(p_input->'candidates')>(b.query->>'limit')::integer then raise exception 'INVALID_BODY' using errcode='22023';end if;
 at:=public.sales_timing_instant(p_input->'retrievedAt',clock_timestamp());if at<b.created_at-interval '1 second' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_input->'candidates') loop
  perform public.sales_timing_fields(item,array['sourceId','sourceUrl','name','websiteUrl','email','exclusions']);
  source_id:=public.sales_discovery_text(item->'sourceId',60);if source_id !~ '^(node|way|relation)/[1-9][0-9]{0,15}$' or item->>'sourceUrl' is distinct from 'https://www.openstreetmap.org/'||source_id then raise exception 'INVALID_BODY' using errcode='22023';end if;
  n:=public.sales_discovery_text(item->'name',200,2);address:=public.sales_discovery_email(item->'email');site:=public.sales_discovery_website(item->'websiteUrl');
  reasons:=public.sales_discovery_reasons(item->'exclusions')||public.sales_discovery_contact_reasons(pid,n,address,site);
  select * into c from public.sales_discovery_candidates where project_id=pid and source_key=source_id for update;
  if not found then
   select coalesce(array_agg(distinct reason),'{}'::text[]) into more from public.sales_discovery_candidates other cross join lateral unnest(other.exclusions||array['duplicate_candidate']||case when other.status='suppressed' then array['suppressed'] else '{}'::text[] end) reason
   where other.project_id=pid and ((address is not null and other.email_key=address) or (public.sales_discovery_domain(site) is not null and other.website_key=public.sales_discovery_domain(site)) or (length(public.sales_discovery_name(n))>=3 and other.name_key=public.sales_discovery_name(n)));
   reasons:=reasons||more;select coalesce(array_agg(distinct r order by r),'{}'::text[]) into reasons from unnest(reasons) r;
   new_status:=case when 'suppressed'=any(reasons) then 'suppressed' when 'duplicate_candidate'=any(reasons) then 'duplicate' when cardinality(reasons)>0 then 'excluded' else 'needs_review' end;
   insert into public.sales_discovery_candidates(project_id,source_key,data,name_key,email_key,website_key,status,exclusions,first_seen_at,last_seen_at)
   values(pid,source_id,(item-'exclusions')||jsonb_build_object('name',n,'email',address,'websiteUrl',site),public.sales_discovery_name(n),address,public.sales_discovery_domain(site),new_status,reasons,at,at) returning * into c;
  else
   reasons:=reasons||c.exclusions;select coalesce(array_agg(distinct r order by r),'{}'::text[]) into reasons from unnest(reasons) r;
   new_status:=case when c.status<>'needs_review' then c.status when 'suppressed'=any(reasons) then 'suppressed' when cardinality(reasons)>0 then 'excluded' else c.status end;
   update public.sales_discovery_candidates set last_seen_at=greatest(last_seen_at,at),exclusions=reasons,status=new_status,version=version+case when exclusions is distinct from reasons or status is distinct from new_status then 1 else 0 end where id=c.id and project_id=pid returning * into c;
  end if;
  if not(c.id=any(seen)) then seen:=array_append(seen,c.id);end if;
 end loop;
 update public.sales_discovery_batches set state='completed',candidate_ids=seen,completion=p_input,completed_at=clock_timestamp() where id=b.id;
 return jsonb_build_object('batchId',b.id);
end$$;
create function public.sales_discovery_fail(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid;b public.sales_discovery_batches;code text;begin
 perform public.sales_timing_fields(p_input,array['projectId','batchId','errorCode']);pid:=public.sales_timing_uuid(p_input->'projectId');perform public.sales_owner(p_principal,pid);
 code:=public.sales_discovery_text(p_input->'errorCode',60);if code not in('DISCOVERY_RATE_LIMITED','DISCOVERY_PROVIDER_TIMEOUT','DISCOVERY_RESPONSE_TOO_LARGE','DISCOVERY_PROVIDER_UNAVAILABLE','DISCOVERY_STORE_UNAVAILABLE','DISCOVERY_SOURCE_NOT_CONFIGURED') then raise exception 'INVALID_BODY' using errcode='22023';end if;
 select * into b from public.sales_discovery_batches where project_id=pid and id=public.sales_timing_uuid(p_input->'batchId') for update;if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if b.state='pending' then update public.sales_discovery_batches set state='failed',error_code=code,completed_at=clock_timestamp() where id=b.id;end if;
 return jsonb_build_object('batchId',b.id);
end$$;
create function public.sales_discovery_review(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid;c public.sales_discovery_candidates;decision text;note text;expected integer;begin
 perform public.sales_timing_fields(p_input,array['projectId','candidateId','expectedVersion','decision','note']);pid:=public.sales_timing_uuid(p_input->'projectId');perform public.sales_owner(p_principal,pid);
 decision:=public.sales_discovery_text(p_input->'decision',30);note:=public.sales_discovery_text(p_input->'note',500);expected:=public.sales_discovery_version(p_input->'expectedVersion');
 if decision not in('rejected','excluded','suppressed') then raise exception 'INVALID_BODY' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':sales-contact-eligibility',0));
 select * into c from public.sales_discovery_candidates where project_id=pid and id=public.sales_timing_uuid(p_input->'candidateId') for update;if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if c.version<>expected then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;if c.status<>'needs_review' then raise exception 'REVIEW_CLOSED' using errcode='55000';end if;
 update public.sales_discovery_candidates set status=decision,version=version+1,review_note=note,reviewed_by=(p_principal->>'userId')::uuid,reviewed_at=clock_timestamp(),exclusions=case when decision in('excluded','suppressed') and not(decision=any(exclusions)) then exclusions||array[decision] else exclusions end where id=c.id and project_id=pid returning * into c;
 return public.sales_discovery_candidate_json(c);
end$$;
create function public.sales_discovery_promote(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid;c public.sales_discovery_candidates;expected integer;n text;branch text;address text;site text;note text;kind text;months integer;reasons text[];contact jsonb;cid uuid;begin
 perform public.sales_timing_fields(p_input,array['projectId','candidateId','expectedVersion','companyName','branchName','email','websiteUrl','reviewNote','businessConfirmed','emailConfirmed','offerKind','pilotMonths','baselineReasons']);
 pid:=public.sales_timing_uuid(p_input->'projectId');perform public.sales_owner(p_principal,pid);expected:=public.sales_discovery_version(p_input->'expectedVersion');
 n:=public.sales_discovery_text(p_input->'companyName',200);branch:=public.sales_discovery_text(p_input->'branchName',200,0);address:=public.sales_discovery_email(p_input->'email');site:=public.sales_discovery_website(p_input->'websiteUrl',true);note:=public.sales_discovery_text(p_input->'reviewNote',500);kind:=public.sales_discovery_text(p_input->'offerKind',30);reasons:=public.sales_discovery_reasons(p_input->'baselineReasons');
 if address is null or p_input->'businessConfirmed' is distinct from 'true'::jsonb or p_input->'emailConfirmed' is distinct from 'true'::jsonb or kind not in('pilot','general_service') then raise exception 'INVALID_BODY' using errcode='22023';end if;
 if kind='pilot' then if jsonb_typeof(p_input->'pilotMonths') is distinct from 'number' or p_input->'pilotMonths' not in('2'::jsonb,'6'::jsonb,'12'::jsonb) then raise exception 'INVALID_BODY' using errcode='22023';end if;months:=(p_input->>'pilotMonths')::integer;
 elsif p_input->'pilotMonths' is distinct from 'null'::jsonb then raise exception 'INVALID_BODY' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':sales-contact-eligibility',0));
 select * into c from public.sales_discovery_candidates where project_id=pid and id=public.sales_timing_uuid(p_input->'candidateId') for update;if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 -- Exact replay returns the original contact; changed replay cannot create another one.
 if c.status='promoted' then if c.promotion_request is distinct from (p_input-'baselineReasons') then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return jsonb_build_object('state','promoted','contactId',c.promoted_contact_id,'history','unknown');end if;
 if c.version<>expected then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 if c.status<>'needs_review' then return jsonb_build_object('state','blocked','reasons',to_jsonb(c.exclusions||array[c.status]));end if;
 reasons:=reasons||c.exclusions||public.sales_discovery_contact_reasons(pid,c.data->>'name',c.email_key,c.data->>'websiteUrl')||public.sales_discovery_contact_reasons(pid,n,address,site)||public.sales_discovery_candidate_reasons(pid,c.id,c.data->>'name',c.email_key,c.data->>'websiteUrl')||public.sales_discovery_candidate_reasons(pid,c.id,n,address,site);
 select coalesce(array_agg(distinct r order by r),'{}'::text[]) into reasons from unnest(reasons) r;
 if cardinality(reasons)>0 then
  update public.sales_discovery_candidates set exclusions=reasons,status=case when 'suppressed'=any(reasons) then 'suppressed' else 'excluded' end,version=version+1 where id=c.id and project_id=pid;
  return jsonb_build_object('state','blocked','reasons',to_jsonb(reasons));
 end if;
 cid:=gen_random_uuid();
 contact:=public.sales_save_contact(p_principal,jsonb_build_object('projectId',pid,'id',cid,'companyName',n,'branchName',branch,'email',address,'websiteUrl',site,'history','unknown','historySource',format('Offentlig källa: %s. Företag, mottagare och erbjudandetyp har granskats manuellt: %s. Kontakthistoriken är okänd och kräver separat historik- och tidsgranskning.',c.data->>'sourceUrl',note),'offerKind',kind,'pilotMonths',months,'confirmed',true,'excluded',false,'suppressed',false,'expectedVersion',0));
 if contact->>'id' is distinct from cid::text or contact->>'history' is distinct from 'unknown' then raise exception 'CONTACT_CONTRACT_MISMATCH' using errcode='55000';end if;
 update public.sales_discovery_candidates set status='promoted',promoted_contact_id=cid,promotion_request=p_input-'baselineReasons',version=version+1,review_note=note,reviewed_by=(p_principal->>'userId')::uuid,reviewed_at=clock_timestamp() where id=c.id and project_id=pid;
 return jsonb_build_object('state','promoted','contactId',cid,'history','unknown');
end$$;

-- Server-only RPCs, including helpers. Browser roles have no direct candidate access.
do $$declare f record;begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'sales_discovery_%' loop
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',f.proname,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
end$$;
