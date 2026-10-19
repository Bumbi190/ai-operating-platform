# Omnira – först till riktiga NQ/ES-priser, utan kostnadsöverraskning

**Datum:** 2026-10-19  
**Status:** konto och offert väntar på användaren. **Inga verkliga historiska prisdata har ännu hämtats.**  
**Research branch:** `research/trading-databento-free-metadata-20261019`

## Verifierad leverantörsriktning

Databento **Historical Usage-based**, `GLBX.MDP3`, `ohlcv-1m`, exakt ett datum **2026-10-15 00:00:00Z → 2026-10-16 00:00:00Z**. Vi avser att läsa två enskilda terminer: **NQZ6** och **ESZ6** som *kandidatsymboler*, inte antagna instrument-ID. `symbology.resolve` måste verifiera båda för hela datumet; fel, periodskifte eller flera matchningar blockerar offertrutinen.

**Historisk 1m-data är pay-as-you-go utan månatlig Standard-plan.** Databento annonserar upp till **125 USD** i startkrediter till nya berättigade konton, men vi har inte verifierat vad som faktiskt är aktivt för användaren. Databento anger att separata börslicensavgifter normalt inte krävs för historisk **T+1** data; fortfarande krävs efterlevnad av leverantörens faktiska användnings- och distributionsvillkor, särskilt vid eventuell framtida kommersiell/extern användning av Omnira.

Källor:
- https://databento.com/pricing/
- https://databento.com/docs/api-reference-historical
- https://databento.com/docs/standards-and-conventions/symbology
- https://databento.com/docs/portal
- https://databento.com/blog/introduction-market-data-licensing

## Säker källkoppling – två kostnadsfria anropstyper

`scripts/trading/research/databento-free-metadata-only.mjs` använder ENDAST:
- `GET https://hist.databento.com/v0/symbology.resolve` med en explicit råsymbol och historisk dag (metadata, gratis).
- `GET https://hist.databento.com/v0/metadata.get_cost` för `GLBX.MDP3` / `ohlcv-1m` och samma dag och symbol (prisförfrågan, gratis).

Följande finns uttryckligen **inte**: `timeseries.get_range`, `batch.submit_job`, datahämtning, kontoköp, brokerorder eller aktivering av liveflöde.

**Standard är `--dry-run` och kräver ingen API-nyckel.** Ett uttryckligt `--metadata-only` kräver en befintlig lokal `DATABENTO_API_KEY`; nyckeln skrivs aldrig i JSON, loggar eller filer av verktyget. API-svaret redovisar bara symbol, instrument-ID och prisestimat i USD, och `downloadAuthorized:false`. Ingen kostnad får beskrivas som verifierad förrän ett **riktigt** kontos metadata har svarat.

**Lokal Windows-säkerhet:** `Quote_Databento_Free.ps1` frågar efter API-nyckeln i en dold `SecureString`-prompt, exporterar den endast till Node-barnprocessen och raderar miljövariabeln efteråt. Den sparas varken i repot, en `.env` eller ett dokument. `Start_Databento_Free_Quote.cmd` kan dubbelklickas. Skicka inte nyckeln i chatten eller på en bild.

## Testbevis och verkligt hinder

- **10/10 offline Node-tester passerade** på stationära Windows-datorn, med injicerade mockade metadatasvar. De kontrollerar strikt endpoint-allowlist, 24-timmarsfönster, symbolidentitet, entitlements/mapping-failures, prisformat, blockerad underliggande källväg och ingen credentials-loggning.
- `--dry-run` kördes: `status = METADATA_READY_NEEDS_ACCOUNT`, `actualQuotesUSD = null`, `contractMappingsVerified = false`.
- Det finns **ingen** `DATABENTO_API_KEY` i stationärens process-, user- eller machine-env per 2026-10-19.
- Ingen autentiserad `symbology.resolve` eller `metadata.get_cost` har ännu körts, så **riktig offert saknas**. Ingen data har köpts/hämtats, och ingen verklig backtest har körts.

## Stegen efter att användaren skapat/anslutit konto

1. Kontrollera kontostatus och Usage-based Historical i https://databento.com/portal. Välj inte Standard 199 USD/mån för en enkel historikimport.
2. Skapa/lokalisera API-nyckel lokalt på Windows. Mata in den **endast** i den säkra prompten från `Start_Databento_Free_Quote.cmd`.
3. Läsa metadataresultaten: båda symbolerna korrekt mappade, faktiskt estimerat pris per instrument och total USD. Kontrollera eventuella faktiska kontokrediter separat på Databentos Billing/Usage.
4. **Stopp för nytt godkännande:** innan `timeseries.get_range` eller `batch.submit_job`, få uttryckligt användargodkännande för exakt datum, kontrakt, pris och en maxbudget. Kontrollera Terms of Service för privat vs kommersiellt användningsfall. Beteckningen T+1 tar inte bort andra leverantörsvillkor.
5. Första riktiga dataleveransen: välj godkänd historisk batch eller streaming, spara originalbytes + SHA256, DBN-format och schema, kontraktsmetadata, versionsinformation, och granska kalender-/C3C-validering. Här måste en separat, granskningsbar importkomponent först utvecklas – denna metadata-probe är **inte en importadapter**.
6. GATE-01–04 och real backtest/entry/exit-reglerna är fortfarande ofullständiga. Ingen riktig tradingstatistik får uppges innan de är godkända och historiska affärer har bedömts korrekt.

## Kör från repo-roten

```powershell
node scripts/trading/research/databento-free-metadata-only.mjs --dry-run

# Efter att konto och nyckel finns: den lokala Windows-prompten används
# och nyckeln skrivs inte till konsol eller repo.
```

**Grenstatus:** rent researchjobb, ingen PR/merge/CI, ingen prod och ingen betald API-förfrågan.
