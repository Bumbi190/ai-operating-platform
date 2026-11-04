-- Allow today’s owner-triggered SCB Preview candidates to coexist with the
-- historical 2026-10-27 reviewed snapshot. This migration only broadens the
-- provenance shape; outreach, status, RLS and contactability constraints stay
-- unchanged.

alter table public.hb_lead_candidates
  drop constraint hb_lead_candidates_provenance_check;

alter table public.hb_lead_candidates
  add constraint hb_lead_candidates_provenance_check
  check (
    jsonb_typeof(provenance) = 'object'
    and provenance ?& array['source','review','audit','retrievedAt']
    and provenance - 'source' - 'review' - 'audit' - 'retrievedAt' - 'workplaceCfar' = '{}'::jsonb
    and provenance->>'source' = 'scb_foretagsregistret'
    and provenance->>'review' = 'awaiting_human_review'
    and (
      (
        provenance->>'audit' = 'hb-scb-status-audited-20261028-061729'
        and provenance->>'retrievedAt' = '2026-10-27'
        and not (provenance ? 'workplaceCfar')
      )
      or
      (
        provenance->>'audit' = 'hb-scb-live-preview-v1'
        and provenance->>'retrievedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and provenance->>'workplaceCfar' ~ '^[0-9]{1,20}$'
      )
    )
  ) not valid;

alter table public.hb_lead_candidates
  validate constraint hb_lead_candidates_provenance_check;
