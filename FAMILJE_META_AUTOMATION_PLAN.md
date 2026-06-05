# Familje-Stunden Meta Automation — Kartläggning & plan

**Datum:** 2026-06-05
**Mål:** Hög kvalitet, låg risk. Inget publiceras automatiskt förrän innehåll, bild, karaktärer och brand är verifierade och en människa godkänt.
**Målkedja:** Marketing Engine → Bildgenerator → QA Agent → Brand Agent → Character Consistency Agent → Review Queue → **Publicering först efter godkännande**.

> Grundat i faktisk kod (juni 2026). Alla filsökvägar är relativa till `AI Operating Platform/`.

---

## Översikt: två system som idag inte möts

| System | Vad det gör idag | Tabeller | Slutläge |
|---|---|---|---|
| **Marketing Engine** (text) | Planner → Drafter (LLM-copy) → Brand Guard (deterministisk) → manuell review | `campaign_plans`, `campaign_briefs`, `draft_posts`, `guard_reports`, `approvals` | Stannar vid `approved`. **Ingen bild, ingen publicering.** |
| **Media Publisher** (video) | Cron publicerar **Reels** till IG (+ FB-video) för The Prompt | `media_scripts`, `platform_tokens` | Publicerar autonomt — men **hårdkodad till The Prompt** |

**Slutsats:** Familje saknar idag både (a) bildgenerering kopplad till marknadsutkasten och (b) en projektmedveten bild-publiceringsväg. Reel-publiceraren ska *inte* återanvändas rakt av för Familje — vi bygger en ny bildväg i marketing-pipen.

---

## 1. Nuvarande status för Meta-kopplingen

**Token-infrastruktur (delvis klar):**
- `platform_tokens` är multi-tenant: unik på `(project_id, platform, token_type)` — bra grund.
- `getToken(platform, project?)` (`lib/media/token-store.ts`) stödjer projekt-parameter, men **publiceraren anropar `getToken('instagram')` utan projekt** → faller alltid tillbaka på The Prompt (env).
- Token-refresh (`/api/media/cron/refresh-tokens`) refreshar **bara** The Prompts token.

**Publicering (finns, men fel målgrupp):**
- `/api/media/cron/publish` och `/api/media/publish/instagram` publicerar **endast REELS** (IG) + video (FB). Inga enkla bilder, ingen karusell.
- Skript väljs **utan `project_id`-filter** → Familje-innehåll skulle använda The Prompts konto/token. **Cross-tenant-risk.**

**Marketing-utkast (Familje):**
- Pipen Planner→Drafter→Guard→Review fungerar och är projekt-isolerad (`project_id` = `77cda551…`).
- Den stannar vid `approved`. Det finns **ingen** `/publish`-route för marknadsutkast, ingen `published`/`scheduled`-status på `draft_posts`. Kommentar i koden: *"Ingen publicering/Meta/scheduling."*

**Bildgenerering:**
- `lib/media/ideogram.ts` = Ideogram v3, **text-till-bild endast**. Ingen image2image, **ingen seed, ingen stil-låsning**, byggd för fotojournalistik och instruerad att *undvika ansikten/händer*. Olämplig för konsekventa Nova & Pling.

**Bild-QA:**
- Finns **inte**. `lib/media/quality.ts` poängsätter *manustext* (hook/retention/hallucination) — inte bilder. `lib/media/safeguards.ts` = driftvakter (paus, dagsgräns, retry-tak), inga bildkontroller.

**Karaktärs- & temareferenser:**
- Prosaspec finns: `content/familje-stunden/characters/nova-v2.md`, `pling-v2.md`, `character-rules.md`.
- Maskinläsbart: `characters/index.json` (pekar på kanoniska transparenta PNG:er — **ännu i Google Drive, ej importerade till Supabase Storage**), `themes/index.json` (12 månader, `defined`/`contentGap`-flaggor), `lib/marketing/kb/marketing-canon.ts`.
- **Luckor:** exakta hex-värden för Nova/Pling ej samplade (endast brand `#F652A0`), Pling underspecificerad, **juni-temat `defined:false`**, kanoniska figur-PNG:er ej i repo/Storage.

**Status sammanfattat:** Token-modellen är multi-tenant-redo men inte använd. Ingen bild-QA, ingen karaktärsvalidering på bild, ingen projektmedveten bild-publicering, och bildgeneratorn passar inte figurerna. Marknadsutkasten är isolerade och stannar säkert vid review — bra utgångsläge för att bygga vidare utan publiceringsrisk.

---

## 2. Vad som återstår tekniskt

**A. Plumbing / multi-tenant (förutsättning):**
1. Gör publiceraren projektmedveten: `getToken('instagram', projectId)`, filtrera urval på `project_id`.
2. Lagra Familjes IG/FB-tokens i `platform_tokens`; utöka refresh till alla projekt.
3. Familje IG **Business**-konto + FB-sida, samt Meta app-review (`instagram_content_publish`/`pages_manage_posts`) + business-verifiering. (Externt beroende, lång ledtid — starta tidigt.)

**B. Bildväg (ny):**
4. Beslut om bildstrategi (se §5/§8) — kompositions-baserad från kanoniska PNG:er **före** generativ figurframställning.
5. Importera kanoniska Nova/Pling-PNG:er + scenbibliotek till Supabase Storage; sampla hex-palett; formalisera maskinläsbar figurreferens (proportioner, do/don't).
6. Ny tabell för rendrade post-bilder + QA-resultat (förslag `post_assets`, se §6).
7. IG **bild/karusell**-publiceringsväg (inte bara REELS): image container → publish.

**C. QA-lager (nytt):**
8. **Bild-QA Agent** (fingrar, ansikten, deformering, trasiga objekt, text-i-bild, upplösning, stil).
9. **Character Consistency Agent** (palett + proportion + referensjämförelse).
10. **Brand Agent** på bild+copy (ton, barnfamilj, tema, aktivitet-finns-denna-månad, CTA) — utöka befintliga deterministiska Guard.

**D. Review & publicering:**
11. Utöka `draft_posts`-status + review-UI med bildförhandsvisning och QA-rapporter.
12. Projektmedveten publisher som **endast** agerar på `approved` + alla QA-grindar gröna, bakom kill-switch.

---

## 3. Riskanalys

**Karaktärskonsistens (HÖGST risk).** Text-till-bild utan referensbild driver — Nova/Pling blir olika varje gång (form, färg, antal figurer, extra figurer). Ideogram saknar seed/stil-lås/image2image. *Mitigering:* generera **inte** figurer från grunden i v1 — komponera från godkända kanoniska PNG:er. Inför palett- + referensjämförelse-grind innan generativa figurer ens övervägs. Blockera "nya karaktärer" (Guard har redan `CH-ROLEMIX`).

**Bildkvalitet.** Fingrar/ansikten/deformering/trasiga objekt/felaktig text går **inte** att fånga deterministiskt tillförlitligt. *Mitigering:* VLM-baserad granskning (Claude vision) mot checklista + deterministiska grindar för det som går (upplösning, bildförhållande, OCR för text-i-bild). Allt under tröskel → blockeras till review, aldrig auto-publik.

**Brand alignment.** Fel ton, fel tema, eller en **aktivitet som inte finns denna månad** kan slinka igenom. *Mitigering:* validera mot `themes/index.json` + `marketing-canon.ts` (Guard gör redan tema/CTA/pris/landing). Lägg till "aktivitet-finns-i-månadens-paket"-kontroll mot `themes/index.json.activities[]`. Juni `defined:false` → **blockera juni-publicering tills temat är satt.**

**Publiceringssäkerhet (cross-tenant).** Dagens publicerare skulle posta Familje-innehåll på The Prompts konto. *Mitigering:* obligatorisk `project_id` på token-hämtning och urval; hård assert att `token.project_id === draft.project_id` före publicering; separat kill-switch per projekt.

**Operativa risker.** Meta app-review/business-verifiering har lång ledtid och kan stoppa lansering — starta nu. Token-utgång → misslyckad publicering: per-projekt refresh + larm. Dubbelpublicering → idempotensnyckel per `draft_id`.

**Innehållsluckor.** Pling underspecificerad, character-palett ej samplad, figur-PNG:er ej importerade. *Mitigering:* §7 Fas 0 stänger dessa innan något genereras.

---

## 4. Förslag på QA-arkitektur

Tre fristående grindar mellan bild och review. Var och en skriver en strukturerad rapport och en `pass | warn | fail`-status; **fail eller warn ⇒ stoppas i review-kön, aldrig auto-publik.** Deterministiskt först (billigt/säkert), VLM där determinism inte räcker.

**Grind 1 — Bild-QA Agent**
- *Deterministiskt:* min-upplösning, exakt bildförhållande (1:1 / 4:5 / 9:16), filstorlek, färgrymd.
- *OCR:* extrahera text i bild; flagga oavsiktlig/felstavad text (figurposter ska normalt vara textfria).
- *VLM (Claude vision), strukturerad output:* antal händer/fingrar rimligt, inga deformerade ansikten/kroppar, inga trasiga objekt, korrekt tecknad stil (ej fotorealistisk/AI-artefakt). Returnerar `{verdict, issues[], severity, crops}`.

**Grind 2 — Brand Agent** (utöka befintliga `guard.ts`)
- *Deterministiskt (finns delvis):* The Prompt-förbud (`BR-THEPROMPT`), svensk ton, CTA-validering, pris {0/59/129/199}, landing-url, korstema.
- *Nytt:* "aktivitet finns i månadens paket" → matcha mot `themes/index.json.activities[]` för aktuell månad; blockera odefinierade teman (`defined:false`, t.ex. juni).
- *VLM på bild:* känns det som Familje-Stunden (varmt, magiskt, barnnära)? barnfamiljslämpligt? matchar månadens tema/symboler?

**Grind 3 — Character Consistency Agent** (§5)

Pipeline-vy:
```
Drafter(copy) → Bildgenerator → [Grind1 Bild-QA] → [Grind2 Brand] → [Grind3 Character] → Review Queue → (människa) → Publisher
                                      |              |               |
                                   qa_report     guard_report   character_report   (alla sparas per draft_id)
```

---

## 5. Förslag på character consistency-system

**Grunden (Fas 0, måste göras först):**
1. Importera kanoniska transparenta Nova/Pling-PNG:er + scenbibliotek (Drive → Supabase Storage `familje-stunden/characters/...`, sökvägar finns redan i `characters/index.json`).
2. **Sampla exakta hex-paletter** ur PNG:erna (Nova: hårband/kjol/skor rosa, tröja turkos, hår brunt, bok gul, armband ljusblått; Pling: blå/teal). Lägg in i en maskinläsbar `character-reference.json` (färger ± tolerans, proportioner, "får/får inte").
3. Färdigställ Pling-spec (idag [LUCKA]).

**Konsistens genom konstruktion (v1 — lägst risk):**
- Generera **inte** figurer från grunden. Komponera poster av godkända kanoniska figur-PNG:er ovanpå tematiska bakgrunder/mallar. Då är figurerna per definition identiska varje gång. Bakgrund kan vara generativ (utan figurer) eller mall.

**Character Consistency Agent (grind, gäller all bild med figurer):**
- *Deterministiskt:* paletthistogram — finns Novas rosa/turkos och Plings blå inom tolerans? Avvikande dominanta färger → flagga. Antal distinkta figurer = exakt 2 (inga extra/nya karaktärer).
- *VLM-jämförelse mot referensbild:* "matchar denna Nova referensen (frisyr, hårband, kläder, proportioner)? Samma för Pling. Några nya/felaktiga karaktärer?" → `{nova_match, pling_match, extra_characters, proportion_flags, color_flags}`.
- *Hård regel:* `character_report.verdict='fail'` ⇒ aldrig publicerbar.

**Senare (Fas 6+, först när grinden är bevisat tillförlitlig):** referens-konditionerad generativ modell (IP-Adapter/character reference / bildprompt) i stället för komposition. Inte i v1.

---

## 6. Förslag på review workflow

**Statusmodell** (utöka `draft_posts.status`, behåll befintliga):
```
drafted → guard_passed → rendering → qa_pending →
   qa_failed  (tillbaka till kön, blockerad)
   ready_for_review → approved → scheduled → published
                                            → publish_failed (retry/larm)
   rejected | returned (befintliga)
```
*Notera:* `approved` förblir människo-styrt. Ingen övergång `ready_for_review → approved` sker automatiskt.

**Ny tabell `post_assets`** (en rad per rendrad bild):
`id, draft_id (FK), project_id, asset_url, width, height, source ('composed'|'generated'), qa_report jsonb, brand_report jsonb, character_report jsonb, overall_gate ('pass'|'warn'|'fail'), created_at`.

**Review-UI (utöka `MarketingReviewClient.tsx`):** visa bildförhandsvisning + de tre rapporterna sida vid sida med copy/Guard, tydliga severity-badges, och knappar approve/reject/return/edit (återanvänd `/api/marketing/approvals`). Approve tillåts endast om alla grindar ≠ `fail`.

**Publisher (ny, projektmedveten):** körs bara på `status='approved'`; assert `token.project_id === draft.project_id`; idempotens per `draft_id`; respekterar kill-switch (`automation_paused`); IG bild/karusell-väg; uppdaterar till `published` + sparar permalink, eller `publish_failed` + larm.

---

## 7. Prioriterad implementeringsplan

**Fas 0 — Referensgrund (ingen publicering).** Importera figur-PNG:er + scenbibliotek till Storage; sampla hex-palett; `character-reference.json`; färdig Pling-spec; sätt juni-tema (eller blockera juni). *Utfall: maskinläsbar sanning för figurer/teman.*

**Fas 1 — Multi-tenant plumbing (ingen auto-publicering).** Projekt-`project_id` i `getToken` och urval; lagra Familje-tokens; per-projekt refresh; assert cross-tenant. *Utfall: säker token-isolering.*

**Fas 2 — Bildväg, kompositionsbaserad.** `post_assets`-tabell; komponera poster av kanoniska PNG:er + tematisk bakgrund. *Utfall: konsekventa bilder by-design, ännu utan publicering.*

**Fas 3 — QA-grindar.** Bild-QA + Character + utökad Brand som grindar som sätter `overall_gate`. *Utfall: inget med `fail` kan nå publicering.*

**Fas 4 — Review-UI.** Bildförhandsvisning + rapporter + approve-gate i befintlig review. *Utfall: människa ser allt före beslut.*

**Fas 5 — Projektmedveten publisher (manuellt godkänd).** IG bild-publicering bakom approve + kill-switch; Meta app-review/verifiering klar. *Utfall: publicering först efter godkännande.*

**Fas 6 — Gradvis automation (valfritt, senare).** Ev. auto-godkänn endast `score≥90 & alla grindar pass & character pass`, en kanal i taget, med kill-switch. Generativa figurer först här om grinden bevisats.

*Beroenden:* Fas 0–1 parallellt. Meta app-review startas redan i Fas 0 (lång ledtid). Publicering (Fas 5) kräver Fas 1+3+4.

---

## 8. Rekommenderad första version (säker i produktion)

**"Assisterad, människo-godkänd, kompositions-baserad."** Maximerar kvalitet, eliminerar den största risken (figurdrift) helt:

1. **Copy:** befintlig Drafter + Brand Guard (oförändrat).
2. **Bild:** komponera från **godkända kanoniska Nova/Pling-PNG:er** + tematisk bakgrund — inga figurer genererade från grunden.
3. **QA:** Bild-QA (upplösning/förhållande deterministiskt + VLM-sanity + OCR) + Character (palett + 2-figur-koll + referensjämförelse) + Brand (tema/aktivitet-finns/CTA).
4. **Review:** allt landar i kön med bildförhandsvisning + rapporter. Inget med `fail`/`warn` kan godkännas blint.
5. **Publicering:** projektmedveten IG-bildpost **endast efter manuellt godkännande**, bakom kill-switch, idempotent.
6. **Skala:** en kanal (Instagram) + ett format (enkel bild) + en månad i taget. Juni blockerad tills temat är satt.

Detta ger ett komplett, granskningsbart flöde i produktion utan generativ figurrisk och utan någon automatisk publicering — exakt "hög kvalitet, låg risk". Generativa figurer och stegvis automation adderas först när QA-grindarna bevisats tillförlitliga.

---

## Öppna beslut till dig

1. **Bildstrategi v1:** kompositions-baserad från kanoniska PNG:er (min rekommendation) — eller vill du utforska referens-konditionerad generering direkt?
2. **Meta-konton:** ska Familje ha en **egen** Meta-app (egen verifiering, ren isolering) eller dela The Prompts app scopad till flera konton? (Påverkar ledtid och risk.)
3. **Juni:** blockera juni-publicering, eller prioritera att fastställa juni-temat först?
4. Vill du att jag tar fram en detaljerad **Fas 0-spec** (importskript-plan, hex-sampling, `character-reference.json`-schema) som nästa steg?
