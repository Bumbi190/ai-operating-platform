# The Prompt som klickbara kalenderposter

Status: kort design för granskning, ingen produktkod ändrad.

## Önskemål och vald väg

André vill ta bort den stora köboxen ovanför kalendern. The Prompts godkända nyheter ska synas som små klickbara poster i själva kalendern; detaljer hör till den valda posten. Den nyligen släppta läsningen och kanalstatusarna återanvänds. Enbart hopfällbar textlista löser inte önskemålet. En ny publiceringsplanerare är inte nödvändig för UI-ändringen och skulle förändra det dagliga flödet, som André vill behålla.

## Förslag till visning

- Ta bort den stora köboxen. Visa kort nyhetstitel och befintlig statusprick i kalendern, med en post per film. Kanalernas status visas först när posten öppnas.
- Om en verklig schematid finns används den. The Prompts nuvarande äldre kö saknar sådan tid. Godkända ännu inte publicerade filmer placeras därför på godkännandedagen i dagens övre rad utan klockslag. Använd reviewed_at när den finns; annars generated_at som tydligt namngivet nyhetsdatum, inte som påstådd godkännandetid. Panelen visar vilken uppgift datumet grundas på och texten ”Ingen fast publiceringstid”. Detta är Codex föreslagna datumregel.
- Första sparade publiceringen kan visas vid published_at, tydligt benämnd ”Första publicering”. Den tiden gäller inte automatiskt varje kanal. Facebook/Instagram/YouTube behåller egna sparade kvitton och väntande/fel/oklart läge.
- Visa endast poster som hör till vald kalendervecka. Äldre misslyckade filmer ligger på sina historiska datum, inte samlade ovanför dagens kalender. Om datum inte kan fastställas ska en liten kalendernotis för saknat datum ge tillgång till posten; inget datum uppfinns.
- Klick öppnar en kompakt sidopanel med titel, datumets innebörd, kanalstatus och möjlighet att se just den filmens befintliga video när den finns. Ingen videoförhämtning eller automatisk uppspelning. Detaljläsningen kontrollerar ägarskap och returnerar bara nödvändiga fält och betrodda mediereferenser. Saknad video visas som saknad; öppningen får inte starta rendering.
- Projektfilter, mobilens dagsvy, tangentbord och stängning med Escape fungerar som för övriga kalenderposter. Uppdatering eller kontobyte får inte återställa gammal vald film eller privat video. Posten kan inte dras/flyttas till en falsk publiceringstid.

## Gränser och verifiering

Ingen ändring av nyhetsanalys, befintliga godkännanden, publicerare, köjobb, klockslag, budget eller cron. Inga nya AI-anrop eller publiceringsknappar i kalenderpanelen. Ofullständiga kvitton och okänt kanalutfall får inte bli gröna bara för att en kalenderpost finns. Samma film eller kanaljobb får inte skapas igen.

Kalenderkällan behöver datum och ett avgränsat läsande detaljunderlag. Läsning sker för den ägda The Prompt-identiteten och den valda veckan; avkortning/fel visas tydligt utan att dölja privata möten eller Familjestundens poster. Återanvänd befintlig kalenderlayout och statuskontroller; lägg inte ett fristående kalendersystem ovanpå.

Verifiera: stor box borta; godkänd film utan schematid på rätt dag utan påhittat klockslag; första publicering med delvis väntande kanaler; rätt film öppnas; privat/annat projekt läcker inte; äldre fel ligger historiskt; mobil och tangentbord fungerar. Kontrollera att öppning och omläsning skapar noll jobb/provideranrop och att Familjestundens planering är orörd.

Genomföraren väljer intern typ-/filuppdelning och kompakt layout inom det befintliga gränssnittet. Detta är UI-förbättringen först; Familjestundens återkommande veckoförberedelse är fortsatt nästa separata steg efter första granskningen. Handlarbörsen behöver fortfarande egen budget/kontokoppling innan dess marknadsföring kan köras automatiskt.
