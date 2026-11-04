# Demo Motors: kostnadsavstämning och nästa byggprov

Datum: 2026-11-04. Work ID WEB-STUDIO-RECONCILE-20261104. Fortsättning i befintlig Draft PR368. Verifierad körbar bas: 08e20f512a9ea4d9f9478c0c81e256867dedc14f. Denna avstämning ändrar inga budgetar, projektstopp, byggbeslut eller medier.

## Resultat

USD10-totalramen kan ännu inte initieras med ett verifierat tidigare förbrukningsbelopp. Projektets egna databastabeller och lokala journal har ingen debitering, men det finns separat förbrukade mediekrediter. Avsaknad av API-poster bevisar inte noll mediekostnad. Krediter får inte omvandlas till USD genom ett antaget listpris eller genom att dela hela abonnemangsbetalningen med nuvarande saldo.

Det återstår också en teknisk koppling: den godkända Roadster-visningen är ett betrott, författat visningspaket. Det generella AI-byggflödet har ännu ingen granskad bindning till detta paket. Att starta den gamla sparade planen skulle därför inte verifiera den aktuella godkända designen.

## Skrivskyddad kontroll av det dedikerade projektet

- Projekt: Handlarbörsen Demo Motors – Preview, e6cf9349-4967-441c-a2bd-5778eec974b3.
- cost_events: 0 poster, summerat 0 USD / 0 SEK.
- spend_reservations: 0 poster och 0 dispatch intents.
- website_build_sessions: inga sessioner.
- execution_paused: true.
- project_budgets: monthly_sek 0; total_usd_limit_micros null; committed 0.
- Lokal admissions.jsonl: 0 byte; head.sequence 0 och head.total 0.
- Ursprungligt godkännande: USD10 totalt, ingen förnyelse eller automatisk höjning. Nya medier, retries och misslyckade försök ingår i den skrivna omfattningen. historicalTotalSpendUsd är null.

Detta är avläsningar, inte en ny budget eller ny rätt att spendera. Native projektkostnader omfattar inte automatiskt externa mediegenereringar gjorda via andra verktyg.

## Återfunna medieposter

Källor: cinematic-assets/manifest.json, cinematic-assets/nord-r.json, cinematic-pilot-proof.md, 2026-11-02-premium-tour-verification.md och 2026-11-02-premium-delivery-economics.md. Detta är repo-sparade kvittenser/offerter och tidigare saldoobservationer, inte en ny fullständig export från leverantörens fakturering.

| Etapp | Beställt/offert, credits | Känd återföring | Dokumenterat netto |
| --- | ---: | ---: | ---: |
| Första bild-/videopiloten | 9 | 0 | 9 |
| Premiumbilder och ursprungliga filmer, inklusive förkastat material | 98 | 26,25 | 71,75 |
| Ny öppningsscen, d8e2dbcf-f7bb-42b6-9c49-1c8d5049169d | 17,5 | 0 | 17,5 |
| Nord R-modell, 13dc6c54-08a9-4cdf-b40a-b9e2d2e4626c | 12 | 0 | 12 |
| Nord R-inåkning, b533eef5-def0-4a76-9f6d-a2832a92c9bc | 17,5 | 0 | 17,5 |
| **Delsumma, inte full projektkostnad** | **154** | **26,25** | **127,75** |

Återanvänd kupéfilm f7cb7c5c-ea7f-4f03-8945-6ff638cdef9d och Nord R-bilder räknas inte en gång till. Bakgrund 0c91cb3c-9b50-4fe6-8391-a0c2f360d141 finns i manifestet; tidigare samtal uppgav 1,5 credits, men manifestet saknar belopp. Den ligger därför utanför delsumman ovan. Med den uppgiften skulle delsumman bli 129,25 netto, fortfarande före Roadster och eventuella senare medieändringar.

Roadsterns sparade manifest och lokala utgåvor har filhashar och visuellt godkända versioner, men saknar komplett genererings-/kostnadskedja. Den gamla leveranskalkylen är ett scenario, inte en faktura. Den tidigare uppgiften om cirka USD80 för abonnemanget avgör varken kostnad per credit eller budgetens omfattning. Hela kontots saldoförändring får inte läggas på Demo Motors: andra projekt använder samma konto.

Observera två olika mått: medietabellens netto visar rapporterade återföringar. Den nya API-budgetfunktionen räknar konservativa antagna pristak och återför inte ramen efter fel, frisläppning eller månadsskifte. Ett historiskt importbelopp får inte härledas genom att blanda dessa mått.

## Verifierad planavvikelse

Sparad plan 346fbcae-a8b5-4b70-a4fa-263d624733f9 pekar på revision 1286b657-f154-4e3e-b19b-9a42bd772477, nummer 1, SHA256 ec617c3bb751bb4e5865276573909b6dc646fa8f87cf3be2b3969772175885c6.

Den använder premium-dealer-demo-v1, åtta fiktiva exempelbilar och design.reference null. design_review_required är true. Det finns 0 planbeslut, 0 mockupbeslut och ingen aktiv session. Texten "Godkänd plan" i briefen är inte ett strukturerat godkännande och får inte användas för att kringgå det riktiga granskningsflödet.

Nuvarande v2-planeringsschema medger bara fyra fasta illustrationsval. roadster-showcase-v1 är ett separat, betrott visningspaket. En prompt som nämner Roadster gör inte automatiskt detta paket till en tillåten genererad komponent.

## Förberett provupplägg, ännu inte startat eller godkänt i Studio

1. Utgå från den godkända Demo Motors-visningen: sju befintliga konceptbilar, Roadster med film, kupé, akter och den nya modellen med fyra thrusters. Återanvänd befintliga filhashar; inga nya bilder, filmer eller 3D-genereringar beställs.
2. Lägg först till och verifiera en snäv, författad bindning av det betrodda paketet genom ordinarie plan, mockup, byggunderlag och export. Modellen ska inte få skriva godtyckliga skript, iframe-adresser eller externa medielänkar.
3. Skapa en ny granskningsbar planrevision/mockup för exakt detta underlag. Bevara den gamla revisionen. Skriv aldrig ett påhittat ägargodkännande direkt i SQL.
4. När budgetomfattning och tidigare API-förbrukning är fastställda: initiera endast det dedikerade projektets befintliga engångsram, med kvittens och uttryckligt historiskt belopp. Ingen påfyllning eller ny månatlig ram antas.
5. Kör ett övervakat bygge genom ordinarie styrda leverantörsväg. Visa beräknat pristak före första anropet; stoppa vid fel och starta ingen obevakad omkörning.
6. Prova en enda tydlig chattändring: ändra en överenskommen CTA-text. Bilantal/ordning, uppgifter, mediehashar, filmens scroll och 3D får inte förändras. Kontrollera sedan historik och export.
7. Resultatet är en förhandsvisning för granskning. Kundutskick, produktionspublicering och merge ingår inte.

## Beslut som saknas

Den ursprungliga USD10-filen inkluderar nya medier. Senare samtal tillät användning av befintliga Higgsfield-krediter för premiumkvalitet, men gav ingen entydig USD-fördelning eller uttryckligt undantag från USD10-filen.

Konkret förslag för ägarens besked: låt den befintliga, icke förnyande USD10-ramen avse projektets API-kostnader för planering, bygge och chattändringar; redovisa redan betalda Higgsfield-krediter separat utan att köpa eller generera mer media i nästa prov. Detta är ett förslag till förtydligad omfattning, inte en aktiverad budget eller en antagen utökning. Om medier i stället ska ingå i samma USD10 krävs den saknade kostnadskedjan och en överenskommen omräkningsgrund före aktivering.

## Verifiering och kvarvarande arbete

Lokal aritmetik: 9 + 98 + 17,5 + 12 + 17,5 = 154; 154 - 26,25 = 127,75. Inga återanvända mediejobb dubbelräknas. Kontroll av native projekt, sparad revision och beslutsräknare gjordes skrivskyddat i produktion. Inga runtime-filer ändrades; ingen ny kodtestkörning behövs för denna dokumentationsändring. Den tidigare körbara basens 15 arbetsflöden/19 kontroller och Ready-preview är baslinjebevis, inte ett bevis på genomfört live-AI-bygge.
