-- Preserve history while freeing only cancelled, never-published reservations.
-- A receipt (including unknown outcomes) permanently reserves the content revision.
alter table public.social_schedule_jobs
 drop constraint social_schedule_jobs_project_id_post_id_revision_id_key;
create unique index social_schedule_jobs_reserved_content
 on public.social_schedule_jobs(project_id,post_id,revision_id)
 where state<>'cancelled' or publication_id is not null;
