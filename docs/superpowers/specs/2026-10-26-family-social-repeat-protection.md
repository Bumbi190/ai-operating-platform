# Familjestunden: skydd mot upprepade publiceringar

## Beslut från André

- Samma kampanj får publiceras på både Facebook och Instagram.
- Exakta kopior ska stoppas, även om de sparats som ett nytt inlägg eller jobb.
- Mycket liknande innehåll inom 14 dagar ska hållas för granskning och inte publiceras automatiskt.
- Osäker tidigare publicering får inte orsaka ett automatiskt nytt försök.
- Saga och aktiviteter fortsätter att skapas tillsammans med André; denna ändring gäller marknadsföringen.

## Rekommenderad lösning

Behåll det befintliga skyddet för samma jobb och lägg innehållskontrollen i den gemensamma publiceringsvägen. En kontroll enbart i textgenereringen eller kalendern kan kringgås av ett nytt jobb, en manuell publicering eller ändrad historik.

1. **Kontroll vid förslag.** Jämför nya förslag med projektets publicerade, möjliga publiceringar och godkända kö. Visa vilken tidigare post som krockar och varför, innan ägaren godkänner.
2. **Ny kontroll precis före publicering.** Både schemalagd och manuell väg måste passera samma kontroll. Den ska vara transaktionssäker när två olika jobb försöker publicera samtidigt. Ett gammalt godkännande ersätter inte den aktuella kontrollen.
3. **Exakt kopia.** Jämför normaliserad innehållstext, inte jobb-ID. Skillnader i blanksteg, versaler eller kosmetisk interpunktion ska inte göra en kopia till ett nytt inlägg. Redan publicerade eller osäkra identiska texter på samma projekt/konto/kanal stoppas. Den egna tidigare körningen hanteras med befintlig återhämtning; den betraktas inte som en ny tillåten publicering.
4. **Liknande innehåll.** Jämför inom 14 dagar kring den avsedda publiceringstiden. Ta med både faktisk publicering och närliggande godkända köposter. Små textändringar och samma bild tillsammans med nästan samma budskap ska kunna ge granskningskrav. Enbart samma logotyp eller återkommande varumärkesord ska inte vara tillräckligt. Textjämförelsens gränser och korta/otillräckliga texter ska testas uttryckligen; en osäker bedömning får inte självgodkännas. Ingen garanti om perfekt semantisk förståelse eller igenkänning av beskurna bilder ska utlovas.
5. **Kanalgräns.** Kontrollera upprepningar per konto och kanal inom projektet. Därmed tillåts den uttryckligen godkända kampanjkombinationen Facebook + Instagram. Ingen kontroll får läsa andra projekts innehåll.
6. **Synligt stopp.** Visa exempelvis ”För likt ett tidigare inlägg – behöver granskas”, med tid och länk till den berörda posten. Behåll korrekt orange status i kalender/granskning. Systemet får inte automatiskt ändra, ta bort eller skicka om de befintliga 36 köjobben.

## Instagram-avstämning, separat del

Händelselogg för 23 oktober visar requested → creating → uncertain, utan sparat container-ID. Den nuvarande exekveraren spärrar redan nytt försök i det läget. Det finns ingen säker publiceringskvittens, och ingen sådan får skapas från en slutsats om vad som troligen hände.

Bygg en separat, läsande Instagram-avstämning med rätt kontobindning, exakt text, tidsfönster och identifierad media. Återläs vald kandidat från leverantören före eventuell registrering av kvittot. Ingen match eller flera möjliga matchningar ska lämna posten osäker. Befintlig Facebook-avstämning och dess kontroll av bild/innehåll måste bevaras. Ett uteblivet sökresultat är inte bevis för att publicering aldrig skett och får inte utlösa ett nytt utskick.

## Verifiering före aktivering

- Identisk text med nytt post-/jobb-ID nekas.
- Dubbelklick, omstart, samtidiga jobb och förlorat svar ger inte ett extra leverantörsanrop.
- Liknande text dag 13 hålls för granskning; 14-dagarsgränsens exakta inklusivitet dokumenteras och testas.
- Samma kampanj på Facebook och Instagram tillåts; samma kanal/konto gör det inte.
- Samma bild med annat budskap och gemensamma varumärkesfraser bedöms utan generella bildförbud.
- Osäkra försök, saknad/trunkerad historik och inaktuella kontroller kan inte bli automatiska godkännanden.
- Båda publiceringsvägarna, ägarisolering, SQL-låsning och befintlig kö verifieras i isolerad databas och med simulerad leverantör. Inga live-inlägg används som test.
- Därefter granskas befintlig kö utan publicering innan någon produktionsaktivering.

## Leveransordning och gräns

Först implementeringsplan och isolerad verifiering av innehållsskyddet; Instagram-avstämning hålls som en egen testbar del. Ingen ny stående publiceringsfullmakt, automatisk veckoproduktion eller betald bildgenerering införs här. Befintliga godkännanden och stoppregler gäller fortsatt.

Status: design godkänd av André 26 oktober 2026. Repetitionsskyddet är implementerat och lokalt verifierat. Produktionsinstallation avvaktar uttryckligt driftsättningsgodkännande efter automatisk avvisning; ingen produktionsändring har utförts för skyddet. Instagram-avstämning kvarstår som separat del.
