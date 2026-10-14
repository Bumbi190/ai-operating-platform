# Handlarbörsen – ledningsöversikt och Konkurrentspanaren (2026-10-14)

## Levererad lokal kandidat
- **Beslut först:** fyra dataanknutna nyckeltal högst upp (verifierade företag, publicerade fordon, bud totalt, PostHog-sidvisningar senaste 7 UTC-dagar). Otillgängliga mått visas som **Okänt**, aldrig som påhittade nollor.
- **Verklig verifieringsgrad:** enda procentgrafen bygger på verifierade/registrerade företag när båda källvärdena är jämförbara. Den är inte kundkonvertering.
- **Atlas-lägesbild:** strikt regelbaserad, befintlig verifierad analys, med blockering av affärsinsikter vid för gammal rapport. Märkt tydligt; ingen LLM anropas bara för att sidan laddas.
- **Graf först:** befintliga sanningsenliga utvecklingsdiagram följer direkt efter översikten, därefter 7-dagars PostHog-visualisering.
- **Långt material hopfällt:** komplett KPI-lista, aktivitetsfönster, marknadspuls, evidens och sparade analysutkast finns kvar bakom en semantisk `details`-kontroll. Ingenting kastas bort.
- **Konkurrentspanaren P1:** återanvänder redan granskad och begränsad offentlig manuell scanning av tre **daterade Handlarbudet-nyheter**. `robots.txt` måste tillåta, URL:er är fastlåsta, svar är storleks- och tidsbegränsade, omdirigering följs inte. Inga automatiska anrop vid vanlig sidladdning.
- **Pilotplanering:** tre spårbara intervju-/produktfrågor från denna dossier är tydligt märkta *förslag att validera*, inte aktuella konkurrensfakta eller utförbara Atlas-arbetsflöden.

## Ärliga gränser
Det här är en **manual-first första version**, inte kontinuerlig webb-/sökmotorbevakning. Kontrollknappen validerar URL-tillgänglighet och titelmetadata, inte konkurrenternas aktuella priser, erbjudanden eller produktsidor. Planeringsförslagen sparas inte automatiskt i projektets arbetsflödesdatabas och sätter inte igång någon agent. Atlas-chatten behöver en separat, behörighetsbunden och källciterad frågetjänst för att besvara nya frågor om just konkurrenterna. Inga nya API-avgifter, scheman, LLM-anrop eller autonoma åtgärder aktiveras.

## Föreslagna nästa faser
1. Visuell och mobil granskning av preview. Bekräfta att toppinformationen ger ett beslut på under 15 sekunder och att osäkra mätvärden märks rätt.
2. Efter godkänd första källkontroll: utöka till fler verifierade officiella konkurrenskällor och komplettera med sparad historik för skillnader över tid. Beakta robots/villkor och källkvalitet.
3. **Atlas på begäran:** låt användaren ställa frågor om konkurrenter, alltid med källa, observationsdatum och osäkerhet. Skapa granskbara planutkast; spara eller tilldela först efter mänskligt beslut.
4. **Schemalagd bevakning:** välj intervall (t.ex. veckovis) efter verifierade kostnadsgränser, projektisolering, rate limits, stopp/rollback, audit och budget. Ingen automatisk publicering, kontakt eller ändring av marknadsplatsen.
5. Komplettera dashboarden med **pilottratt** (utskick → verifiering → första annons → första bud), datakällornas uppdateringsstatus och ekonomi/Stripe när godkända verkliga källor finns. Lämna okänt tomt i stället för att skapa falska grafer.

## Säkerhets- och kostnadsprincip
Inga databasändringar, publicerade analyser, kontobehörigheter, produktionstokens, scraping av breda webben eller GitHub Actions-körningar ingår här. Oscar-åtkomst hanteras i separat arbetsflöde.
