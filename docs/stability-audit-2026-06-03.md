# Stabilitetsrevision — Omnira / Atlas

**Datum:** 2026-06-03 · **Status:** Analys (ingen implementation). Underlag för prioritering innan fler funktioner byggs.

Bedömningsskala per svaghet: **Risk för driftstopp × Verksamhetspåverkan × Sannolikhet**.

---

## 1. Workflows

### Durable Workflow Engine (runs + drain + reaper)
- **Fungerar:** verifierat denna vecka. pending → claim (SKIP LOCKED) → running → done/failed, lease-reaper, attempts/max_attempts, error_history.
- **Observability:** bra (Activity Center + Operations Center + Atlas live-kontext).
- **Retries:** ja (attempts/max_attempts).
- **Notifieringar:** ⚠️ saknas — en run som går till `failed` skickar inget mail. Syns bara i UI.
- **SPOF:** drain-endpointen + pg_cron-triggern (se §2).

### Media Pipeline (news → step1 → step2 → step3 → step4 → publish → youtube)
- **Fungerar:** verifierat end-to-end live idag (Instagram + YouTube autonomt).
- **Observability:** bra på de stegen — alla anropar `logRun` (syns i Operations Center).
- **Retries:** ojämnt. step4 (render-poll) och publish (retry_count + IG creation_id-återbruk) har retries. **step1/step2/step3 har INGA retries** — om scriptgenerering, voiceover eller render-start fallerar väntar innehållet till nästa 12-timmarscykel.
- **Notifieringar:** publish/step4/youtube larmar. **step1/step2/step3 + news/cron larmar inte** — tyst fel.
- **Separat system:** kör inte via durable-motorn (känd, accepterad parallellitet — migrationsplan finns).

### Durable workflow-rader (Familje-Stunden m.fl.)
- **Experimentellt:** flera workflow-rader är tomma skal (0 steg) eller kräver manuell input. Bara Familje-Stundens månadspaket-workflows är reellt körbara.

---

## 2. Cron-jobb (25 aktiva)

**Fungerar & övervakas:** runs_drain, runs_reaper (varje min); news/step1-4/publish/youtube (loggar via logRun).

**Saknar observability (ingen logRun, syns inte i Atlas/Operations):** insights, reply-comments, competitors, account-snapshot, morning-briefing, briefing/cron, warmup. Om dessa slutar fungera märks det inte.

**Experimentella / instabila:**
- `reply-comments` (var 2:e min) — beror på Hermes-scraping som returnerar 500 (`/scrape returned 500`). Hög frekvens + extern flakighet.
- `warmup` — har timeoutat (504).
- `competitors`, `account-snapshot`, `insights` — externberoende, otestade i denna revision.

**Redundans/oklarhet:** `omnira_morning_briefing` (06:00 → /api/media/cron/morning-briefing) och `omnira_briefing_morning` (06:30 → /api/briefing/cron) ser ut att överlappa — värt att reda ut.

**SPOF — den enskilt största systemrisken:** *alla* cron-jobb triggar via `omnira_cron.call_vercel(...)` (pg_net → Vercel). Går pg_net, base_url-konfigen eller `CRON_SECRET` sönder stannar **hela** automationen samtidigt — och inget övervakar att cron-jobben faktiskt fyrar. `cron.job_run_details` finns men ytas inte i UI/Atlas.

---

## 3. Atlas-verktyg

| Verktyg | Status | Observability | Retry | Notis |
|---------|--------|---------------|-------|-------|
| run_media_step | Fungerar (verifierat) | run_id + Operations | via underliggande cron | via publish/step4 |
| trigger_workflow | Fungerar (durabelt) | Activity Center | drain/attempts | ⚠️ ingen |
| get_run_status | Fungerar | — | — | — |
| list_workflows | Fungerar | — | — | — |
| ask_manager | Fungerar | agent_messages | ingen | ingen |
| delegate | Fungerar | manager_tasks/Activity | ingen | ingen |

- **Ärlighetsspärr + tvingad routning:** på plats (Atlas kan inte längre påstå åtgärder utan verktygsanrop).
- **Svaghet:** `ask_manager`/`delegate` saknar retry och felnotis — om de fallerar syns det bara i chatten.

---

## 4. Externa integrationer

| Integration | Roll | Fungerar | Retry | Notis | SPOF-risk |
|-------------|------|----------|-------|-------|-----------|
| **Supabase** (DB + pg_cron + pg_net) | Allt | Ja | — | nej | **Total SPOF** — allt stannar om nere |
| **Vercel** | Hosting + cron-mottagare | Ja | — | nej | Hög — single app/region |
| **Anthropic (Claude)** | Chat, agenter, script | Ja | SDK-nivå | nej | Hög — en API-nyckel |
| **OpenAI TTS** | Atlas röst (Onyx) | Ja | nej | nej | Medel |
| **ElevenLabs** | Voiceover (step2) | Ja | nej | via pipeline | Medel |
| **Ideogram** | Bilder (step3) | Ja | nej | via pipeline | Medel |
| **Remotion Lambda** | Videorendering | Ja (verifierat) | poll-retry (step4) | step4-larm | Hög — single region eu-north-1 |
| **Instagram Graph** | Publicering | Ja (verifierat) | retry_count | ja | Hög — single token |
| **Facebook Graph** | Publicering | Nyss fixad | retry (via publish) | ja | Medel |
| **YouTube API** | Publicering | Ja (verifierat) | — | ja | Hög — kvot ~6 upp/dag + single token |
| **Hermes** (news-scrape/trends) | Nyhetsinhämtning | ⚠️ Instabil (500/DOWN) | fallback finns | nej | Medel — degraderar nyhetskvalitet |
| **Stripe** | Intäkt Familje | Ej inkopplat | — | — | — (placeholder) |
| **Web Speech API** (STT) | Röst-input | Instabil (browser) | watchdog | nej | Låg påverkan |

**Token-hantering (återkommande risk):** IG/FB/YouTube har *ett* token vardera. `refresh-tokens` körs bara **månadsvis** (1:a kl 06:00). Vi träffade redan ett dött IG-token denna vecka. Inget proaktivt larm när ett token närmar sig utgång → publicering kan dö tyst mellan refresh-körningar.

---

## Prioriterade svagheter (störst risk först)

**1. Token-utgång (IG/FB/YouTube) — HÖGST.**
Sannolikhet hög (tokens går ut; refresh bara månadsvis; redan inträffat), påverkan hög (publicering = verksamhetens output stannar), observability låg. *Single token per kanal = SPOF.*
→ Förslag: proaktiv token-giltighetskoll + larm dagar innan utgång; tätare/självläkande refresh.

**2. pg_cron → call_vercel som enda trigger-väg — HÖG.**
Påverkan mycket hög (all automation stannar samtidigt), observability noll (ingen ser om cron slutar fyra). Sannolikhet låg–medel.
→ Förslag: en "heartbeat"-koll som larmar om förväntade cron-jobb inte kört (jämför mot `cron.job_run_details`).

**3. Content-stegen (step1–3) saknar retries OCH larm — HÖG.**
Sannolikhet medel (LLM/Ideogram/ElevenLabs-hicka, Hermes-flakighet), påverkan medel (en dags innehåll uteblir, återhämtar sig nästa cykel), observability låg.
→ Förslag: retry + felnotis på step1–3, eller migrera dem till durable-motorn (retries gratis).

**4. Supabase total SPOF — HÖG påverkan, låg sannolikhet.**
Hanterad tjänst men allt hänger på den.
→ Förslag: säkerställ PITR/backuper + extern uptime-monitor.

**5. Osynliga cron-jobb (insights, reply-comments, competitors, briefings, warmup, account-snapshot) — MEDEL.**
Ingen logRun/larm → tyst fel. reply-comments + warmup är redan instabila.
→ Förslag: logRun + larm på alla cron-jobb; pausa/fixa Hermes-beroende warmup/reply-comments.

**6. Durable runs + Atlas-verktyg saknar felnotis — MEDEL.**
En failed run eller ett misslyckat delegate syns bara i UI.
→ Förslag: larm vid run→failed.

**7. Remotion Lambda single region — MEDEL.** Inget fallback om eu-north-1 strular.

**8. Voice STT (Web Speech) — LÅG.** Convenience, inte produktionsoutput. Server-STT-migration sedan tidigare flaggad.

---

## Sammanfattning

Kärnflödet (durable engine + media-pipeline + publicering) är **verifierat och fungerar**. De största kvarvarande svagheterna är inte i koden som kör — de är i **kringliggande motståndskraft**: token-utgång, en enda trigger-väg för all automation, och content-steg utan retry/larm. Ingen av dessa kräver nya funktioner att åtgärda — de kräver härdning av det befintliga. Rekommenderad ordning innan fler features: **#1 token-larm → #3 retry+larm på step1–3 → #2 cron-heartbeat → #5 observability på resten.**
