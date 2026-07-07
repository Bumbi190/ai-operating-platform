-- ─────────────────────────────────────────────────────────────────────────────
--  PR-2 — Route/webhook-exponering: stäng den enda verifierade cross-tenant-ytan.
--
--  Tre fynd (alla statiskt bekräftade, inget runtime-test krävs):
--   A. comment_replies: `USING(true)` SELECT-policy för authenticated → vilken
--      inloggad användare som helst kunde läsa ALLA projekts kommentarer. + tabellen
--      saknar project_id helt. (pg_policies-scan 2026-06-06 bekräftade läckan.)
--   B. Instagram-webhook: osignerad POST (ingen X-Hub-Signature-256-verifiering) →
--      vem som helst kan injicera comment-events. (Kod-fix, se PR_2_ROUTE_WEBHOOK.md.)
--   C. media/render/status: oautentiserad service-role-write mot godtyckligt scriptId.
--      (Kod-fix: resolva scriptet från render_id, se PR_2_ROUTE_WEBHOOK.md.)
--
--  Denna migration täcker A (schema + policy). B och C är kodändringar i route-lagret.
--
--  Scopning bekräftad mot live-schemat: comment_replies.post_id matchar
--  media_scripts.instagram_media_id (instagram) / media_scripts.facebook_post_id
--  (facebook) → media_scripts.project_id.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) IMMEDIAT LÄCKSTOPP: ta bort den tillåtande authenticated-läspolicyn.
--    (Ersätts av en owner-scopad policy nedan — authenticated kan fortfarande läsa
--     SINA egna projekts rader, bara inte andras.)
drop policy if exists "authenticated_read_comment_replies" on public.comment_replies;

-- 2) STRUKTURELL SCOPNING: ge comment_replies ett projekt.
alter table public.comment_replies
  add column if not exists project_id uuid references public.projects(id) on delete cascade;

create index if not exists idx_comment_replies_project on public.comment_replies (project_id);

-- 3) BACKFILL befintliga rader via post_id → media_scripts → project.
--    Rader som inte matchar någon känd media_script (kommentarer på inlägg vi inte
--    äger) lämnas NULL → osynliga för alla under owner-policyn (4), aldrig läckta.
update public.comment_replies cr
set    project_id = ms.project_id
from   public.media_scripts ms
where  cr.project_id is null
  and  ms.project_id is not null
  and  (
        (cr.platform = 'instagram' and cr.post_id = ms.instagram_media_id)
     or (cr.platform = 'facebook'  and cr.post_id = ms.facebook_post_id)
      );

-- 4) OWNER-SCOPAD läspolicy (samma beprövade mönster som de 23 rena policyserna).
--    NULL-project-rader matchar inte → osynliga för alla authenticated. Läckan stängd.
create policy "comment_replies_owner_read"
  on public.comment_replies for select
  to authenticated
  using (project_id in (select id from public.projects where owner_id = auth.uid()));

-- NOT NULL på project_id DEFERRAS medvetet: kön kan innehålla historiska rader för
-- inlägg utan media_script. När webhooken (PR-2 kod-fix) sätter project_id vid
-- insert och kön har dränerats kan en följdmigration sätta NOT NULL. Tills dess är
-- läckan ändå stängd av owner-policyn ovan.

-- VERIFIERING (read-only, ingen branch behövs):
--   select * from pg_policies where tablename='comment_replies';
--   → ska visa 'comment_replies_owner_read' och INGEN 'USING(true)' för authenticated.
