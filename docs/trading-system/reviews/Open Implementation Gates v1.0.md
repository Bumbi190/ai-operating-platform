# Open Implementation Gates – Canonical v1.0

**Dokument:** Omnira Trading System – Open Implementation Gates
**Version:** v1.0
**Datum:** 2026-08-27
**Status:** Aktiv. Ska konsulteras före varje fasstart.
**Senast uppdaterad:** 2026-08-28 — GATE-15 och GATE-16 STÄNGDA efter Beslut E.
GATE-15, GATE-16 och GATE-17 tillades tidigare samma dag efter Beslut D
(futures-native execution). GATE-08 och GATE-09 fick förtydligat scope i stället för nya
duplicerande gates. GATE-05, GATE-10 och GATE-11 stängdes 2026-08-27.

---

## Syfte

Detta dokument listar allt som ännu **inte** är låst i Omnira Trading System, och
exakt vilken fas respektive öppen fråga blockerar.

Två saker är lika viktiga:

1. Ingen av dessa frågor får besvaras genom gissning inne i koden.
2. **Ingen av dessa frågor blockerar Fas 1.**

En öppen detalj för Fas 9 är inte ett skäl att inte påbörja Fas 1. Syftet med
klassificeringen är att göra just den skillnaden explicit.

---

## Klassificering

| Klass | Innebörd |
|---|---|
| `BLOCKS FAS 1` | Måste lösas innan Trading Core får byggas |
| `BLOCKS STRATEGY ENGINE` | Måste lösas innan Fas 3 Strategy Engine |
| `BLOCKS EXECUTION` | Måste lösas innan någon execution-enabled mode |
| `BLOCKS PROP MODE` | Måste lösas innan Fas 9 Prop Firm Mode |
| `BLOCKS LIVE` | Måste lösas innan Fas 10 Controlled Live |
| `DEFERRED` | Blockerar ingen nu planerad fas |
| `BLOCKS FAS 2 IMPLEMENTATION` | Blockerar connectivity-kod och connectivity proof, **inte** utrednings- och designarbetet som krävs för att stänga gaten |
| `STÄNGD` | Explicit canonical beslut fattat, se `Canonical Amendments v1.0.md` |

---

## Sammanfattning

| Gate | Fråga | Klass |
|---|---|---|
| GATE-01 | Deterministisk iFVG-detektion | BLOCKS STRATEGY ENGINE |
| GATE-02 | Deterministisk CISD-detektion | BLOCKS STRATEGY ENGINE |
| GATE-03 | Equal-high / equal-low-tolerans | BLOCKS STRATEGY ENGINE |
| GATE-04 | SMT correspondence- och timingregler | BLOCKS STRATEGY ENGINE |
| ~~GATE-05~~ | ~~London window-close / break-even-tvetydighet~~ | **STÄNGD 2026-08-27** |
| GATE-06 | Val av news-provider | BLOCKS EXECUTION |
| GATE-07 | High-impact USD-klassificering och providermappning | BLOCKS EXECUTION |
| GATE-08 | Val av realtids-marknadsdataprovider | BLOCKS STRATEGY ENGINE |
| GATE-09 | Första faktiska PropFirmProfile | BLOCKS PROP MODE |
| ~~GATE-10~~ | ~~Daily-loss force close-semantik~~ | **STÄNGD 2026-08-27** |
| ~~GATE-11~~ | ~~Reserved risk-semantik vid flera positioner~~ | **STÄNGD 2026-08-27** |
| GATE-12 | Execution safety margin- och slippagemodell | BLOCKS EXECUTION |
| GATE-13 | Exakta promotion thresholds | BLOCKS LIVE |
| GATE-14 | Exakta live safety policies | BLOCKS LIVE |
| ~~GATE-15~~ | ~~Val av futures execution provider~~ | **STÄNGD 2026-08-28** |
| ~~GATE-16~~ | ~~Execution Provider Adapter-kontrakt~~ | **STÄNGD 2026-08-28** |
| GATE-17 | Execution runtime- och deploymenttopologi | BLOCKS EXECUTION |

**Antal öppna gates: 12.** Tre stängdes 2026-08-27, tre tillkom och två stängdes 2026-08-28.

**Antal som blockerar Fas 1: 0.**
**Antal som blockerar Fas 2:s implementation: 0.**

> **Ändring 2026-08-28.** Fas 2 var tidigare ogrindad eftersom plattformen felaktigt
> antogs vara MetaTrader 5. Med en provider-neutral arkitektur kan read-only-connectivity
> inte bevisas mot en provider som inte är vald. Fas 1 är fortsatt ogrindad och oförändrad.
>
> **Stängda 2026-08-28 genom Beslut E.** Provider vald och adapterkontrakt låst.
> Fas 2 är därmed **inte längre grindad**. Kvarvarande arbete inför Fas 2 är
> implementationsförberedelse — dev kit-begäran, Rithmic Test-access — inte gates.

De elva kvarvarande är samtliga medvetet uppskjutna detaljspecifikationer. Ingen av dem är
en defekt i den låsta regelmängden — den distinktionen är avgörande och behandlas i
*Canonical Review v1.0* avsnitt 6.

---

## GATE-01 — Deterministisk iFVG-detektion

**Klass:** BLOCKS STRATEGY ENGINE

Strategy Specification §14 låser iFVG:s *roll* som entry-confirmation men skjuter
uttryckligen upp dess programmeringsdefinition: den ska dokumenteras som en separat
deterministisk detection rule innan Strategy Engine implementeras.

Kapitel 3 upprepar kravet och anger konsekvensen om det ignoreras: om iFVG definieras
på ett sätt i backtest och ett annat sätt live har vi i praktiken två olika strategier.

Kapitel 2 och Kapitel 17 ställer samma krav.

**Krav för att stänga:** en machine-readable detection rule som ger identiskt utfall i
backtest, replay och live. Ingen AI-modell får tolka vad som "ser ut som" en iFVG.

**Leverans:** `specifications/pattern-detection/`

---

## GATE-02 — Deterministisk CISD-detektion

**Klass:** BLOCKS STRATEGY ENGINE

Identiskt läge som GATE-01. CISD är dessutom ensam grund för grade C, som i canonical
grundkonfiguration är en tradebar grade. En oprecis CISD-definition påverkar därför
direkt vilka trades systemet tar, inte bara hur de klassificeras.

**Leverans:** `specifications/pattern-detection/`

---

## GATE-03 — Equal-high / equal-low-tolerans

**Klass:** BLOCKS STRATEGY ENGINE

Strategy Specification §8 listar `equal highs` och `equal lows` som giltig 5–15m
liquidity. Ingen tolerans är definierad någonstans i materialet.

I praktiken är två highs sällan exakt lika på tick-nivå. Utan en uttalad tolerans —
i ticks, punkter eller ATR-andel — är regeln inte implementerbar, och två
implementationer kommer att identifiera olika liquidity-nivåer ur samma data.

Kapitel 20 listar posten som kvarvarande specification.

**Krav för att stänga:** toleransens enhet, värde och versionsstyrning.

---

## GATE-04 — SMT correspondence- och timingregler

**Klass:** BLOCKS STRATEGY ENGINE
**Omfattning:** grade-fidelity, inte tradebarhet

Materialet låser SMT:s roll väl: NQ mot ES, analys på 1m/5m/15m, SMT föreligger när
ett instrument tar relevant liquidity medan det andra inte gör det, SMT är aldrig
obligatorisk, SMT kan endast höja A till A+, och `SMT = UNKNOWN` hanteras explicit.

Det som saknas är korrespondensen: **vilken** swing på NQ som motsvarar **vilken**
swing på ES, och inom vilket tidsfönster divergensen ska mätas.

**Viktig avgränsning:** eftersom samtliga grades A+/A/B/C är tradebara i canonical
grundkonfiguration ändrar en oprecis SMT-definition inte *om* en trade tas — bara
vilken grade den får. Konsekvensen träffar därför grade-analytiken, inte
orderflödet. Gaten ska ändå stängas före Fas 3, annars blir grade-statistiken
obrukbar som beslutsunderlag för framtida minimum-grade-tester.

---

## ~~GATE-05~~ — London window-close och break-even

**Status: STÄNGD 2026-08-27**

Canonical beslut:

```
London-position fortfarande öppen 05:00 America/New_York
→ SL = entry price
```

Gäller även om den swing-baserade triggern i §21 ännu inte har inträffat. Positionen
fortsätter därefter. Ingen fyratimmarsgräns tillkommer för London. Har swing-triggern
redan flyttat SL till entry price är window-close-triggern en no-op.

Registrerat som CLOSED-03 i strategispecifikationen, infört i §21.1, §31 och Kapitel 3,
journalfört via `be_trigger_type = SWING | WINDOW_CLOSE`, och täckt av forward
test-kriterier i Kapitel 11.

Se `Canonical Amendments v1.0.md` avsnitt A1–A8.

---

## GATE-06 — Val av news-provider

**Klass:** BLOCKS EXECUTION

Strategins news-regel är canonical och hård: inga nya entries T-1h till T+4h, och
befintlig position stängs T-15m före relevant high-impact USD-event.

Ingen leverantör av ekonomisk kalender är vald. Kapitel 20 listar "första news-data
provider" som kvarvarande specification.

Risk Engine Specification v0.1 §35 och Kapitel 3 anger redan rätt beteende när
news-data saknas eller är stale: `DENY` i execution-enabled modes,
`NEWS_STATE_UNKNOWN` med varning i analysläge. Fail-closed-beteendet är alltså låst —
det är **källan** som saknas.

**Konsekvens:** analys och backtest på historisk kalenderdata kan påbörjas. Ingen
execution-enabled mode får aktiveras utan vald och verifierad provider.

---

## GATE-07 — High-impact USD-klassificering och providermappning

**Klass:** BLOCKS EXECUTION

Följdfråga till GATE-06. Strategin talar om "relevant high-impact USD-news" och
namnger FOMC, CPI och NFP som exempel.

Två saker saknas:

1. Den uttömmande definitionen av vilka event som räknas som high-impact USD.
2. Mappningen från den valda providerns egna impact-fält till Omniras klassificering.

Utan (2) blir regeln beroende av en tredjepartsleverantörs interna märkning, som kan
ändras utan förvarning.

**Krav för att stänga:** versionsstyrd eventklassificering plus explicit mappningstabell.

---

## GATE-08 — Val av realtids-marknadsdataprovider och kontraktsserie

**Klass:** BLOCKS STRATEGY ENGINE

> **Kvarstår öppen efter Beslut E.** Rithmic kan tekniskt leverera market- och
> referensdata, men Omniras canonical market data-, rollover- och licensieringsbeslut är
> fortfarande separat. Execution provider **behöver inte** vara market data-provider.
> Ingen aktuell CME-avgift canonicaliseras utan verifiering mot gällande officiell
> avgiftskategori för Omniras faktiska användningsfall.
>
> **Scope förtydligat 2026-08-28.** GATE-08 omfattar även **contract rollover och
> kontraktsserie-policy** för futures. Rollover är en marknadsdata- och
> kontraktsseriefråga: vilket kontrakt en bar tillhör och hur serien fogas ihop.
> Konceptet finns redan i Kapitel 6, 10 och 15; det är policyn som är uppskjuten.
> Ingen separat rollover-gate har skapats — det hade bara duplicerat denna.
> Adaptern översätter instrument till providerns kontraktsidentitet
> (Systemarkitektur v0.3 §22.1), men *vilket* kontrakt som är aktuellt avgörs här.

Kapitel 6 anger i sitt statusblock: **Realtime provider: Ej slutligt vald.**

Arkitekturen är däremot redan rätt byggd för detta — Kapitel 6 fastslår att Strategy
Engine aldrig ska tala direkt med externa providers, utan konsumera en normaliserad
intern datamodell oavsett vilken godkänd provider som levererar. Providerbytet är
därmed isolerat.

**Konsekvens:** Fas 1 och Fas 2 påverkas inte. Historisk backtest kan köras på
befintlig historisk data. Realtidsdrift kräver valet.

---

## GATE-09 — Första faktiska PropFirmProfile

**Klass:** BLOCKS PROP MODE

> **Kvarstår öppen efter Beslut E.** Valet av Rithmic förbättrar anpassningen mot
> funded-futures-ekosystemet men bevisar **inte** specifik prop firm-API-access,
> automationstillstånd, kontokompatibilitet eller kommersiella villkor. Första
> PropFirmProfile är fortfarande olöst.
>
> **Scope förtydligat 2026-08-28.** GATE-09 omfattar även **kompatibilitet mellan vald
> futures execution provider och vald prop firm**. Vilka providers en prop firm tillåter,
> och vilka konton som går att nå, är en del av att välja den första faktiska profilen.
> Ingen separat providerkompatibilitets-gate har skapats — det hade bara duplicerat denna.
> Interagerar med GATE-15.

Kapitel 12 fastslår att den första faktiska `PropFirmProfile` ska väljas när det är
känt vilken challenge eller provider som ska användas först.

Kapitlet innehåller referensexempel från namngivna firmor. Se *Contradiction
Register* C-07: dessa siffror är referens, aldrig implementationskälla, och ska
verifieras mot firmans då gällande regelbok.

Kapitel 12 kräver dessutom att varje stödd profil verifieras mot firmans egna
officiella räkneexempel innan den aktiveras.

**Konsekvens:** Prop Firm Rules Engine kan byggas som motor mot en virtuell profil —
Kapitel 11 förutser uttryckligen virtuella profiler i forward test. Endast aktivering
mot skarpt konto blockeras.

---

## ~~GATE-10~~ — Daily-loss force close-semantik

**Status: STÄNGD 2026-08-27**

Canonical beslut: den interna dagsregeln tvångsstänger **inte** en öppen position.

```
MAX INTERNAL DAILY LOSS: $450
CALCULATION BASIS:       REALIZED LOSSES ONLY
RESET:                   00:00 America/New_York
```

Vid `realized_daily_loss >= $450`: inga nya trades, state `BLOCKED / DAILY_STOP`,
execution av nya intents blockeras, state persistent över restart, blockerad till nästa
canonical reset, audit event skapas.

En öppen position hanteras vidare av teknisk SL, TP, canonical BE, London window-close BE,
news exit, NY time exit, emergency-kontroller och Prop Firm Rules. Ett prop-lager som
använder equity, floating eller trailing får vara striktare och kan kräva tidigare skydd.

Risk Engine Specification är därmed promoverad till **Canonical v1.0**.

Se `Canonical Amendments v1.0.md` avsnitt B1–B6.

---

## ~~GATE-11~~ — Reserved risk

**Status: STÄNGD 2026-08-27**

Canonical beslut — reserved risk är en pre-entry-kontroll:

```
realized_daily_loss + reserved_risk_for_new_trade <= daily_loss_limit
```

```
realized_daily_loss = $300, daily_loss_limit = $450, daily_remaining = $150
ny trade risk = $128  → passerar
ny trade risk = $151  → DENY
```

Kontrollen ändrar inte definitionen av realiserad daily loss och skriver inget i mätaren.
Reservationen frisläpps när traden stängs.

Regeln är normativ redan i v1.0, inte bara vid `max_open_positions > 1`.

Se `Canonical Amendments v1.0.md` avsnitt B2.

---

## GATE-12 — Execution safety margin- och slippagemodell

**Klass:** BLOCKS EXECUTION

Risk Engine Specification v0.1 §13 kräver att beräknad risk inkluderar en
säkerhetsmarginal för kostnader och execution deviation, men skjuter upp den exakta
marginalmodellen till "execution calibration".

§30 kräver på samma sätt en maximal acceptabel execution deviation utan att låsa
tröskeln. Kapitel 8 anger att exakta toleranser ska kalibreras senare.

Principerna är låsta — revalidation före order submission, proposal expiry, stoppa om
R:R faller under strategiminimum. Det är **siffrorna** som saknas.

**Krav för att stänga:** kalibrerade tröskelvärden per instrument, versionsstyrda.

---

## GATE-13 — Exakta promotion thresholds

**Klass:** BLOCKS LIVE

Kapitel 19 definierar kriterierna för uppskalning kvalitativt och kräver bland annat
noll zero-tolerance-incidents. De exakta numeriska trösklarna för promotion mellan
autonominivåer är medvetet uppskjutna. Kapitel 20 listar posten som kvarvarande.

**Medvetet uppskjuten.** Ska låsas mot faktisk demo- och forward-testdata, inte i
förväg. Att låsa dem nu vore att gissa.

---

## GATE-14 — Exakta live safety policies

**Klass:** BLOCKS LIVE

Kapitel 18 och Kapitel 20 anger att exakta live safety policies kvarstår.
Risk Engine Specification §43 fastslår redan principen: Controlled Live ska kunna
starta med lägre kapitalrisk än teststrategins baseline, och ingen automatisk
uppskalning får ske på kortsiktig performance.

**Medvetet uppskjuten** till samma beslutstillfälle som GATE-13.

---

## ~~GATE-15~~ — Val av futures execution provider

**Status: STÄNGD 2026-08-28** genom Beslut E.
**Tillkom:** 2026-08-28, Beslut D

**Beslut:** första execution provider adapter är **Rithmic R|Protocol API**, utvecklad mot
Rithmic Test. **Planerad andra adapter: Tradovate.** TradeSea är inte ett execution
provider-mål.

Rithmic är **första implementationsmål, inte permanent exklusiv provider**. Arkitekturen
förblir multi-provider capable.

### Vad closure INTE innebär

Provider-valet innebär **inte** att:

- produktionscredentials finns
- en broker- eller FCM-relation finns
- prop firm-kompatibilitet är löst
- market data-licensiering är löst
- conformance är passerad

Dessa hör till senare implementations-, kommersiella och deploymentgates — GATE-08,
GATE-09 och GATE-17 — samt till kontoarbete som inte är en gate alls.

NQ och MNQ är futures. Ingen execution provider är vald.

Kandidater som ska utvärderas inkluderar Tradovate, TradeSea eller motsvarande
underliggande futures-anslutning, samt andra kompatibla futures-providers. **Ingen av
dem är låst**, och listan är inte uttömmande.

Valet ska föregås av en separat capability-, security- och integration review. Relevanta
kriterier är minst:

- separerbar read- och execution-kapabilitet
- autentiseringsmodell och credential-hantering
- idempotens vid orderinläggning
- kontrakts- och symbolmodell för futures
- rapportering av fills, positions och history
- reconciliation-möjlighet mot faktiskt kontostate
- prop firm-kompatibilitet, se GATE-09
- driftsmodell och var adaptern får köras, se GATE-17

**Rationale.** Omnira är futures-native; långsiktigt prop firm-stöd är fortsatt ett
huvudmål; Rithmic är direkt relevant i det funded-futures-ekosystem Omnira siktar mot;
R|Protocol är ett infrastruktur-API snarare än en front-end; WebSocket och Protocol Buffers
fungerar från valfritt språk och OS och passar en backendarkitektur; Rithmic Test tillåter
utveckling före conformance; server-side bracket-, OCO- och riskkapabiliteter är
strategiskt värdefulla i senare faser; providerns state kan fungera som authoritative
extern execution state; och risken att den första adaptern blir disposable är lägre än på
alternativa vägar.

---

## ~~GATE-16~~ — Execution Provider Adapter-kontrakt

**Status: STÄNGD 2026-08-28** genom Beslut E.
**Tillkom:** 2026-08-28, Beslut D

**Beslut:** det provider-neutrala Level 1 Read Only-kontraktet är låst i
`specifications/execution-provider/Omnira Trading System – Execution Provider Adapter –
Level 1 Read Only – Canonical v1.0.md`.

**Closure-grund:** en `TradovateAdapter` och en `RithmicProtocolAdapter` kan implementera
samma Level 1-semantik utan att kontraktet ändras. Providerskillnader uttrycks genom
`ProviderCapabilities`, `CapabilityState`, `Available<T>`, `FillHistory.completeness`,
`CredentialMode` och normaliserade fel.

Level 1 innehåller **noll** execution-metoder. Inga providerspecifika endpoint-namn finns i
det canonical gränssnittet.

Systemarkitektur v0.3 §22 definierar adaptern som den enda komponent som får känna till
en specifik providers API. Själva kontraktet är inte skrivet.

Ska minst låsa:

- read-kapabilitetens gränssnitt: account, symbols, quotes, bars, ticks, orders,
  positions, history
- execution-kapabilitetens gränssnitt: pre-check, submit, modify, close
- autentisering och sessionshantering
- felöversättning till Omniras strukturerade error states
- idempotensnyckel och duplicate protection
- översättning mellan Omniras instrumentidentitet och providerns kontraktsidentitet
- health- och heartbeat-semantik

**Varför providerspecifika detaljer inte blockerade closure.** De tre frågor som tidigare
kallades blockerare — permission scoping, fill history-retention och tillgång till tick
value och multiplier — är alla samma sorts problem: providers skiljer sig i vad de kan
rapportera. Det är en capability-fråga, inte en arkitekturfråga. Arkitekturen bryter bara
om kontraktet saknar sätt att uttrycka skillnaden. Med capability- och
tillgänglighetssemantik på plats är de implementationsfrågor.

Providerspecifika endpoint-namn behövdes aldrig för att stänga en provider-neutral gate.

---

## GATE-17 — Execution runtime- och deploymenttopologi

**Klass:** BLOCKS EXECUTION
**Tillkom:** 2026-08-28, Beslut D

Krävs ett separat Execution Runtime eller en egen host överhuvudtaget? Det tidigare
Windows-runner-antagandet var en konsekvens av MT5-bindningen, inte ett arkitekturkrav.
Systemarkitektur v0.3 §2.1 och §18 gör runtime-ledet deployment-beroende.

Ska avgöras:

- krävs en separat process eller host, eller kan Execution Gateway nå adaptern direkt
- var runtime i så fall får köras, och på vilken plattform
- nätverks- och credentialpolicy för den placeringen
- heartbeat- och failover-modell

**Varför denna blockerar Execution och inte Fas 2:** read-only-verifiering kan göras från
en utvecklingsmiljö. Topologin blir bindande först när ordrar faktiskt kan skickas, och
hör därför ihop med Fas 6 tillsammans med GATE-12.

**Evidens tillagd 2026-08-28 (Beslut E).** R|Protocol är WebSocket och Protocol Buffers,
språk- och OS-oberoende och lämpat för webb, mobil och cloud. Ett obligatoriskt lokalt
eller Windows-bundet runner är därför **inte förväntat**.

Gaten stängs ändå **inte**. Om Omnira använder en direkt backendadapter eller en dedikerad
providertjänst för isolation är fortfarande ett deployment- och isoleringsbeslut. Fas 2 får
initialt använda en dedikerad tjänst om det ger bättre isolation, utan att det låser
topologin.

---

## Fasbedömning

| Fas | Blockerande gates | Får påbörjas |
|---|---|---|
| Fas 1 – Trading Core | inga | **Ja** |
| Fas 2 – Futures Connectivity (Read Only) | inga | **Ja** |
| Fas 3 – Strategy Engine | GATE-01, 02, 03, 04, 08 | Nej |
| Fas 4 – AI Analysis | ärver Fas 3 | Nej |
| Fas 5 – Risk Engine | inga gates kvar, förutsätter Fas 3–4 | Gate-fri |
| Fas 6 – Manual Approval | GATE-06, 07, 12, 17 | Nej |
| Fas 7 – Demo Automation | som Fas 6 | Nej |
| Fas 8 – Backtest + Forward | ärver Fas 3 | Nej |
| Fas 9 – Prop Firm Mode | GATE-09 | Nej |
| Fas 10 – Controlled Live | GATE-13, 14 | Nej |

**Fas 1 är ogrindad och kan påbörjas omedelbart.** Fas 1 – Trading Core är dessutom
redan genomförd och mergad (PR #96).

**Fas 2 är ogrindad sedan 2026-08-28**, när GATE-15 och GATE-16 stängdes genom Beslut E.
Första implementationsmål är Rithmic R|Protocol mot Rithmic Test.

Kvarvarande arbete inför Fas 2 är implementationsförberedelse — dev kit-begäran och
Rithmic Test-access — inte gates. Se `research/Provider Evaluation` för vad begäran kräver.

Fas 5 har efter 2026-08-27 inga egna öppna gates — Risk Engine Specification är Canonical
v1.0 med noll öppna riskbeslut. Fasen förutsätter fortfarande att Fas 3 och Fas 4 är
genomförda i den canonical fasordningen.

Notera att GATE-12 flyttades från Fas 5 till Fas 6: execution safety margin och
slippagetröskel behövs först när en order faktiskt kan skickas, inte för att bygga
riskmotorn.
