# Provbilhall och Kundadmin

Den fiktiva handlaren Björkgläntans Demobilar visar Skog E. Strandvik Motor har ett separat lager med Kust Touring. Ekbackens Demobilar är testfallet där handlaren har ett konto men saknar admintillvalet.

## Prova på den stationära datorn

Kör från roten av Web Studios arbetskopia med Node 22, installerade repoberoenden och lokal Docker. Provet använder samma tre lokalt tillgängliga, versionslåsta tjänstebilder som referenstesterna använder för PostgreSQL, GoTrue och PostgREST.

```sh
node apps/web/scripts/dealer-customer-pilot.mjs --serve
```

- [Björkgläntans bilhall](http://127.0.0.1:19996/hall/bjorkglantan) och [handlarinloggning](http://127.0.0.1:19996/hall/bjorkglantan/login).
- [Strandviks bilhall](http://127.0.0.1:19996/hall/strandvik) och [handlarinloggning](http://127.0.0.1:19996/hall/strandvik/login).
- Öppna `%LOCALAPPDATA%\Omnira\WebStudio\kundadmin-prov\Testinloggning.txt` på Windows för körningens slumpade provkonton. Använd ett separat privat webbläsarfönster när du provar den andra handlaren.
- Välj **Ny annons**, lägg till ett till tre egna testfoton, välj **Spara utkast** och sedan **Förhandsgranska utkast**. Öppna bilhallen separat för att följa vad besökaren ser. **Publicera utkast** gör versionen synlig. Publicera ett nytt pris eller en såldmarkering och välj sedan en tidigare publicering under **Versionshistorik och återställning**.
- Välj **Sidan** i samma Kundadmin för att ändra rubrik, presentation, öppettider, telefon, e-post och besöksadress. Endast rubriken krävs. Spara och förhandsgranska utkastet för att se det tillsammans med hallens publicerade bilar. När du publicerar visas uppgifterna under **Om hallen**. De kan återställas eller tas bort från den publika hallen i versionshistoriken.
- Provet stänger efter två timmar. För att avsluta tidigare, kör `node apps/web/scripts/dealer-customer-pilot.mjs --stop`. Avslut tar bort den körningens provkonton, foton och testdata. Nästa start skapar ett nytt exempellager.

Om den första hallen redan används går det att starta en separat instans med `--serve --port 19997` när datorn har tillräckligt med ledigt minne. Öppna då [den separata handlarinloggningen](http://127.0.0.1:19997/hall/bjorkglantan/login). Provkonton för denna körning finns i `%LOCALAPPDATA%\Omnira\WebStudio\kundadmin-prov-19997\Testinloggning.txt`. Använd `--stop --port 19997` för att avsluta just den instansen.

## Atlas och handlarens webbplats

**Bilhandlarmall** fyller i en brief i Atlas Studio. Den nya versionen `premium-dealer-showroom-v2` använder handlarens namn, färg och valda visningsbilar i tre designförslag och i ZIP-exporten. Kunden ser samma katalogkomponent i provhallen och i sin privata förhandsvisning. Studio-planen och provhallens databas har separata livscykler. Operatören förser provhallen med dess startlager.

Provets visningsbilar har egna matchade illustrationer. Kundadmin omfattar bilannonser och siduppgifter i samma inloggning. Särskilt framtagen film och 3D kan beställas separat. Betalningsflödet för att aktivera Kundadmin återstår att prova. Fiktiva användare och provuppgifter används genomgående.

## Verifiera

```sh
node apps/web/scripts/dealer-customer-pilot.mjs --test
```

Körningen startar en separat lokal miljö, provar SQL-rättigheter och öppnar de riktiga gränssnitten i Chromium. Den tar bort sina egna behållare och sitt nätverk efter testet. SQL-förslaget ligger utanför skarpa migreringar.

- Endast aktuell publicering och dess foton är synliga för besökaren. Inloggning, aktiverat tillval och medlemskap i rätt hall kontrolleras för utkast och ändringar.
- En föråldrad redigering avvisas. Fordonsutkastet och nya bilder sparas i samma transaktion. De senaste 30 publiceringarna per fordon kan läsas i versionshistoriken.
- Hallens siduppgifter har en egen versionshistorik med de 30 senaste publiceringarna eller återställningarna. Sidans utkast och ett fordonsutkast förhandsgranskas var för sig. En opublicerad ändring i den ena redigeraren blir aldrig synlig via den andra.
- Proven omfattar felaktiga bildfiler, åtkomst mellan två handlare, en avstängd behörighet, fel avsändare vid formulärinlämning samt en utloggad session.
- I den första fordonspiloten (`51fdb5d`) tog körningen på Hultgren cirka 34 sekunder och de fyra webbläsarfallen passerade. När **Sidan** tillkom kördes fem webbläsarfall. [GitHubs isolerade körning](https://github.com/Bumbi190/ai-operating-platform/actions/runs/41613067798/job/125839889904) verifierade både bilannonser och siduppgifter, inklusive två samtidiga redigeringsflikar med JavaScript avstängt. Testtid och verklig leveranstid mäts separat.

Dessutom passerade 68 riktade tester för mallar och gränssnitt, det separata testet av mallknappen och webbprojektets TypeScript-kontroll. Den bredare allmänna Atlas-chattsviten gav samma tre kontraktsfel som i en separat arkiverad kopia av föregående commit `6b9c9e9`. De gäller händelsetyper i chattströmmen, avbrottssignaler och verktygsetiketter.
