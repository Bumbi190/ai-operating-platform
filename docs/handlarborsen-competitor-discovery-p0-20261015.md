# Handlarbörsen — Atlas upptäckt av nya konkurrenter (P0, 2026-10-15)

## Syfte och tydlig status

Atlas ska både bevaka aktörer vi redan känner till och regelbundet kunna **upptäcka ytterligare potentiella B2B-aktörer**, utan att blanda ihop att en aktör är *ny för Omnira* med att företaget just har grundats.

**P0 implementerat:** en projektbunden, read-only kandidatpanel med första manuellt verifierade officiella källan (TradingSolutions D2D) samt ren analys för domänidentitet, filtrering mot fyra befintliga aktörer och Handlarbörsen själv, dubblettskydd och granskningsförslag utan exekveringsrätt. Resultatet är statiskt kuraterat. Panelen hävdar **inte** att automatiska sökningar eller aviseringar körs.

**Inte implementerat:** dynamisk sökmotor, beständig kandidatdatabas, Atlas-notifikationer, ägarbeslut för att lägga till bevakning eller schemalagda upptäcktskörningar. All befintlig historiklagring för sex fasta källor behålls oförändrad.

## Kandidat idag

- TradingSolutions D2D, officiell källa: https://www.tradingsolutions.se/d2d/
- Manuellt observerad 2026-10-15. Deras egen webbplats beskriver en digital B2B-bilauktion för professionella bilhandlare.
- Ingen källa styrker att de är nystartade eller att det skett en produktlansering just detta datum.
- Kandidat i granskning, inte godkänd tillåtlistad monitoreringskälla.

## Planerad långsiktig kedja

1. **Discovery provider:** utvärdera ett användar- och avtalsgodkänt sök-/flödesgränssnitt för den svenska B2B-fordonsmarknaden. Endast kodstyrda, få sökfrågor; inga fria klient-URL:er. Ingen HTML-exekvering eller tredje parts inloggade tjänster.
2. **Oberoende källverifiering:** webbsökning får på sin höjd ge en tillfällig ledtråd. Kontrollera en officiell, åtkomsttillåten företagskälla separat. Förhindra prompt-injektion, SSRF, metadataförväxling och påståenden om nystartade bolag utan daterade förstahandsbevis.
3. **Beständigt kandidatregister:** skapa ny, separat schema-granskad projektlåst Supabase-tabell med stabil kanonisk företags-/domänidentitet, first_seen, last_seen, officiellt underlag, review_state och unik kandidat per projekt. RLS + FORCE RLS, noll anon-grants, ägarkontrollerat API, idempotens och förvaltad retention. *Ingen migration är applicerad i P0.*
4. **Atlas-avisering:** registrera en deduplicerad review-only signal för en kandidat första gången ett **nytt, verifierat officiellt underlag** finns. Visa källlänk och datum på Handlarbörsens projektsida/Atlas-granskningslista. Inte e-post/push per automatik; kanalval kräver separat granskad implementation och användarpreferens. Samma domän ger inte ny notis vecka efter vecka. Resultatet får inte representeras som bolagslansering.
5. **Human gate:** ägaren får välja lägg till bevakning / ignorera / undersök senare. En godkänd kandidat får aldrig automatiskt utöka den nuvarande fasta nätverkstillåtlistan — ny teknisk scanning source behöver separat kodgranskning och kontroll av robots/terms.
6. **Autonom körning:** veckovis, endast efter Cost Governance i Preview **och** produktion, projektisolering, kostnadstak, idempotens/lease, audit och globalt + projektbundet nödstopp. Den befintliga designgränsen på maximalt 10 externa HTTP-anrop per bevakningskontroll gäller tills en uttryckligt godkänd totalbudget kan omfördelas. Inga automatiska omförsök, inga betalda LLM-anrop som standard.

## Externa källor / juridisk gräns

- Brave Search API Terms of Use, 2026-09-01: https://api-dashboard.search.brave.com/documentation/resources/terms-of-service — förbjuder att lagra/cacha/skapa en databas av sökresultat utan separat rättighet.
- Brave Search API support om retention: https://api-dashboard.search.brave.com/documentation/resources/help-feedback — kontakta leverantören för tillstånd att lagra resultat.
- En godkänd API-nyckel, pris eller månatlig gratis kredit innebär **inte automatiskt rätt att arkivera sökresultat**. Använd därför inte Brave- eller Tavily-resultat i en permanent råresultats-tabell.
- Uppdaterad källpolicy och uttryckligt kostnadsbeslut ska granskas innan val av provider, migration eller schemaläggning.

## Kontrakt/tester

- Fyra existerande aktörer och egen domän kan inte räknas som nya.
- URL måste vara HTTPS, utan credentials eller port. Ingen godtycklig klientstyrd hämtning.
- Endast oberoende verifierat officiellt underlag får skapa kandidat, aldrig ett API-resultat utan förstahandsverifiering.
- Inga upprepade review-signaler för samma normaliserade host inom redan känd historik.
- Felaktigt datum, osäker text, ogiltigt officiellt bevis och otillåtna värden fail-closed utan att skapa förslag.
- Kandidater är *review-only*, *executable:false*, och *foundedRecently:not_verified*.
- Observera: P0-dubbletter bygger på given previousHosts-mängd; riktig varaktig minneskontroll kräver P1/P2 databas. P0 hävdar inte persistent dedup.
