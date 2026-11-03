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
- Provet stänger efter två timmar. För att avsluta tidigare, kör `node apps/web/scripts/dealer-customer-pilot.mjs --stop`. Avslut tar bort den körningens provkonton, foton och testdata. Nästa start skapar ett nytt exempellager.

## Atlas och handlarens webbplats

**Bilhandlarmall** fyller i en brief i Atlas Studio. Den nya versionen `premium-dealer-showroom-v2` använder handlarens namn, färg och valda visningsbilar i tre designförslag och i ZIP-exporten. Kunden ser samma katalogkomponent i provhallen och i sin privata förhandsvisning. Studio-planen och provhallens databas har separata livscykler. Operatören förser provhallen med dess startlager.

Provets visningsbilar har egna matchade illustrationer. Särskilt framtagen film, 3D, kundens texter och öppettider samt betalning för att aktivera tillvalet återstår som separata funktioner. Fiktiva användare och provuppgifter används genomgående.

## Verifiera

```sh
node apps/web/scripts/dealer-customer-pilot.mjs --test
```

Körningen startar en separat lokal miljö, provar SQL-rättigheter och öppnar de riktiga gränssnitten i Chromium. Den tar bort sina egna behållare och sitt nätverk efter testet. SQL-förslaget ligger utanför skarpa migreringar.

- Endast aktuell publicering och dess foton är synliga för besökaren. Inloggning, aktiverat tillval och medlemskap i rätt hall kontrolleras för utkast och ändringar.
- En föråldrad redigering avvisas. Fordonsutkastet och nya bilder sparas i samma transaktion. De senaste 30 publiceringarna per fordon kan läsas i versionshistoriken.
- Proven omfattar felaktiga bildfiler, åtkomst mellan två handlare, en avstängd behörighet, fel avsändare vid formulärinlämning samt en utloggad session.
- Den kontrollerade körningen på Hultgren den 3 november 2026 tog cirka 34 sekunder från start till stängd testmiljö. Alla fyra webbläsarfallen passerade. Detta är testtid. Arbetstid och driftkostnad för en verklig kundleverans behöver mätas separat.

Dessutom passerade 68 riktade tester för mallar och gränssnitt, det separata testet av mallknappen och webbprojektets TypeScript-kontroll. Den bredare allmänna Atlas-chattsviten gav samma tre kontraktsfel som i en separat arkiverad kopia av föregående commit `6b9c9e9`. De gäller händelsetyper i chattströmmen, avbrottssignaler och verktygsetiketter.
