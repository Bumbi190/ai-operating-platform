-- Fas 4a: dimensioner för innehållsanalys på media_scripts.
-- topic sätts vid skapande av classifyTopic() (lib/atlas/content-tags.ts).
-- format konstant 'reel' tills fler format introduceras.
alter table public.media_scripts add column if not exists topic  text;
alter table public.media_scripts add column if not exists format text default 'reel';
