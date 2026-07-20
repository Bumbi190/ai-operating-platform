-- ─────────────────────────────────────────────────────────────────────────────
-- Incident 2026-07-19: The Prompt publicerade varken på Instagram, Facebook
-- eller YouTube. Ett sparat instagram_creation_id återanvändes utan att någon
-- kontrollerade containerns status eller ålder, och per-kanalutfall gick
-- förlorat i ett generiskt 500-svar.
--
-- Denna migration är ADDITIV. Inga kolumner ändras, byter typ eller tas bort.
-- Inga befintliga rader skrivs om. Inga index eller constraints tas bort.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. När skapades containern i instagram_creation_id?
--
--    Verifierat att informationen inte redan finns: media_scripts har inga
--    andra container-relaterade tidsstämplar (updated_at är generisk och skrivs
--    av varje pipeline-steg), och ingen annan tabell lagrar containerns
--    livscykel. Ingen dubbel sanningskälla skapas.
--
--    NULL betyder "okänd ålder" — publish-cronen behandlar då containern som
--    för gammal och skapar en ny. Det är det säkra defaultvärdet och gör att
--    befintliga rader (inklusive de tre väntande scripten) automatiskt får en
--    färsk container i stället för att återanvända en möjligen död.
alter table media_scripts
  add column if not exists instagram_creation_id_at timestamptz;

comment on column media_scripts.instagram_creation_id_at is
  'När instagram_creation_id skapades hos Meta. Används för TTL-kontroll (~24h) '
  'innan en container återanvänds. NULL = okänd ålder → skapa alltid ny container.';

-- 2. Per-kanalstillstånd för observability och återhämtning.
--
--    VIKTIGT — auktoritet: detta fält är INTE sanningskälla för huruvida en
--    kanal har publicerats. Där gäller fortsatt de befintliga id-kolumnerna:
--      instagram_media_id · facebook_post_id · youtube_video_id
--    Idempotensvakterna i publish- och youtube-cronen läser de kolumnerna, inte
--    detta jsonb-fält. publish_channel_state finns för att kunna se VARFÖR en
--    kanal failade (Metas code/subcode/fbtrace_id, permanent vs transient) utan
--    att gräva i Vercel-loggar som roterar bort.
--
--    Fältet innehåller aldrig tokens — allt som skrivs hit passerar
--    redactDeep() i lib/media/meta-errors.ts.
alter table media_scripts
  add column if not exists publish_channel_state jsonb not null default '{}'::jsonb;

comment on column media_scripts.publish_channel_state is
  'Observability per kanal: { instagram: {ok, error, permanent, detail, at}, facebook: {...} }. '
  'INTE auktoritativ för publiceringsstatus — där gäller instagram_media_id / '
  'facebook_post_id / youtube_video_id. Tokenfri (redactDeep).';

-- 3. Index för publiceringskön.
--
--    Kön filtrerar på (status, video_status) och sorterar på generated_at:
--      where video_status='ready' and status='approved' and generated_at >= …
--      order by generated_at asc limit 1
--
--    Ett partiellt index på `where published_at is null` vore FEL efter denna
--    ändring: published_at är inte längre kövakt, och ett script som publicerats
--    på en kanal men väntar på en annan har published_at satt medan det
--    fortfarande ligger i kön. Ett sådant index hade uteslutit precis de rader
--    frågan behöver. Sammansatt index på filterkolumnerna + sorteringen i
--    stället — inga irrelevanta statusar och inga drift-känsliga predikat.
create index if not exists media_scripts_publish_queue_idx
  on media_scripts (status, video_status, generated_at);
