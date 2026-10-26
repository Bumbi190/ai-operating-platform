# The Prompt som klickbara kalenderposter

Status: grunddesign och datumregel godkända av André den 26 oktober 2026. André förtydligade att bild/video, mejl och annat granskningsunderlag ska kunna granskas direkt i den öppnade sidopanelen. Ingen produktkod ändrad ännu.

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

## Förtydligande från André: granskning i panelen

Själva granskningsinnehållet ska finnas i sidopanelen, inte bara en länk till en annan sida. The Prompt ska kunna visa sin befintliga video där; sociala innehållsposter ska visa rätt revisions bild/video och text där. Mejlunderlag ska kunna visa mottagare, cc/bcc när sådana finns, ämne, hela den sparade brödtexten och bilagor. Annat sparat granskningsunderlag visas läsbart i samma panelprincip, med explicit saknat underlag när det inte går att läsa. Kalenderns titlar och färgprickar hålls små.

Återanvänd en gemensam innehållsvisare även i den befintliga granskningssidans detaljpanel. Läsaren får inte tolka slumpmässiga länkar i text som ägda bilagor. HTML/mejl visas som säker text utan aktiva skript, formulär, fjärrbilder eller spårningspixlar. Media läses först för den valda posten och binds till användare, projekt och källrevision. Privata förhandsvisningar får inte leva kvar efter byte av post, revision eller konto. Befintliga specialkontroller för granskning/godkännande återanvänds där de redan finns; förhandsvisning skapar inget nytt sändningsmandat.

En läsande metadatafråga den 26 oktober fann inga ägda approvals med mejlrelaterad kind/output_key. Mejlförhandsvisningen ska därför levereras med en uttrycklig, testad utkasttyp och kopplas när ett sådant sparat granskningsunderlag finns. Ingen mejlproducent, extern inkorgskoppling eller utskick skapas av UI-arbetet. Befintliga generella textunderlag ska fungera direkt med den gemensamma visaren.
