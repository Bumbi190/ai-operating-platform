-- Customer admin rehearsal only. Apply to a new, isolated local Supabase fixture.
-- This proposal is intentionally outside the migration directories. Sites, members
-- and the paid entitlement are provisioned by the operator, never by a customer.
begin;

create schema dealer_pilot;
revoke all on schema dealer_pilot from public, anon, authenticated;
grant usage on schema dealer_pilot to anon, authenticated;

create table dealer_pilot.sites (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  brand text not null check (char_length(brand) between 1 and 100),
  admin_enabled boolean not null default false
);
create table dealer_pilot.members (
  site_slug text not null references dealer_pilot.sites(slug),
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (site_slug,user_id)
);
create table dealer_pilot.photos (
  site_slug text not null references dealer_pilot.sites(slug),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  bytes bytea not null check (octet_length(bytes) between 20 and 180000),
  primary key (site_slug,hash)
);
create table dealer_pilot.vehicles (
  site_slug text not null references dealer_pilot.sites(slug),
  id uuid not null,
  version integer not null check (version>0),
  draft jsonb not null,
  published_revision integer,
  created_at timestamptz not null default clock_timestamp(),
  primary key (site_slug,id)
);
create table dealer_pilot.publications (
  site_slug text not null,
  vehicle_id uuid not null,
  revision integer not null check (revision>0),
  action text not null check (action in ('publish','restore')),
  -- Null records withdrawal. The last draft is retained for subsequent editing.
  content jsonb,
  actor uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (site_slug,vehicle_id,revision),
  foreign key (site_slug,vehicle_id) references dealer_pilot.vehicles(site_slug,id)
);
alter table dealer_pilot.vehicles add foreign key (site_slug,id,published_revision)
  references dealer_pilot.publications(site_slug,vehicle_id,revision);

-- A dealership gets an optional page on its first save. Old sites need no seed row.
create table dealer_pilot.pages (
  site_slug text primary key references dealer_pilot.sites(slug),
  version integer not null check (version>0),
  draft jsonb not null,
  published_revision integer
);
create table dealer_pilot.page_publications (
  site_slug text not null references dealer_pilot.pages(site_slug),
  revision integer not null check (revision>0),
  action text not null check (action in ('publish','restore')),
  content jsonb,
  actor uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (site_slug,revision)
);
alter table dealer_pilot.pages add foreign key (site_slug,published_revision)
  references dealer_pilot.page_publications(site_slug,revision);

alter table dealer_pilot.sites enable row level security;
alter table dealer_pilot.members enable row level security;
alter table dealer_pilot.photos enable row level security;
alter table dealer_pilot.vehicles enable row level security;
alter table dealer_pilot.publications enable row level security;
alter table dealer_pilot.pages enable row level security;
alter table dealer_pilot.page_publications enable row level security;
revoke all on all tables in schema dealer_pilot from public, anon, authenticated;

-- Definers live in the private schema, pin name resolution, and derive the editor
-- from the verified JWT. The exposed RPCs below are invokers. No client may use
-- the tables directly, including personal drafts, stored media, or audit rows.
create function dealer_pilot.require_editor(site text, lock_for_write boolean)
returns void language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if lock_for_write then
    -- Serializes quotas and edits for one site; disable/revoke overlaps are
    -- ordered by locks on both the site and the exact membership row.
    perform 1 from dealer_pilot.sites s join dealer_pilot.members m on m.site_slug=s.slug
    where s.slug=site and s.admin_enabled and m.user_id=auth.uid()
    for update of s for share of m;
  else
    perform 1 from dealer_pilot.sites s join dealer_pilot.members m on m.site_slug=s.slug
    where s.slug=site and s.admin_enabled and m.user_id=auth.uid()
    for share of s,m;
  end if;
  if not found then raise exception using errcode='42501', message='DEALER_ADMIN_DENIED'; end if;
end $$;

-- Both catalog consumers see only the row named by the public revision pointer.
create function dealer_pilot.published_page(site text) returns jsonb
language sql stable set search_path = pg_catalog, pg_temp as $$
  select h.content from dealer_pilot.pages p join dealer_pilot.page_publications h
    on (h.site_slug,h.revision)=(p.site_slug,p.published_revision) where p.site_slug=site
$$;

create function dealer_pilot.catalog(site text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare result jsonb;
begin
  select jsonb_build_object('slug',s.slug,'brand',s.brand,
    'siteContent',dealer_pilot.published_page(s.slug),'vehicles',coalesce((
    select jsonb_agg(jsonb_build_object('id',v.id,'version',p.revision,'content',p.content)
                     order by v.created_at,v.id)
    from dealer_pilot.vehicles v join dealer_pilot.publications p
      on (p.site_slug,p.vehicle_id,p.revision)=(v.site_slug,v.id,v.published_revision)
    where v.site_slug=s.slug and p.content is not null
  ),'[]'::jsonb)) into result from dealer_pilot.sites s where s.slug=site;
  if not found then raise exception using errcode='P0002', message='SHOWROOM_NOT_FOUND'; end if;
  return result;
end $$;

create function dealer_pilot.workspace(site text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare result jsonb;
begin
  perform dealer_pilot.require_editor(site,false);
  select jsonb_build_object('slug',s.slug,'brand',s.brand,
    'siteContent',dealer_pilot.published_page(s.slug),'vehicles',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',v.id,'version',v.version,'draft',v.draft,'published',p.content,
      'publishedRevision',v.published_revision,'history',coalesce((
        select jsonb_agg(jsonb_build_object('revision',h.revision,'at',h.created_at,
          'action',h.action,'available',h.content is not null) order by h.revision desc)
        from (select revision,created_at,action,content from dealer_pilot.publications
              where site_slug=v.site_slug and vehicle_id=v.id order by revision desc limit 30) h
      ),'[]'::jsonb)) order by v.created_at,v.id)
    from dealer_pilot.vehicles v left join dealer_pilot.publications p
      on (p.site_slug,p.vehicle_id,p.revision)=(v.site_slug,v.id,v.published_revision)
    where v.site_slug=s.slug
  ),'[]'::jsonb)) into result from dealer_pilot.sites s where s.slug=site;
  return result;
end $$;

create function dealer_pilot.page_workspace(site text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare result jsonb;
begin
  perform dealer_pilot.require_editor(site,false);
  select jsonb_build_object('slug',s.slug,'brand',s.brand,'version',coalesce(p.version,0),
    'draft',p.draft,'published',dealer_pilot.published_page(s.slug),'publishedRevision',p.published_revision,
    'history',coalesce((
      select jsonb_agg(jsonb_build_object('revision',h.revision,'at',h.created_at,
        'action',h.action,'available',h.content is not null) order by h.revision desc)
      from dealer_pilot.page_publications h where h.site_slug=s.slug
    ),'[]'::jsonb)) into result
  from dealer_pilot.sites s left join dealer_pilot.pages p on p.site_slug=s.slug where s.slug=site;
  return result;
end $$;

create function dealer_pilot.check_page(body jsonb) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare fields constant text[] := array['heading','description','hours','phone','email','address'];
        limits constant int[] := array[80,1000,400,40,254,180];
        -- Match ordinary ECMAScript trim at the heading boundaries. All C0/C1
        -- controls, including tab, are rejected below regardless of position.
        spaces constant text := U&' \00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
        field text; value text; phone text; email text;
begin
  if jsonb_typeof(body) is distinct from 'object' then
    raise exception using errcode='22023', message='INVALID_PAGE';
  end if;
  if not (body ?& fields) or body-fields<>'{}'::jsonb then
    raise exception using errcode='22023', message='INVALID_PAGE';
  end if;
  for i in 1..cardinality(fields) loop
    field := fields[i];
    value := body->>field;
    if jsonb_typeof(body->field)<>'string' or char_length(value)>limits[i] then
      raise exception using errcode='22023', message='INVALID_PAGE';
    end if;
    if field in ('description','hours','address') then value := replace(value,chr(10),''); end if;
    if (value collate "C") ~ U&'[\0001-\001F\007F-\009F]' then
      raise exception using errcode='22023', message='INVALID_PAGE';
    end if;
  end loop;
  email := body->>'email';
  phone := body->>'phone';
  if body->>'heading'='' or btrim(body->>'heading',spaces)<>body->>'heading'
      or (phone<>'' and ((phone collate "C") !~ '^[+]?[0-9 ().-]+$'
        or char_length(regexp_replace(phone collate "C",'[^0-9]','','g')) not between 3 and 20))
      or (email<>'' and (email collate "C") !~
        '^[A-Za-z0-9_+-]+([.][A-Za-z0-9_+-]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$') then
    raise exception using errcode='22023', message='INVALID_PAGE';
  end if;
end $$;

create function dealer_pilot.page_edit(site text, expected integer, op text, body jsonb, target integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare current_row dealer_pilot.pages%rowtype; current_version integer;
        next_version integer; next_content jsonb;
begin
  -- This site lock covers the first save too, when there is no page row to lock.
  perform dealer_pilot.require_editor(site,true);
  if expected is null or expected<0 or op is null or op not in ('save','publish','restore')
     or (op='save' and target is not null)
     or (op='publish' and (body is not null or target is not null))
     or (op='restore' and (body is not null or target is null or target<0)) then
    raise exception using errcode='22023', message='INVALID_PAGE_ACTION';
  end if;
  select * into current_row from dealer_pilot.pages where site_slug=site for update;
  current_version := coalesce(current_row.version,0);
  if expected<>current_version or (expected=0 and op<>'save') then
    raise exception using errcode='40001', message='PAGE_VERSION_CONFLICT';
  end if;
  next_version := current_version+1;
  if op='save' then
    perform dealer_pilot.check_page(body);
    insert into dealer_pilot.pages(site_slug,version,draft) values(site,next_version,body)
    on conflict (site_slug) do update set version=excluded.version, draft=excluded.draft;
  else
    if op='publish' then
      next_content := current_row.draft;
    elsif target>0 then
      select content into next_content from dealer_pilot.page_publications
      where site_slug=site and revision=target;
      if not found then raise exception using errcode='22023', message='INVALID_RESTORE_REVISION'; end if;
    end if;
    insert into dealer_pilot.page_publications(site_slug,revision,action,content,actor)
    values(site,next_version,op,next_content,auth.uid());
    update dealer_pilot.pages set version=next_version, draft=coalesce(next_content,current_row.draft),
      published_revision=case when next_content is not null then next_version end where site_slug=site;
    delete from dealer_pilot.page_publications where site_slug=site and revision in (
      select h.revision from dealer_pilot.page_publications h
      where h.site_slug=site order by h.revision desc offset 30
    );
  end if;
  return jsonb_build_object('version',next_version);
end $$;

create function dealer_pilot.check_content(site text, body jsonb)
returns void language plpgsql set search_path = pg_catalog, pg_temp as $$
declare fields constant text[] := array['name','price','year','mileage','fuel','sold','photos'];
        photo_count integer;
begin
  if (jsonb_typeof(body)='object' and octet_length(body::text)<=4096 and body ?& fields
      and body-fields='{}'::jsonb and jsonb_typeof(body->'name')='string'
      and char_length(body->>'name') between 1 and 80 and btrim(body->>'name')=body->>'name'
      and (body->>'name') !~ '[[:cntrl:]]' and jsonb_typeof(body->'price')='number'
      and (body->>'price') ~ '^(0|[1-9][0-9]{0,7})$' and jsonb_typeof(body->'year')='number'
      and (body->>'year') ~ '^[0-9]{4}$' and jsonb_typeof(body->'mileage')='number'
      and (body->>'mileage') ~ '^(0|[1-9][0-9]{0,6})$'
      and body->>'fuel' in ('El','Hybrid','Bensin','Diesel')
      and jsonb_typeof(body->'sold')='boolean' and jsonb_typeof(body->'photos')='array'
     ) is not true then
    raise exception using errcode='22023', message='INVALID_VEHICLE';
  end if;
  photo_count := jsonb_array_length(body->'photos');
  if (body->>'year')::int not between 1886 and 2100 or photo_count not between 1 and 3 then
    raise exception using errcode='22023', message='INVALID_VEHICLE';
  end if;
  if (select count(distinct p.hash) from jsonb_array_elements_text(body->'photos') img(hash)
      join dealer_pilot.photos p on p.hash=img.hash and p.site_slug=site) <> photo_count then
    raise exception using errcode='22023', message='INVALID_VEHICLE_PHOTOS';
  end if;
end $$;

create function dealer_pilot.put_photo(site text, encoded text) returns text
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare raw bytea; digest text; size integer;
begin
  perform dealer_pilot.require_editor(site,true);
  if encoded is null or octet_length(encoded) not between 28 and 240000
     or encoded !~ '^[a-zA-Z0-9+/]*={0,2}$' or length(encoded)%4<>0 then
    raise exception using errcode='22023', message='INVALID_PHOTO';
  end if;
  raw := decode(encoded,'base64');
  size := octet_length(raw);
  -- The server fully decodes, resizes and strips metadata before this call. Reject
  -- non-WebP directly at the RPC too; never serve an untrusted client MIME type.
  if size not between 20 and 180000 or substring(raw from 1 for 4)<>decode('52494646','hex')
     or substring(raw from 9 for 4)<>decode('57454250','hex')
     or substring(raw from 13 for 4) not in (decode('56503820','hex'),decode('5650384c','hex'),decode('56503858','hex'))
     or get_byte(raw,7)<>0 or size-8<>get_byte(raw,4)+256*get_byte(raw,5)+65536*get_byte(raw,6) then
    raise exception using errcode='22023', message='INVALID_PHOTO';
  end if;
  digest := encode(sha256(raw),'hex');
  if exists(select from dealer_pilot.photos p where p.site_slug=site and p.hash=digest) then return digest; end if;
  -- 150 immutable, normalized photos per demo site; at most 27 MB of file bytes.
  if (select count(*) from dealer_pilot.photos where site_slug=site)>=150 then
    raise exception using errcode='22023', message='PHOTO_QUOTA';
  end if;
  insert into dealer_pilot.photos values(site,digest,raw);
  return digest;
end $$;

create function dealer_pilot.photo(site text, digest text, preview boolean) returns text
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare result text;
begin
  if preview is null then raise exception using errcode='22023', message='MISSING_PHOTO_MODE'; end if;
  if preview then perform dealer_pilot.require_editor(site,false); end if;
  select replace(encode(i.bytes,'base64'),chr(10),'') into result from dealer_pilot.photos i
  where i.site_slug=site and i.hash=digest and (preview or exists(
    select from dealer_pilot.vehicles v join dealer_pilot.publications p
      on (p.site_slug,p.vehicle_id,p.revision)=(v.site_slug,v.id,v.published_revision)
    where v.site_slug=i.site_slug and (p.content->'photos') ? i.hash
  ));
  if not found then raise exception using errcode='P0002', message='PHOTO_NOT_FOUND'; end if;
  return result;
end $$;

create function dealer_pilot.edit(site text, vehicle uuid, expected integer, op text, body jsonb, target integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare current_row dealer_pilot.vehicles%rowtype; current_version integer;
        next_version integer; next_content jsonb;
begin
  perform dealer_pilot.require_editor(site,true);
  if vehicle is null or expected is null or expected<0 or op is null or op not in ('save','publish','restore')
     or (op='save' and target is not null)
     or (op='publish' and (body is not null or target is not null))
     or (op='restore' and (body is not null or target is null or target<0)) then
    raise exception using errcode='22023', message='INVALID_VEHICLE_ACTION';
  end if;
  select * into current_row from dealer_pilot.vehicles where site_slug=site and id=vehicle;
  current_version := coalesce(current_row.version,0);
  if expected<>current_version or (expected=0 and op<>'save') then
    raise exception using errcode='40001', message='VEHICLE_VERSION_CONFLICT';
  end if;
  next_version := current_version+1;
  if op='save' then
    perform dealer_pilot.check_content(site,body);
    if current_version=0 then
      if (select count(*) from dealer_pilot.vehicles where site_slug=site)>=40 then
        raise exception using errcode='22023', message='VEHICLE_QUOTA';
      end if;
      insert into dealer_pilot.vehicles(site_slug,id,version,draft) values(site,vehicle,next_version,body);
    else
      update dealer_pilot.vehicles set version=next_version,draft=body where site_slug=site and id=vehicle;
    end if;
  else
    if op='publish' then
      next_content := current_row.draft;
    elsif target>0 then
      select content into next_content from dealer_pilot.publications
      where site_slug=site and vehicle_id=vehicle and revision=target;
      if not found then raise exception using errcode='22023', message='INVALID_RESTORE_REVISION'; end if;
    end if;
    insert into dealer_pilot.publications(site_slug,vehicle_id,revision,action,content,actor)
    values(site,vehicle,next_version,op,next_content,auth.uid());
    update dealer_pilot.vehicles set version=next_version,
      draft=coalesce(next_content,current_row.draft),
      published_revision=case when next_content is null then null else next_version end
    where site_slug=site and id=vehicle;
    -- Keep the 30 most recent publications, including restores/withdrawals. At
    -- 40 cars per site this also bounds the retained historical document bytes.
    delete from dealer_pilot.publications
    where site_slug=site and vehicle_id=vehicle and revision in (
      select p.revision from dealer_pilot.publications p
      where p.site_slug=site and p.vehicle_id=vehicle order by p.revision desc offset 30
    );
  end if;
  return jsonb_build_object('id',vehicle,'version',next_version);
end $$;

create function dealer_pilot.save(site text, vehicle uuid, expected integer, body jsonb, uploads text[])
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare upload text; digest text;
begin
  perform dealer_pilot.require_editor(site,true);
  if uploads is null or cardinality(uploads)>3 or coalesce(array_ndims(uploads),1)<>1 then
    raise exception using errcode='22023', message='INVALID_PHOTO_UPLOADS';
  end if;
  foreach upload in array uploads loop
    digest := dealer_pilot.put_photo(site,upload);
    if ((body->'photos') ? digest) is not true then
      raise exception using errcode='22023', message='UNREFERENCED_PHOTO_UPLOAD';
    end if;
  end loop;
  -- Uploaded photos and saved draft commit together, or both roll back (including
  -- validation, a stale version, quota errors, and errors on the last upload).
  return dealer_pilot.edit(site,vehicle,expected,'save',body,null);
end $$;

create function public.dealer_pilot_catalog(p_slug text) returns jsonb
language sql stable security invoker set search_path = pg_catalog, pg_temp
as $$ select dealer_pilot.catalog(p_slug) $$;
create function public.dealer_pilot_workspace(p_slug text) returns jsonb
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select dealer_pilot.workspace(p_slug) $$;
create function public.dealer_pilot_page_workspace(p_slug text) returns jsonb
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select dealer_pilot.page_workspace(p_slug) $$;
create function public.dealer_pilot_page_edit(p_slug text,p_version integer,p_action text,p_content jsonb,p_revision integer)
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select dealer_pilot.page_edit(p_slug,p_version,p_action,p_content,p_revision) $$;
create function public.dealer_pilot_photo(p_slug text,p_hash text,p_preview boolean) returns text
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select dealer_pilot.photo(p_slug,p_hash,p_preview) $$;
create function public.dealer_pilot_put_photo(p_slug text,p_bytes text) returns text
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select dealer_pilot.put_photo(p_slug,p_bytes) $$;
create function public.dealer_pilot_edit(p_slug text,p_vehicle uuid,p_version integer,p_action text,p_content jsonb,p_revision integer)
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select dealer_pilot.edit(p_slug,p_vehicle,p_version,p_action,p_content,p_revision) $$;
create function public.dealer_pilot_save(p_slug text,p_vehicle uuid,p_version integer,p_content jsonb,p_uploads text[])
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select dealer_pilot.save(p_slug,p_vehicle,p_version,p_content,p_uploads) $$;

revoke all on all functions in schema dealer_pilot from public, anon, authenticated;
revoke all on function public.dealer_pilot_catalog(text),public.dealer_pilot_workspace(text),
  public.dealer_pilot_page_workspace(text),public.dealer_pilot_page_edit(text,integer,text,jsonb,integer),
  public.dealer_pilot_photo(text,text,boolean),public.dealer_pilot_put_photo(text,text),
  public.dealer_pilot_edit(text,uuid,integer,text,jsonb,integer),public.dealer_pilot_save(text,uuid,integer,jsonb,text[])
  from public, anon, authenticated;
grant execute on function dealer_pilot.catalog(text),dealer_pilot.photo(text,text,boolean),
  public.dealer_pilot_catalog(text),public.dealer_pilot_photo(text,text,boolean) to anon,authenticated;
grant execute on function dealer_pilot.workspace(text),dealer_pilot.put_photo(text,text),
  dealer_pilot.page_workspace(text),dealer_pilot.page_edit(text,integer,text,jsonb,integer),
  public.dealer_pilot_page_workspace(text),public.dealer_pilot_page_edit(text,integer,text,jsonb,integer),
  dealer_pilot.edit(text,uuid,integer,text,jsonb,integer),dealer_pilot.save(text,uuid,integer,jsonb,text[]),
  public.dealer_pilot_workspace(text),public.dealer_pilot_put_photo(text,text),
  public.dealer_pilot_edit(text,uuid,integer,text,jsonb,integer),public.dealer_pilot_save(text,uuid,integer,jsonb,text[])
  to authenticated;
commit;
