# The Prompt – editorial quality pilot (2026-10-17)

**Owner feedback:** Creative lab previews rejected as too basic; The Prompt targets an English-speaking audience. Keep the currently working **two ordinary daily news releases at 10:00 and 20:00 Europe/Stockholm** while the new design is reviewed. Do not connect the new creative lab to automatic publishing, and do not reuse the Swedish creative ad preset.

## Verified production findings (read-only)

- Real Supabase project `AI Operating Platform` has The Prompt / `ai-media-automation` and 282 records with `status=published` since May 25; 58 in the prior 30 days. Publisher destinations presently include Instagram/Facebook and older YouTube paths.
- `media_insights` stores **one historical snapshot per video/platform**. Latest collection 2026-10-16. Snapshot totals (different ages, not fair 24h comparisons): Instagram 11,804 views over 280 videos (~42/video); Facebook 66,447 over 274 (~243/video); YouTube 7,959 over 168 (~47/video). This is evidence of low engagement, not proof of one specific algorithmic cause. Instagram has very sparse positive engagement in these snapshots.
- On 2026-10-17 the morning script was created 07:20 UTC, voice ready 07:25, render started 07:30 UTC (`video_status=rendering` at 09:38 Stockholm), with the existing step4/publish schedule at 07:45/08:00 UTC.
- `cron.job` includes `omnira_step1_morning` at 07:20 UTC, step2 07:25, step3 07:30, step4 07:45 and publish 08:00. Evening equivalent is 17:20/17:25/17:30/17:45/18:00 UTC. **Important DST issue:** after Sweden's switch from CEST to CET on 2026-10-25, fixed 08:00/18:00 UTC triggers would correspond to **09:00/19:00** Sweden, not intended 10:00/20:00. Correct this in a separate reviewed scheduling patch with explicit Europe/Stockholm handling; do not hot-edit active crons in this preview PR.
- Current production auto videos are generated using `SimpleNewsReel` with voice and mainly a small set of AI-generated still images, cross-fades and Ken Burns zoom. It is **not** the independent `ThePromptContentLab` concept (which showed Swedish marketing copy and generic geometry, no integrated voice); do not confuse their publish statuses.
- Quality grading today largely checks the script (not a human-reviewed finished video); the current `quality.ts` returns permissive scores on parse error. A true visual/editorial delivery gate should be evaluated separately without silently blocking today's two daily posts.

## Implemented in draft creative lab only

Branch `codex/the-prompt-creative-v2-20261017` from main, changes only to Remotion creative preview:

- New `ThePromptEditorialLab.tsx` 9:16, 12 seconds, four animated beats: **signal / context / impact / follow**. English-only on-screen copy. Distinct vertical typographic hierarchy, progress marker, staggered scene movement, dynamic information cards, safe-area footer with mandatory `CONCEPT PREVIEW / NOT FOR POSTING`.
- `headline`, `context`, `takeaway`, `sourceName`, and up to three already-approved image URLs passed as props. A blank demo has generic **concept copy**, not fabricated or verified news. No model API, social account, publishing route, provider payments or credentials called.
- `ThePromptContentLab` now points to the English experimental composition. `FamiljeStundenContentLab` and both production compositions (`SimpleNewsReel`, `ShortFormVideo`) remain wired as before.
- Visual QA: real Remotion Chrome renders of frames 35, 135, 225, and 323 passed, stored ONLY in the local worktree `apps/remotion/.qa-output/` (not committed or posted). Targeted TypeScript for the new composition passes. `node tests/editorial-lab-contract.mjs` passes and verifies preview is isolated from release.
- The remotion application's **full TypeScript compile is historically red for unrelated files** (webcodecs conflicting types, Root default prop interface, old SubtitleTrack and render.ts types). Those existing errors must not be described as introduced or fixed by this prototype. Targeted component check passes.

## Definition of a video good enough to show the owner

1. **Fact-checked real news, actual visuals:** 2–4 story-specific, licensed/approved images or actual demonstrable screenshots, not generic fake UI/news graphics. Pass correct image rights, source attribution, and fact verification.
2. **English throughout:** native-sounding English voiceover, captions verified against the voice, full spelling/semantic review of headlines and final CTA, no Swedish words in post-facing content.
3. **Engagement-focused editing:** promise/payoff in the first 1–2 seconds, rapid explanatory context, visually differentiated beats with meaningful movement or cuts (not 3 near-static panels). No exaggerated / unsupported claims. Real motion graphics and legible 9:16 mobile safe areas.
4. **Editorial QA:** inspect real full video with sound and captions, not just stills; check visual/audio mix, hook, facts, pacing and readability; **explicit owner approval required** for new creative pilot. The concept as committed is not approvable yet; it is a technical starting point only.
5. **Measurement:** leave 10/20 schedule fixed and compare outcomes for creative variants after equal 24h/72h observation windows, using views, watch/retention where obtainable, saves, shares, comments, profile visits and followers gained. Keep a content ledger containing version/format/hook/topic/timestamp/account and original source. Do not change the production flow until the creative and billing gates pass.

## Next isolated implementation

Create a production-adjacent **preview-only v2 news composition** that consumes genuine selected `media_scripts` story fields plus licensed images/voice and validated captions, then generate two reviewed examples for A/B evaluation. After approval, gate release by existing project credentials, immutable exact output, publish idempotency and budget controls. Review and correct the DST scheduling separately **before Oct 25** so actual Swedish wall-clock times remain 10:00/20:00.

**No current production video re-render, autopublish, cron, database writes, new channel tokens, bills or Familje-Stunden creative changes are part of this branch.**


## 17 oktober 2026 – använder tidigare publicerade videor som faktaunderlag

**Läst direkt från produktion med SELECT; inga befintliga inlägg eller insights har ändrats.** Allt nedan är historiska observationer, inte garanterade publikreaktioner på framtida filmer.

**Datatäckning:** 282 publicerade The Prompt-videor sedan 25 maj, 58 under senaste 30 dagarna. Den 17 oktober innehåller `media_insights` 283 Instagram-rader, 277 Facebook-rader och 171 YouTube-rader. Varje kombination video/plattform innehåller just nu **en senaste snapshot**, inte upprepade snapshotserier. Videoåldern vid mätningen varierar kraftigt. Senaste 30 dagarnas publicerade klipp (58 per plattform) hade ungefär följande medianvisningar vid respektive snapshots: Instagram 11, Facebook 217,5 och YouTube 25,5. Instagram har i det befintliga materialet **ingen giltig tittarretention**; Facebook har ingen heller. YouTube hade 151 positiva `avg_view_pct`-värden bland 171 rader, med median `56,4%` bland dem. Noll/noll-liknande retention i dessa gamla mätvärden behandlas som **okänd**, inte som ett faktiskt 0%-betyg. Följarökning per video saknas fortfarande i alla tre kanalernas äldre snapshots.

**Ämneshypoteser, Instagram senaste 60 dagar (olika observationsåldrar, jämför ej kausalt):**
- AI business: 9 videor, median 54 visningar
- AI coding/dev tools: 12 videor, median 42
- AI model releases: 21 videor, median 23
- AI regulation: 34 videor, median 17
- AI research: 16 videor, median 14

Det är **endast en prioriteringshypotes**, eftersom videorna inte har jämförbar ålder, konstanta postningstider, format eller distributionsförutsättningar. AI coding och praktiska AI-business-konsekvenser är bra **kandidater** att prova, inte verifierade vinnare. Samma ämne kan ge olika reaktioner på olika plattformar.

**Genomfört analysarbete i draft PR #377:** `apps/remotion/src/lib/editorial-evidence.ts` bygger en framtida, återanvändbar **ren funktion** `evaluateHistoricalPosts` för redan behörigt lästa rader. Den deduplicerar på (plattform, scriptId) med senaste `fetchedAt`; vägrar felaktiga/missing views och orimliga datum; skiljer plattform, ämne, kreativ variant och age-cohort `0–24h / 24–72h / 3–7d / 7–30d / 30d+`; visar median, p75, visningar och *bara tillgängliga* reaktions-/retentionsmått. Små grupper under åtta videor är explicit `exploratory`. Större grupper är `comparison_ready` **deskriptivt**, inte statistiskt orsakssamband. Inga inloggnings-, provider-, write-, cron- eller modell-anrop är kopplade; den här första datamotorn **är inte ännu aktiverad i Atlas-produktionen**.

**Tester:** `apps/remotion/tests/editorial-evidence.test.ts` med 6 körbara Node-tester passerar för plattformsgräns, ålderskohort, deduplicering, saknade data, YouTube-retention och olika formatversioner. Riktad TypeScript-check av analys och Remotion-koncept passerar. Remotion-appens fulla befintliga typfel i orelaterade moduler kvarstår.

**Plan för ett ärligt pilotexperiment inom två inlägg per dag:**
1. **10.00 och 20.00 fortsätter som två publiceringar totalt**, inga extra testposter. Ordinarie motor och kontokoppling ska inte ändras förrän ett helt nyhetsvideoprov klarar ägarens kvalitetsgranskning.
2. Kör kreativ variant A med praktiskt verktyg/kodning och variant B med faktagranskad business-impact i två separata engelska nyhetsidéer, men behandla **ämne och klippformat som separata variabler** i det efterföljande utvärderingsupplägget (annars kan vi inte veta vad som gav skillnaden). Lås ämne och publiceringstid när två *klippformat* ska jämföras.
3. Varje publicerad video behöver ett beständigt `creativeVersion`, `topic`, engelsk hook, källa/nyhetsdatum, postningstid i Europe/Stockholm, kanalbinding och de visuella materialens godkännandestatus. Redaktionella video-ID:n får inte väljas om retroaktivt.
4. Inför **riktiga upprepade 24h- och 72h-snapshots per video/plattform**, uppmätta från respektive plattforms faktiska publiceringskvitto. Nuvarande `media_insights` uppdateras som senaste värde och är inte en historisk serie; eventuella DB-/cron-migrationer ska granskas separat och skydda produktionsflödet.
5. Mät visningar, förhållandet delningar/sparade/kommentarer när API faktiskt returnerar dem, genomsnittlig tittarprocent där den finns (för närvarande i huvudsak YouTube), samt profilbesök och nya följare när leverantören tillåter. Att sakna ett mått betyder *okänt*, aldrig noll.
6. För en första begränsad pilot: minst ca 8 klipp per jämförbar grupp för **deskriptiva** signaler och kvalitativ manuell videogranskning. Behåll explicit mänskligt publiceringsgodkännande för ny kreativ variant, utan att stoppa eller dubblera den befintliga 10/20-autopubliceringen.

**Kvar innan detta faktiskt styr Atlas:** Säker projekt- och ägarbunden dataadapter till produktionslagrade `media_scripts` / `media_insights`, verifierad datatäckning, kreativ metadata, upprepade 24h/72h snapshots och ett gransknings-UI som visar osäkerhet. Ingen rekommendationsmotor får automatiskt ändra nyhetsscript eller schema på detta tidiga dataunderlag.


**YouTube observation (separate retention evidence, last 60 days, only positive measured `avg_view_pct`):** business-tagged clips: 9/9 measured, median 71.7%; coding-tagged: 11/12 measured, median 58.4%; model-tagged: 19/21 measured, median 47.4%; regulation-tagged: 32/34 measured, median 60.7%. These are averages of **per-video percentage viewed** that YouTube returned, not second-by-second drop-off curves, and are **not proof of a topic effect**.

**Important data-quality caveat:** spot inspection of existing saved `media_scripts.topic` labels found some semantically inconsistent labels (for example, model announcements and general labor stories tagged `coding`; security incidents tagged `business`). Treat current topic taxonomy as noisy and require a lightweight fact/source + topic-relabel review on pilot examples **before** making content decisions. The chosen creative tests should start with explicitly scoped definitions of `practical-tool-demo` versus `business-impact` and never train an automatic topic chooser from unreviewed tags.
