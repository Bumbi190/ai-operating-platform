# AWS Bedrock-pilot: The Prompt sparade manus och källhänvisningar

Datum: 2026-11-16. Detta är en **skrivskyddad** koppling till befintlig Supabase-data och en **icke-debiterbar** Preview-förhandskontroll.

## Datamodell (verifierad direkt i AI Operating Platform Supabase)
- projects: The Prompt har slug ai-media-automation och ett verkligt projekt-ID. Projekt-ID hittas genom projektslug och **begränsas till den inloggade användarens ägda projekt**. Det är INTE hårdkodat i sidan.
- media_scripts: varje manus har id, project_id, news_item_id, script, status, generated_at, hook och topic.
- media_news_items: kopplas till manuset via news_item_id och kontrolleras med samma project_id. Här finns title, url, source_name och summary.
- Källrelaterat raw_output i nyhetsraderna är normalt bara source_url + AI-sammanfattningar; inget verifierat artikelutdrag eller oberoende andra källa. Scriptets raw_output innehåller normalt manusdata, inte verifierade källcitat.

## Ny Preview-funktion
- POST /api/bedrock-review-library med kind=list: visar upp till de 60 nyaste manusen i **The Prompt**, sorterade efter generated_at. Listan returnerar bara titel, status, datum, id och om primärlänk finns; inte hela script eller annan projektdata.
- POST /api/bedrock-review-library med kind=detail, scriptId: hämtar ett valt manus och dess sparade primärlänk, strikt filtrerat på samma verifierade project_id. Den sparade AI-sammanfattningen kan visas som **bakgrund, inte som artikelcitat**.
- Sidan /bedrock-review hämtar automatiskt rätt projekt-ID, erbjuder manusval och fyller i manus + primärlänk med ett val. Källutdrag och en andra oberoende källa lämnas medvetet tomma eftersom de inte har verifierats.
- Ett manus med rubrik om Google AI Overviews i skolor finns i media_scripts från 2026-11-05. Det ingår bland 60 senaste (24 senare manus vid inventering). Databasstatus publicerad är **inte** ett faktagodkännande eller en rättighetsgranskning.

## Säkerhetsgränser
1. Exakt Vercel Preview-gren; POST med JSON, origin och Sec-Fetch-Site=same-origin. Ingen publik GET och Cache-Control: private, no-store.
2. Kontrollera plattformoperatör, autentiserad session och projektägarskap **före** service-role SELECT. Verifiera samma user-ID och återanvänd canonical mintat operator grant.
3. Hela select-kedjan är read-only. Projektqueryn är låst till slug ai-media-automation och inloggad ägares projekt-ID. Varje media_scripts/media_news_items-query filtrerar på det projekt-ID:t, och manuset kan endast hämtas via giltigt script-ID.
4. Ingen modell, ingen STS, inga budgetreservationer, inga publiceringar, inga DB-ändringar och ingen serverhämtning av externa artikel-URL:er.
5. Det finns normalt inte två verifierade källutdrag sparade i Omnira. UI säger tydligt vad som saknas och kräver användarkontroll i stället för att skapa citat.
6. Den tidigare separata förhandskontrollen /api/bedrock-review-preflight fortsätter att returnera canDispatch=false, modelInvoked=false och costReserved=false även om format och rättigheter godkänns. H1_SPEND_GATE saknades i Preview vid kontrollen; aktivera inte den som en genväg.

## QA och städning
- Verifiera båda API-operationerna i Vitest med isolerade Supabase-mockar, inklusive korsprojektförsök, obehörig operatör och originaldata.
- Full TypeScript, regressionskontroller och Vercel READY för exakt senaste commit före manuell test.
- Senare: låt en redaktör öppna källorna, hämta verkliga textutdrag och komplettera saknad sekundär källa; först därefter kan en separat, godkänd betald modellgranskning utvärderas.
- Ändra inte The Prompts aktuella manus/publiceringskö eller produktion. Städa hela den tillfälliga testgrenen med grenvariabler och gamla Preview-deployments när piloten är avslutad.
