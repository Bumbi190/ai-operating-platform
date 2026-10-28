# Familje-Stunden — veckovis automatisk innehållsförberedelse, fas 1

Datum: 2026-10-28 (Europe/Stockholm)
Status: **ENBART PLANERINGSKOD / EJ AKTIVERAD**. Ingen cron, AI-modell, produktionstabell eller publiceringskö ändras av denna gren.

## Affärsönskemål

Från januari 2027 ska Atlas på söndag eftermiddag förbereda nästa veckas vanligt Facebook-/Instagram-innehåll med projektets riktiga fakta och egna bilder, meddela operatören och överlämna för granskning. Operatören ska kunna redigera och godkänna exakta texter, bilder och tider. **Bara efter separat schemaapproval** får befintlig publiceringskö skicka vid rätt tid.

* Den redan godkända nov–dec-kön ska inte ändras.
* Månadsintroduktioner den 1:a kl. 20.30 är en **separat process** med obligatorisk bekräftelse av faktisk kundåtkomst. Veckogeneratorn får aldrig ersätta, förbereda eller publicera ett månadsrelease-inlägg via ordinarie veckoflöde.
* Spontana inlägg via befintliga `get_social_content` och `propose_social_content` fungerar som separat, operatörsstyrt utkastflöde; förslaget är inte godkänt/schemalagt/skickat.

## Implementerat i denna isolerade gren

`apps/web/lib/social-launch/weekly/auto-preparation.ts`:
* Pure, side-effect-free `findWeeklyAutomaticWindow(now)` med start **söndag 2027-01-03 kl. 15.00–15.59 Europe/Stockholm**, därefter söndagar i samma lokala tidsfönster. Första målveckan är måndag **2027-01-04**. DST får inte ändra lokal timme.
* `evaluateAutomaticWeeklyPreparation` ger bara statusarna `not_due`, `not_enabled`, `already_prepared`, `nothing_to_prepare`, `review_required`, `ready_to_prepare_drafts`.
* Den kräver explicit opt-in, rätt Familje-Stunden-projekt, matchande signerad/owner-granskad veckokontext, inga rapporterade källbrister, ett faktiskt projektspecifikt faktaunderlag och beskrivna redan ägda bilder.
* En full redan förberedd/godkänd vecka skapar inget nytt. En delvis fylld vecka kan bara föreslå saknade ordinarie Facebook-/Instagram-par.
* **Ingen** funktion returnerar publicerings-, dispatch-, kontoanslutnings-, bildgenererings- eller kostnadsbehörighet.
* Befintliga `planMarketingWeek`, `getWeeklyContext` och `prepareWeeklyDrafts` bibehålls som källor och framtida anrop. Deras kontroller kring dubbletter, revisions-ID, idempotens, budget och upphov ska inte dubbleras.

`apps/web/lib/social-launch/weekly/auto-preparation.test.ts` testar startdatum, veckor, lokal timme, sommartid, befintlig förberedelse, delvis full vecka, saknad källa, fel projekt, obevisade konton/bilder och ingen publiceringsrätt. **28/28 befintliga + nya veckotester godkända**, separat TypeScript godkänd.

## Status verifierad mot Omnira och Familje-Stunden i produktion (läsningar endast)

- Omniras `social_monthly_release_rules`: aktiv regel `dayOfMonth=1`, `localTime=20:30`, båda kanalerna.
- Månadsinläggen 2026-11-01 och 2026-12-01 är godkända och `queued` på Instagram + Facebook (två per månad). De är **inte bevis på att kundåtkomst är verifierad**.
- `social_monthly_release_evidence` saknade poster för både november och december vid kontroll.
- `social_weekly_preparations` var tomt. Veckoverktygen kan förbereda utkast när ägaren ber om det i Atlas-chatten; **ingen återkommande självgenerering är driftsatt**.
- I Familje-Stundens egen produktionsdatabas saknas en `month_releases`-rad för `2026-11`. Enligt `docs/MONTHLY_RELEASE_RUNBOOK.md` är release-grinden **fail-open** utan den raden; det är ett viktigt säkerhets-/releasesteg att lösa innan novembermaterial laddas upp eller intygas släppt.
- Den lokalt lästa novemberkonfigurationen anger att november ännu inte är v2-paket med protectedManifest. **Lokal källa är inte ett QA-bevis på aktuell serverstatus.** Faktisk admin/non-admin åtkomst behöver testas i Familje-Stundens egen releasprocess.
- Påminnelser för 31 oktober kl. 11.00 (förhandskontroll) och 1 november kl. 16.00 (kundåtkomst + social readiness) är skapade som separata ChatGPT-automatiseringar. De får inte skicka/publicera eller intyga åtkomst.
- Äldre osäkert Instagram-kvitto från 23 oktober ska bevaras för spårbarhet och får **inte** skickas igen av en veckogenerator.

## Kvar för en verklig återkommande Atlas-generator

1. Bestäm **bestående ägaropt-in** till begränsad bakgrundsförberedelse, med uttrycklig projektgräns, giltig ägaridentitet och behörig konversation. Ingen Cron får själv skapa/imitera `p_principal` för att kringgå projektåtkomst.
2. Binda kostnadsstyrd LLM-körning till Atlas befintliga governed-spend, med tak och validerade utdata, ingen extern bildgenerering automatiskt. LLM får se enbart avgränsade projektfakta och redan beskrivna tillgångar.
3. Använd exakt `getWeeklyContext` → validerad generator → `prepareWeeklyDrafts` med samma kontext-hash, version, semantisk dubblettkontroll och idempotens. Ingen post får skapas ifall källmaterialet ändrats under körningen.
4. Visa sparade utkast i den befintliga sociala arbetsytan och avisera projektägaren **endast vid nytt granskningsbart arbete eller blockerare**.
5. Kräv separat native **Godkänn och schemalägg veckans inlägg**. Ingen auto-schemaläggning före den processen, och ingen ny publiceringskö implementeras.
6. Efter begränsad Preview-testning, ägargranskning och CI kan en söndags-Trigger aktiveras för januari 2027. Den här grenen lägger **inte till någon Vercel-cron eller funktionsflagga**, för att inte aktivera kostnader eller ändra nuvarande automation.

### Gräns för utlovad funktion

Detta är **fas 1**, inte en färdig autonom veckoagent. Att testen säger `ready_to_prepare_drafts` betyder att systemet får överväga ett skyddat genereringsanrop när steg 1–6 ovan är implementerade, **inte** att utkast skapas idag. Användaren ska inte få ett falskt löfte om helautomatiska veckoutkast efter december innan dessa steg är live.
