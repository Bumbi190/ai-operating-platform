# Open Implementation Gates – Canonical v1.0

**Dokument:** Omnira Trading System – Open Implementation Gates
**Version:** v1.0
**Datum:** 2026-08-27
**Status:** Aktiv. Ska konsulteras före varje fasstart.
**Senast uppdaterad:** 2026-08-27 — GATE-05, GATE-10 och GATE-11 STÄNGDA.

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

**Antal öppna gates: 11.** Tre stängdes 2026-08-27.

**Antal som blockerar Fas 1: 0.**
**Antal som blockerar Fas 2: 0.**

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

## GATE-08 — Val av realtids-marknadsdataprovider

**Klass:** BLOCKS STRATEGY ENGINE

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

## Fasbedömning

| Fas | Blockerande gates | Får påbörjas |
|---|---|---|
| Fas 1 – Trading Core | inga | **Ja** |
| Fas 2 – MT5 Read Only | inga | **Ja** |
| Fas 3 – Strategy Engine | GATE-01, 02, 03, 04, 08 | Nej |
| Fas 4 – AI Analysis | ärver Fas 3 | Nej |
| Fas 5 – Risk Engine | inga gates kvar, förutsätter Fas 3–4 | Gate-fri |
| Fas 6 – Manual Approval | GATE-06, 07, 12 | Nej |
| Fas 7 – Demo Automation | som Fas 6 | Nej |
| Fas 8 – Backtest + Forward | ärver Fas 3 | Nej |
| Fas 9 – Prop Firm Mode | GATE-09 | Nej |
| Fas 10 – Controlled Live | GATE-13, 14 | Nej |

**Fas 1 och Fas 2 är ogrindade och kan påbörjas omedelbart.**

Fas 5 har efter 2026-08-27 inga egna öppna gates — Risk Engine Specification är Canonical
v1.0 med noll öppna riskbeslut. Fasen förutsätter fortfarande att Fas 3 och Fas 4 är
genomförda i den canonical fasordningen.

Notera att GATE-12 flyttades från Fas 5 till Fas 6: execution safety margin och
slippagetröskel behövs först när en order faktiskt kan skickas, inte för att bygga
riskmotorn.
