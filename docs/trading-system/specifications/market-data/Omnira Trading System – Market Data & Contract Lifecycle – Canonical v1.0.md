# Omnira Trading System – Market Data & Contract Lifecycle

**Nivå:** Trading Core — marknadsdata och kontraktslivscykel
**Version:** Canonical v1.0
**Datum:** 2026-09-02
**Dokumentspråk:** Svenska (kod och identifierare på engelska)
**Status:** LÅST arkitektur. Prospektiv verkan.
**Föregångare:** Ingen. Detta är det första dokumentet i sitt slag.
**Källa:** Canonical Amendments v1.0, Beslut I
**Stänger:** GATE-08 delvis — arkitektur och kontraktslivscykel. Se §28.

> **Detta dokument är provider-neutralt.** Inga providernamn, inga endpointnamn,
> inga protokollnamn, ingen providerspecifik autentisering. Externa börsfakta är
> hämtade från CME:s publicerade material och märkta som sådana i §27.

---

## §1. Varför detta dokument finns

Strategin är låst i Strategy Specification Canonical v1.0. Den handlar NQ,
jämför mot ES och använder exakt två 4H-opens: 02:00 och 10:00
America/New_York.

Fram till nu har ingen kanonisk text sagt **vilket kontrakt** en bar tillhör,
**vem** som bestämmer när serien byter kontrakt, eller **vem** som äger
candlegränserna. Marknadsdatalagret har talat i canonical roots och medvetet
vägrat gissa resten. Det var rätt så länge policyn saknades.

Det här dokumentet levererar policyn.

Det gör fyra saker: det skiljer kontraktsidentitet från kontraktslivscykel, det
ger Omnira ensam auktoritet över candlegränser och rollover, det kräver att
varje strategikonsumerbar serie har entydig kontraktshärkomst, och det gör varje
kontraktsval till ett reproducerbart inspelat beslut.

## §2. Auktoritet

**MARKNADSDATA ÄR OBSERVATION, ALDRIG AUKTORITET.**

Ingenting i detta lager kan minta `RiskClearance`, `PropClearance`,
`ApprovalGrant` eller `ExecutionIntent`. En COMPLETE bar är bevis för att data
finns, inte för att något får handlas.

Omnira äger ensamt: vilken root som analyseras; vilket konkret kontrakt en root
motsvarar vid tidpunkt T; när serien byter kontrakt och vid exakt vilken instans;
var varje candlegräns går på varje timeframe; huruvida en bar är komplett.

En provider äger ensamt sina egna observationer. Provideridentitet registreras
som **provenance** och får aldrig definiera något i listan ovan.

## §3. Root-identitet

Den kanoniska root-vokabulären är **NQ / MNQ / ES**.

Nuvarande implementation representerar denna vokabulär som typen
`MarketInstrument`.

**Semantisk root-identitet är kanonisk. Fysiskt TypeScript-modulägarskap är det
inte.** `MarketInstrument` ligger i dag i `market-view/`, som är ett
presentationspaket. Detta dokument kräver **inte** att domänens root-typ
permanent bor där.

En senare implementationsfas får flytta eller extrahera root-vokabulären till ett
lägre provider-neutralt domänpaket om beroenderiktningen kräver det, och Market
View får då importera eller re-exportera samma typ.

**Ingen andra root-vokabulär får skapas.** Två uppsättningar rootnamn vore två
sanningskällor för samma sak, och det är exakt vad detta dokument finns för att
förhindra.

En root är **aldrig** ett kontrakt. Den identifierar en produkt, inte en löptid.

## §4. ContractCycle

```
ContractCycle = { year: number, quarterMonth: 3 | 6 | 9 | 12 }
```

De stödda produkterna använder kvartalscykeln mars/juni/september/december
(§27.1). Det är ett börsfaktum, inte ett Omnira-val. `quarterMonth` är begränsad
till de fyra värdena; en femte månad är ett typfel, inte ett körningsfel.

## §5. ResolvedContract — identitet

```
ResolvedContract = { root, cycle: ContractCycle }
```

**Likhet är strukturell och bygger på exakt dessa två fält.**

Ingen `expiration`, ingen `lastTradeAt`, ingen `rollEffectiveAt`, ingen
`calendarVersion`. De kan korrigeras av en auktoritativ kalenderrättelse utan
att det listade kontraktet blir ett annat kontrakt. Att lägga dem i identiteten
vore att göra en rättelse till ett identitetsbyte — alltså till en falsk
rollover.

**Ingen `exchange` ingår i v1.0.** Canonical v1.0 stödjer den slutna
root-mängden NQ / MNQ / ES. Dessa roots är entydiga med avseende på handelsplats
**inom denna räckvidd**, och därför ingår handelsplats inte i identiteten i v1.0.
**Att anta en root vars handelsplats är tvetydig kräver en explicit kanonisk
utvidgning INNAN den rooten tas in.** Providerobserverad `exchange` förblir
provenance och blir aldrig canonical identitet.

**Ingen ny branded id införs.** Identitet som värde kan inte glida isär; två
mintade id:n kan.

`ContractId` och `providerContractId` ligger kvar under providergränsen (§15).

## §6. ContractLifecycle

```
ContractLifecycle = {
  contract:           ResolvedContract
  lastTradeAt:        Timestamp
  finalSettlementRef: string
  rollEffectiveAt:    Timestamp
  calendarVersion:    string
}
```

**Dessa är konkreta kalenderfakta, aldrig härledda ur kvartalscykeln.** Se
§27.2: en publicerad löptid kan avvika från den normala konventionen på grund av
helgdag.

Ett livscykelfaktum får korrigeras. En identitet får inte.

## §7. ContractCalendar

`ContractCalendar` är **Omnira-ägd och versionerad** och innehåller konkreta
lagrade poster — inte en formel som utvärderas vid körning.

**Postens obligatoriska fält:** `contract`, `rollEffectiveAt`, `lastTradeAt`,
`finalSettlementRef`, handelsplats, samt den auktoritativa källreferens posten
härleddes ur.

**En post är OGILTIG tills samtliga obligatoriska fält finns.** En ogiltig post
tas inte in i kalenderversionen och besvarar ingen täckningsfråga. Vi använder
medvetet **inte** `Available<T>` här: den vokabulären tillhör
providerobservation (`provider/primitives.ts`), och en halvifylld kalenderpost
som resolverar men inte kan säga när kontraktet slutar handlas är exakt den tysta
gissning detta dokument finns för att ta bort.

**Inget livscykelfaktum härleds ur `quarterMonth` ensamt.**

### §7.1 Börsfaktum kontra Omnira-policy

Dessa två måste hållas isär, och sammanblandningen vore ett sakfel om Omnira
skrev den:

**BÖRSFAKTUM.** CME publicerar det *sedvanliga* U.S. Equity Index-rolldatumet som
måndagen före tredje fredagen i löptidsmånaden och använder det för lead
month-konvention och för vilken kontraktsmånad som listas under CME
Globex-sessionen. CME anger också att marknadsdeltagare får rulla när de vill.
**CME tvingar alltså inte varje position att rulla på det datumet.**

**OMNIRA-POLICY.** Omnira **antar** det lagrade CME-publicerade sedvanliga
rolldatumet som sin kanoniska serievalsgräns. Det är Omniras egen deterministiska
seriepolicy, inte en börsregel Omnira återger.

Konsekvensen av att hålla dem isär: policyn kan ändras av Omnira genom kanoniskt
beslut, medan börsfaktumet bara kan ändras av CME. En provider kan inte ändra
någondera.

### §7.2 Validering och täckning

Poster härleds ur och verifieras mot CME:s publicerade rollinformation. För U.S.
Equity Index-roots gäller valideringsregeln *måndagen före tredje fredagen i
löptidsmånaden* (§27.2). Den används när poster författas och granskas —
**aldrig som fallback vid körning**.

**Regeln är produktfamiljespecifik.** CME publicerar avvikande rolldatum för
andra produktfamiljer (§27.2). Att uttrycka regeln som universell vore att
kanonisera en slump.

**Ingen formel får åsidosätta ett CME-publicerat undantagsdatum.** Den konkreta
posten vinner alltid.

Saknas auktoritativ täckning för T:

```
resolve(root, T) → REFUSE
```

Ingen front month-algoritm. Ingen månadskodstolkning. Ingen
symbolprefix-heuristik. Ingen tyst matematisk fallback.

## §8. Roll effective instant

> **ROLL EFFECTIVE INSTANT** = öppningsinstansen för den CME Globex equity
> index-session vars tilldelade **CME trade date** är det auktoritativa
> rolldatumet.

Under normalt schema: rolldatum måndag ⇒ sessionen öppnar **söndag 18:00
America/New_York**, eftersom helg- och söndagskvällshandel tilldelas nästa
bankdags trade date (§27.3).

**`Måndag 18:00 ET` får inte kanoniseras** enbart för att rolldatumets
kalenderetikett lyder måndag. Det vore en hel session för sent.

Helg-, helgdags- och undantagssessioner löses genom `SessionCalendar` (§17),
aldrig genom veckodagsaritmetik.

**Varför sessionöppningen.** 18:00 ET är samtidigt en gräns i 1m-, 5m-, 15m- och
4H-rutnätet. En roll där betyder att **ingen bar på någon timeframe någonsin
innehåller två kontrakt**. En roll mitt i en bar skulle tillverka en FVG, en
displacement eller en swing som aldrig handlades.

## §9. ContractSelectionDecision

```
ContractSelectionDecision = {
  decisionId:       string
  root
  resolvedContract: ResolvedContract
  effectiveFrom:    Timestamp
  effectiveTo:      Timestamp | null
  policyVersion:    string
  calendarVersion:  string
  evidence:         readonly ContractEvidence[]
  reasons:          readonly Reason[]
  decidedAt:        Timestamp
}
```

Beslutet ska i efterhand kunna svara: **vilket** kontrakt, **varför**
(`policyVersion` + `reasons`), och **på vilket underlag** (`calendarVersion` +
`evidence`).

`evidence` får innehålla observerade fakta — providerns front month-etikett,
observerad volym, open interest. **Bevis, aldrig utlösare.** Ingen post i
`evidence` får ändra beslutet.

**Historiska beslut är oföränderliga.** Dagens kalender får aldrig omtolka ett
redan inspelat historiskt val.

## §10. Backtest utan tidigare beslut

Att beslut läses vid replay får inte innebära att äldre dataset utan beslut är
oanvändbara.

- Finns ett inspelat beslut: **läs det, räkna aldrig om.**
- Finns inget: anroparen **pinnar en explicit historisk `ContractCalendar`-
  version**; resolvern skapar ett nytt oföränderligt beslut ur den frusna
  versionen; körningen spelar in beslutet; senare kalenderversioner skriver
  aldrig om den körningen.
- **En körning utan pinnad version vägras.** En backtest som tyst använde
  "dagens kalender" vore inte reproducerbar i morgon.

## §11. Kanoniskt basrutnät — 1m

1m är kanonisk bas-timeframe. **Omnira definierar det förväntade 1m-rutnätet.**

En provider *får* leverera native 1m-candles; de är **observationer**. En
observation accepteras endast efter normalisering och validering mot Omniras
rutnät. Providerns tidsstämpelkonvention — open- eller close-stämplad, inklusiv
eller exklusiv, tidszon — normaliseras vid marknadsdatagränsen och ingen
annanstans.

Felaktig eller felinriktad native-bar **failar closed**. Den ombucketeras aldrig
tyst.

## §12. Härledda timeframes

5m, 15m och 4H härleds **endast** ur accepterade kanoniska 1m-observationer.
**Ingen provider-native 5m-, 15m- eller 4H-candle blir kanoniskt strategibevis
enbart för att en provider levererar den.** En sådan serie får senare behållas
som diagnostik- eller jämförelsedata; den är aldrig indata.

### §12.1 4H-rutnätet

Ankare: **18:00 America/New_York**.

```
18:00  22:00  02:00  06:00  10:00  14:00
```

Detta är det enda ankaret som innehåller strategins två låsta 4H-opens, 02:00 och
10:00 (Strategy Canonical v1.0 §6). Ett UTC-ankrat rutnät innehåller ingen av dem
i något av de två DST-lägena.

### §12.2 Session-trunkerad bucket

Dagens sista bucket är en **session-trunkerad 4H-bucket** som börjar 14:00 ET och
slutar vid sessionens stängning. Dess förväntade observationer bestäms av
`SessionCalendar` och kan utesluta schemalagda handelsstopp.

**Timeframe-etikett och väggklockslängd är inte synonymer vid en sessionsgräns.**

## §13. Kontraktsskopad dataförfrågan

> **ROOT-UPPLÖSNING SKER FÖRE VARJE PROVIDERVÄND KONKRET
> KONTRAKTSDATAFÖRFRÅGAN.**

Varje strategiauktoritativ historisk eller live-förfrågan mot en provider tar
emot ett **redan upplöst `ResolvedContract`** — aldrig en naken root.

**Ingen källa och ingen provider får internt avgöra `root → aktuellt
kontrakt`.**

Tre skilda kontrakt, med skilda roller:

| kontrakt | roll |
|---|---|
| `HistoricalCandleSource` | befintlig Stage 1.9B root-orienterad yta för chart- och historiknavigering. **Omskopad: aldrig strategiauktoritativ.** |
| `HistoricalContractCandleSource` | framtida provider-neutral konkret kontraktsskopad historikkälla |
| framtida live-källa | konkret kontraktsskopad, se §24 |

Ingen implementation ingår i detta dokument.

## §14. ContractCandleSegment

```
ContractCandleSegment = {
  contract:  ResolvedContract
  timeframe
  from:      Timestamp        // inklusiv
  to:        Timestamp        // exklusiv
  candles:   readonly MarketCandle[]
}
```

**Ett segment = ett `ResolvedContract`.** Varje strategikonsumerbar candlesekvens
har entydig kontraktshärkomst, och **en sekvens får aldrig tyst korsa en
rollgräns**.

Korsar ett begärt root-fönster en rollover ska marknadsdatalagret:

1. lösa upp de relevanta kalenderintervallen
2. utfärda separata konkreta kontraktsförfrågningar
3. behålla gränsen mellan de returnerade segmenten

**En detektor tar aldrig emot en sammanfogad kontraktsöverskridande sekvens.**

Kontraktet bärs av kuvertet, inte av varje candle. Detta dokument ålägger
**inte** implementationen att lägga `ResolvedContract` på varje befintlig
`MarketCandle`: det skulle upprepa ett värde över tusentals barer och ändra
`mergeOlderCandles`, som jämför candles **på värde** för att avgöra
`DUPLICATE_DISAGREEMENT`. Segmentkuvertet är den godkända arkitekturen.

## §15. Providersymbolgränsen

Providersymboler, `providerContractId` och `ContractId` ligger under
providergränsen och blir aldrig canonical identitet. En providers front
month-etikett registreras som provenance i `evidence` och når aldrig resolvern.

## §16. Candlesemantik

- Barer nycklas på **öppningsinstans** (`openTime`), aldrig på stängning.
- Intervall är **halvöppet** `[open, open + period)`.
- Dubbletter och ordningsfel avgörs av det befintliga
  `mergeOlderCandles`-kontraktet: identisk dubblett de-dupliceras, oenig dubblett
  vägrar med `DUPLICATE_DISAGREEMENT`, icke-stigande indata vägrar med
  `UNORDERED_INPUT`. Ingen ny regel införs.
- En sen korrigering av en redan konsumerad bar skapar en ny observation och får
  **aldrig** retroaktivt ändra ett inspelat beslut.

## §17. SessionCalendar

`SessionCalendar` är **Omnira-ägd och versionerad**, hämtad ur auktoritativ
CME-information om handelstider och helgdagar.

Den modellerar normala sessioner, underhållsfönster, schemalagda
intradagshandelsstopp, helgdagar, förkortade sessioner och undantagssessioner,
och den svarar på täckningsfrågor.

**Saknas auktoritativ täckning ⇒ UNKNOWN.** Aldrig ett antagande.

Konkreta års- och sessionsdatum är en **versionerad operativ dataartefakt** och
skrivs inte in i denna kanoniska text. Textens uppgift är policyn; datat har sin
egen version och sin egen integritetskontroll.

## §18. BarCompleteness

```
BAR_COMPLETENESS = ['COMPLETE', 'PARTIAL', 'UNKNOWN']
```

Definierat mot `SessionCalendar.expectedTradingMinutes(bucketInterval)` — aldrig
mot förfluten väggklockstid.

| tillstånd | betydelse |
|---|---|
| `COMPLETE` | varje förväntad konstituerande observation finns och är accepterad |
| `PARTIAL`  | en eller flera förväntade handelsobservationer saknas eller är ogiltiga |
| `UNKNOWN`  | kalendertäckning eller källtillstånd räcker inte för att veta |

En schemalagd stängd eller stoppad minut är **förväntad frånvaro**, inte saknad
data.

**`BAR_COMPLETENESS` svarar på DATATÄCKNING.** Den svarar **inte** på huruvida en
bucket sträckte sig över hela sin nominella timeframe-längd. Se §19.

Den är inte en synonym till `HISTORY_COMPLETENESS`
(`COMPLETE | TRUNCATED | UNKNOWN`), som beskriver ett fönster kapat i en ände. En
bucket kan vara både sessionstrunkerad och komplett; de två frågorna är olika.

**Ingen detektor tar emot en icke-COMPLETE bar som fullbordat bevis.**

### §18.1 Tom förväntansmängd

Om `SessionCalendar.expectedTradingMinutes(bucket)` är **tom** emitteras **ingen
kanonisk candle** för den bucketen.

Den får **inte** bli `COMPLETE` på grunden att "varje medlem i den tomma
förväntansmängden fanns".

Ingen syntetisk flat candle. Ingen nollvolymplatshållare. Ingen kopierad
föregående stängning. **Förväntad frånvaro förblir frånvaro.**

## §19. Nominell kontra effektiv bucket

Två fakta hålls isär och båda är maskinläsbara:

| faktum | representation |
|---|---|
| `nominalTo`        | får härledas: `openTime + nominell timeframe-längd` |
| `effectiveTo`      | **lagras** — sessionsbegränsad slutinstans |
| `sessionTruncated` | får härledas: `effectiveTo < nominalTo` |
| `completeness`     | **lagras** — se §18 |

Två lagrade fakta, ingen ny enum, ingen andra sanningskälla.

En förkortad handelsdag kan ge en bucket där varje förväntad minut 10:00→13:00
finns — äkta `COMPLETE` datatäckning — som ändå är **session-trunkerad**. De två
fakta får aldrig slås ihop till ett enda tillstånd.

## §20. Strategirelevanta 4H-buckets

Strategins två kanoniska 4H-opens är **02:00** och **10:00** America/New_York.

För dessa två krävs för fullbordat kanoniskt 4H-strategibevis **båda**:

```
completeness === 'COMPLETE'      OCH      effectiveTo === nominalTo
02:00 nominell slut = 06:00               10:00 nominell slut = 14:00
```

Trunkerar en helgdag eller ett undantagsschema en av dem före dess nominella
slut, får den förbli giltig **marknadsdata** för den förkortade sessionen men
**får inte levereras som fullbordat 4H-strategibevis**. Fail closed.

Dagens ordinarie sista bucket, 14:00 → sessionens stängning, omfattas inte: den
är inte en av strategins två kanoniska opens och förblir en session-trunkerad
4H-bucket för display och research.

**Detta är enbart en marknadsdataförutsättning.** Ingen detektionsregel
omdefinieras: iFVG, CISD, SMT-divergens och equal-high/low-tolerans förblir
öppna gates och berörs inte.

## §21. Continuous contracts

| användning | policy |
|---|---|
| execution | **FÖRBJUDET** |
| strategidetektion | **FÖRBJUDET** |
| SMT | **FÖRBJUDET** |
| chart | `DISPLAY_ONLY` — sammanfogad serie med explicit utmärkt rollgräns |
| research | `RESEARCH_ONLY` — aldrig underlag för ett inspelat live- eller strategibeslut |

Skälet är strategispecifikt. Strategin läser FVG:er, liquidity-nivåer, equal
highs/lows, swings och SMT — samtliga **absoluta prisstrukturer**.
Back-adjustment förskjuter historiska priser med rollspreaden, **tillverkar** en
FVG vid justeringen och **raderar** verkliga nivåer. För SMT är det värre: NQ och
ES justeras med olika spreadar och förskjuts relativt varandra.

**Ingen justeringsalgoritm får tyst bli kanoniskt strategiunderlag.**

## §22. NQ / MNQ / ES

De tre är **skilda produkter**. Dokumentet påstår aldrig att de är samma
kontrakt.

De delar rollgräns: alla tre är U.S. Equity Index-roots under samma sedvanliga
CME-rollkonvention, så **en** marknadsfamiljs rollgräns tillämpas på alla tre —
men varje val förblir root-specifikt och ger ett eget `ResolvedContract` och ett
eget inspelat beslut.

- **NQ ↔ MNQ:** samma `ContractCycle` krävs för analys/execution-substitution.
- **NQ ↔ ES:** samma `ContractCycle` krävs för SMT.

## §23. SMT — marknadsdataförutsättningar

Detta avsnitt definierar **inte** SMT-detektion. GATE-04 förblir öppen.

1. båda benen upplösta till konkreta kontrakt med **samma `ContractCycle`**
2. samma kanoniska timeframe
3. identiskt `[from, to)`
4. `COMPLETE` på båda benen
5. ingen rollgräns inuti något av de jämförda fönstren

Vid brist på någon förutsättning: **`SMT = UNKNOWN`**.

`UNKNOWN` är inte `FALSE`. SMT kan bara lyfta A till A+ och kan aldrig skapa en
trade (Strategy Canonical v1.0, Kapitel 3). **SMT fabriceras aldrig.**

## §24. Historisk kontra live

`HistoricalCandleSource` (root-orienterad, chart/navigering, §13),
`HistoricalContractCandleSource` (kontraktsskopad, strategiauktoritativ) och en
framtida live-källa är **skilda kontrakt**.

**En live-prenumeration sker mot ett `ResolvedContract`, aldrig mot en root.**
Vid rollover: gammal konkret kontraktsström → **explicit gräns** → ny konkret
kontraktsström. Ingen dold provider-front-month-följning. **Ingen provider får
tyst byta det prenumererade kontraktet bakom en oförändrad canonical root.**

Gemensamt: `MarketCandle`, `ResolvedContract`, `ContractSelectionDecision`,
`ContractCandleSegment`, `BarCompleteness`, freshness/provenance,
timeframe-regler.

Inte gemensamt: paginering, uttömning, prenumerationslivscykel, backpressure.

Ett symmetriskt gemensamt gränssnitt är förbjudet: det skulle ge live-källan en
`loadBefore` den inte kan hålla och historikkällan en prenumeration den inte kan
leverera.

## §25. Fail-closed

| situation | svar |
|---|---|
| kalendern saknar täckning för T | `REFUSE` |
| kalenderpost saknar obligatoriskt livscykelfaktum | posten är ogiltig; ingen täckning; `REFUSE` |
| providern returnerar okänt kontrakt | observationen behålls, instrumentattribut `UNAVAILABLE`, inget attribueras |
| providern anger front month utan underlag | provenance, når aldrig resolvern |
| förväntad handelsminut saknas | `BAR_COMPLETENESS = PARTIAL` |
| kalendern kan inte avgöra om frånvaron var schemalagd | `BAR_COMPLETENESS = UNKNOWN` |
| tom förväntansmängd | ingen candle emitteras (§18.1) |
| 02:00/10:00-bucket trunkerad före nominellt slut | giltig marknadsdata, **inte** 4H-strategibevis (§20) |
| SMT-förutsättning brister | `SMT = UNKNOWN` |
| fönster spänner över en roll | kontraktsavgränsade segment (§14) |
| backtest utan pinnad kalenderversion | `REFUSE` (§10) |

## §26. Omstart och återhämtning

Upplösning är en **ren funktion** av (`calendarVersion`, tidpunkt). En omstart
räknar därför fram exakt samma svar.

Redan inspelade beslut läses, aldrig räknas om. En senare kalenderversion får
inte skriva om historien.

## §27. Externa börsfakta

Fakta i detta avsnitt kommer från CME:s publicerade material. De är **börsfakta,
inte Omnira-beslut**, och ska verifieras på nytt om CME ändrar dem.

**§27.1 Kvartalscykel.** E-mini och Micro E-mini equity index futures listas på
kvartalscykeln mars/juni/september/december.

**§27.2 Rolldatum och löptid.** CME publicerar det sedvanliga U.S. Equity
Index-rolldatumet som måndagen före tredje fredagen i löptidsmånaden, och
rolldatumet avgör vilken kontraktsmånad som listas för handel under CME
Globex-sessionen. Efter rolldatumet identifieras normalt näst närmaste löptid som
*lead month*. **Marknadsdeltagare får rulla när de vill; det publicerade datumet
är en konvention, inte ett tvång.** Omniras antagande av det som serievalsgräns
är en Omnira-policy (§7.1).

**Regeln är produktfamiljespecifik** — CME publicerar avvikande rolldatum för
andra produktfamiljer.

Final settlement följer **normalt** den publicerade konventionen, men **helgdagar
och undantagsscheman kan flytta det konkreta terminerings- eller
settlementdatumet**. CME:s publicerade tabell för 2026 anger löptid **2026-06-18
(torsdag)** för juni-cykeln, medan månadens tredje fredag är 2026-06-19 — en
amerikansk federal helgdag. Övriga tre 2026-cykler infaller på tredje fredagen.

**Den konkreta publicerade posten är auktoritativ; ingen formel får åsidosätta
den.** Detta dokument återger de fyra 2026-raderna enbart som källbevis för den
regeln — de utgör **inte** den operativa kalenderdatamängden, som lever som
versionerad artefakt enligt §7 och §17.

**§27.3 Trade date.** All helg- och helgdagshandel från fredag kväll till söndag
kväll tilldelas nästa bankdags trade date.

**§27.4 Handelstider.** Equity index futures handlas söndag–fredag 18:00–17:00 ET
med dagligt underhållsfönster 17:00–18:00 ET och dagligt handelsstopp
16:15–16:30 ET.

**§27.5 Oplanerad helgdag.** Om en oplanerad marknadshelgdag utlyses den dag då
final settlement price fastställs upphör handeln i det förfallande kontraktet vid
NYSE:s stängning närmast föregående bankdag.

**§27.6 DST.** Samtliga amerikanska DST-övergångar 2024–2030 infaller söndag inom
helgstängningen (fredag 17:00 ET → söndag 18:00 ET). Ingen live-bar korsar därmed
en övergång. **Koden får ändå inte förlita sig på detta** — det är en egenskap
hos nuvarande schema, inte hos konstruktionen.

## §28. Vad detta dokument INTE gör

- Det **stänger inte GATE-08 helt.** GATE-08 är **DELVIS STÄNGD**: arkitektur och
  kontraktslivscykel stängs här, medan operativt providerval, licensiering och
  CME-avgiftsklassificering, operativ population av `ContractCalendar` och
  `SessionCalendar` samt providerspecifikt live-flöde kvarstår öppna. Se
  `reviews/Open Implementation Gates v1.0.md`.
- Det väljer **ingen** marknadsdataprovider och kanoniserar **ingen** CME-avgift.
- Det ändrar **inte** Strategy Specification Canonical v1.0. Strategireglerna är
  oförändrade; detta dokument levererar de marknadsdataförutsättningar de kräver.
- Det ändrar **inte** Execution Provider Adapter Canonical v1.2. Det kontraktet
  definierar resolutions*typer*; detta dokument definierar resolutions*policy*,
  och v1.2 §7.1 förutser uttryckligen att en låst seriepolicy kan existera.
- Det stänger **inte** GATE-01, GATE-02, GATE-03, GATE-04, GATE-06, GATE-07,
  GATE-09, GATE-12, GATE-13, GATE-14 eller GATE-17.
- Det kräver **ingen** fysisk modulplacering av root-typen (§3).
- Det innehåller **ingen** implementation, ingen provider, inget nätverk och
  ingen order.
