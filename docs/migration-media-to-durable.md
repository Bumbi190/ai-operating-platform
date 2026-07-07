# Migrationsplan: Media Pipeline → Durable Workflow Engine

**Status:** Designförslag (ingen implementation). Underlag för beslut.
**Mål:** Ett enda exekverings- och spårningslager för allt som händer i Omnira, så att Atlas kan se, förstå och spåra varje körning från ett ställe.

---

## 1. Nuvarande arkitektur (två parallella system)

### A. Durable Workflow Engine (nytt, det vi byggt)
- `runs`-tabellen är exekveringsauktoritet: `pending → running → done/failed`, med `attempts/max_attempts`, `claimed_at`, `lease_until`, `last_error`, `error_history`.
- `public.claim_runs()` claimar pending runs atomiskt (`FOR UPDATE SKIP LOCKED`).
- pg_cron `omnira_runs_drain` (varje minut) → `/api/runs/drain` claimar och kör.
- `omnira_runs_reaper` återställer hängda runs (utgången lease).
- Körningen utförs av `runSteps()` som kör ett **workflow av agent-steg**: varje steg = en agent + `input_template` + `output_key`. Tänkt för **LLM-kedjor**.

### B. Media Pipeline (befintlig, driver The Prompt)
- Sju separata cron-endpoints, var och en skyddad av `CRON_SECRET`:
  `news/cron` (Fetch AI News) → `step1` (Generate Script) → `step2` (Voiceover + bilder) → `step3` (bilder) → `step4` (Render via Remotion Lambda) → `publish` (Instagram/Facebook) → `youtube`.
- **Tillståndsmaskinen lever i domän-tabellerna**, inte i `runs`:
  - `media_news_items.status`: `new → approved → scripted`
  - `media_scripts`: `voice_status`, `video_status`, `status`, `render_id`, `instagram_url`, `youtube_url`, `retry_count`, `publish_failed_reason`.
  - Varje cron pollar rader i ett visst status, gör sitt steg, och uppdaterar raden.
- `logRun()` skriver en **frikopplad sammanfattnings-run** i efterhand (`attempts: 0`, `started ≈ finished`) — enbart för dashboarden "Senaste körningar". Den är **inte** exekveringsauktoritet och var tidigare inte länkad till objektet den gällde.
- Render är **långkörande och extern** (Remotion Lambda, minuter) — startas i step4, och `publish`-cronen pollar render-progress + en `render/complete`-webhook.

### Kärnskillnaden
Durable-motorn kör **agent/LLM-stegkedjor**. Media-pipelinen kör **sidoeffekt-operationer mot externa API:er** (Ideogram, ElevenLabs, Remotion Lambda, Instagram Graph, YouTube) med extern asynkronitet. Motorn saknar idag tre saker som media kräver:
1. **Icke-LLM "action"-steg** (anropa ett externt API deterministiskt).
2. **Långkörande externa steg** med extern slutsignal (render).
3. **Idempotens per steg** så att en retry aldrig dubbelpostar eller dubbeldebiterar.

Därför är detta **inte en strömbrytare** utan en stegvis migration där motorn först utökas, sedan flyttas stegen ett i taget — minst riskfyllt först.

---

## 2. Målarkitektur

- **En exekveringsauktoritet:** `runs` + drain + reaper för ALLT arbete (media, Atlas, framtida kunder/tenants).
- **Typade steg** i `workflows.steps`:
  - `agent` — LLM-steg (finns redan).
  - `action` — anropar en registrerad handler (`fetch_news`, `generate_script`, `generate_voice`, `start_render`, `publish_social`, `publish_youtube`). Deterministisk och idempotent.
  - `await_external` — väntar på extern slutsignal (Lambda-render). Lease-medveten och re-entrant (kan claimas om utan att starta om renderingen).
- **Action-handler-registry:** en mappning `steg-typ → funktion`, så pipeline-logiken återanvänds men körs durabelt.
- **Idempotensnycklar per steg** (t.ex. `publish:{script_id}:{platform}`) → retry är säkert, aldrig dubbelpost.
- **Domänkoppling:** varje run bär `news_item_id`/`script_id` i `input/context`, och `run_id` stämplas på domänraden (påbörjat — se §3). Atlas läser allt från `runs` → ser och spårar allt från ett ställe.
- **Tunna cron-triggers:** cron skapar bara `pending` runs; drainern utför. Inga endpoints med egen exekveringslogik.

---

## 3. Spårbarhet — redan förbättrat nu (litet & säkert)

Implementerat i denna omgång (additivt, defensivt, non-blocking — påverkar aldrig postningen):
- `logRun()` returnerar nu `run_id`.
- `news/cron` stämplar fetch-runens `run_id` på de `media_news_items` den skapar (fyller det `null` vi observerade på Trump-storyn — framåtriktat).
- `step1` stämplar `media_scripts.run_id` med "Generate Script"-runen.

Kvar (kräver liten schema-ändring → del av migrationen, ej gjort nu):
- Per-stegs run-referenser på `media_scripts`: `voice_run_id`, `render_run_id`, `publish_run_id` (idag delar alla stegen en `run_id`-kolumn). Tills dess kan stegkörningar hittas via `runs.context->>'scriptId'`.
- Stämpling i sido-branscherna i `step1` (hermes/fallback) och `autonomous`-flödet.

---

## 4. Migreringssteg (stegvisa, var och en levererbar)

| Steg | Innehåll | Sidoeffekt | Risk |
|------|----------|-----------|------|
| 0 | **Spårbarhet** (run_id på news/scripts) | Nej | ✅ Klart (denna omgång) |
| 1 | **Utöka motorn** med typade steg (`agent`/`action`/`await_external`) + action-handler-registry | Nej (additivt) | Låg |
| 2 | **Idempotensnycklar** på runs/steg (skip-if-exists) | Nej | Låg |
| 3 | Migrera **Fetch AI News** → durable workflow (read-only, säkert att retry:a) | Nej | Låg |
| 4 | Migrera **Generate Script** (LLM; skydda mot dubbletter via `news_item_id`) | Nej (intern) | Låg–medel |
| 5 | Migrera **Voiceover + bilder** (externa API, kostar pengar → idempotens: hoppa om `audio_url` finns) | Ja (kostnad) | Medel |
| 6 | Migrera **Render Video** som `await_external` (Lambda; lease-förnyelse + `render/complete`-callback) | Ja (kostnad) | Hög |
| 7 | Migrera **Publish to Social + YouTube** SIST (oåterkalleliga inlägg; stark idempotens per `script+plattform`; shadow/dry-run först) | Ja (publikt) | Högst |
| 8 | **Avveckla** per-stegs-cron + `logRun`-sammanfattningar; behåll tunna triggers som bara köar `pending` runs | — | Medel |

**Förkrav:** Ingen sidoeffekt-tung stage (5–7) får migreras innan steg 1–2 (typade steg + idempotens) är på plats.

---

## 5. Risker och motåtgärder

- **Dubbelpostning / dubbeldebitering vid retry** → idempotensnycklar + "skip-if-exists"-guards (t.ex. publicera inte om `instagram_url` redan finns).
- **Render-tid vs lease/maxDuration** → `await_external`-stegtyp, lease-förnyelse, slutsignal via `render/complete`-callback i stället för att hålla en invocation öppen.
- **Två system parallellt under migration** → exakt ETT system äger en given stage åt gången, styrt av feature-flag per stage + per projekt. Aldrig överlapp.
- **Live intäkts-/varumärkespåverkan** (The Prompt postar publikt) → migrera read-only-steg först, publicering sist, shadow-läge innan skarp drift.
- **Drain-throughput** → media-renders är tunga; trimma `CLAIM_LIMIT`/lease, ev. separat drain-kö för tunga steg.
- **Historisk spårbarhet** → framåtriktat; gamla rader (t.ex. Trump-storyn) backfillas inte. Acceptabelt.

---

## 6. Rekommendation: vad migreras först

1. **Förkrav (steg 1–2):** utöka durable-motorn med typade steg + idempotens. Detta är grinden — gör inget annat först.
2. **Fetch AI News (steg 3)** som första riktiga migration: read-only, idempotent, noll varumärkesrisk. Bevisar motorn end-to-end (pending → drain → running → done) med ett verkligt media-steg.
3. **Generate Script (steg 4)** därefter: inkapslat LLM-steg.
4. **Publicering (steg 7) sist**, med shadow-läge och idempotens, eftersom inläggen är oåterkalleliga.

På så vis rör vi den intäktsdrivande, publika delen av pipelinen allra sist — och varje steg är verifierbart i Activity Center innan nästa påbörjas.
