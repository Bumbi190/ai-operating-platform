create or replace function public.social_schedule_review_current(b public.social_schedule_batches) returns boolean language plpgsql stable security invoker set search_path='' as $fn$
declare item jsonb;
begin
 for item in select value from jsonb_array_elements(b.manifest->'items') loop perform public.social_schedule_item_guard(b.project_id,item);end loop;
 return true;
exception when others then return false;
end $fn$;
create or replace function public.social_schedule_review_items(b public.social_schedule_batches) returns jsonb language sql stable security invoker set search_path='' as $fn$
 select coalesce(jsonb_agg(jsonb_build_object('item',mi.value,'revision',case when c.id is null then null else public.social_schedule_revision(c) end) order by mi.ord),'[]')
 from jsonb_array_elements(b.manifest->'items') with ordinality mi(value,ord)
 left join public.social_content_revisions c on c.id=(mi.value->>'revisionId')::uuid and c.post_id=(mi.value->>'postId')::uuid and c.project_id=b.project_id and c.sha256=mi.value->>'sha256';
$fn$;
create or replace function public.social_schedule_batch_view(b public.social_schedule_batches) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare a public.social_schedule_decisions;jobs jsonb;revoked boolean;
begin
 select * into a from public.social_schedule_decisions where batch_revision_id=b.id and project_id=b.project_id and action='approve';
 revoked=exists(select 1 from public.social_schedule_decisions where approval_id=a.id and action='revoke');
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'batchId',b.batch_id,'postId',j.post_id,'channel',j.channel,'state',j.state,'scheduledAt',j.scheduled_at,'expiresAt',j.expires_at,'publicationId',j.publication_id,'reason',j.reason,'version',j.version,'permalink',p.permalink,'publicationState',p.state) order by j.scheduled_at,j.channel),'[]') into jobs from public.social_schedule_jobs j left join public.social_publications p on p.id=j.publication_id and p.project_id=j.project_id where j.batch_revision_id=b.id and j.project_id=b.project_id;
 return jsonb_build_object('projectId',b.project_id,'batchId',b.batch_id,'revisionId',b.id,'sha256',b.sha256,'status',case when revoked then 'revoked' when a.id is not null then 'approved' else 'proposal' end,'manifest',b.manifest,'review',public.social_schedule_review_items(b),'reviewCurrent',public.social_schedule_review_current(b),'approval',case when a.id is null then null else jsonb_build_object('id',a.id,'approvedBy',a.actor,'approvedAt',a.created_at) end,'jobs',jobs,'version',1+(select count(*) from public.social_schedule_decisions where batch_revision_id=b.id));
end $fn$;
revoke all on function public.social_schedule_review_items(public.social_schedule_batches),public.social_schedule_batch_view(public.social_schedule_batches) from public,anon,authenticated;
grant execute on function public.social_schedule_review_items(public.social_schedule_batches),public.social_schedule_batch_view(public.social_schedule_batches) to service_role;

revoke all on function public.social_schedule_review_current(public.social_schedule_batches) from public,anon,authenticated;grant execute on function public.social_schedule_review_current(public.social_schedule_batches) to service_role;
