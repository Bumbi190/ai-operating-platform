# Canonical Review v1.0

**Dokument:** Omnira Trading System – Canonical Documentation Review
**Version:** v1.0
**Datum:** 2026-08-27
**Granskare:** Kontrollerad canonical documentation pass
**Omfattning:** Kapitel 1–20 samt fyra Fas 0-specifikationer
**Utfall:** **CANONICAL v1.0** — se avsnitt 6
**Reviderad:** 2026-08-27, efter att de två sista blockerarna stängdes

---

## 1. Bevaranderegel

Denna review genomfördes i två pass.

**Pass 1 (granskning)** ändrade **ingen** tradingregel. Den registrerade allt den hittade
och lämnade två regeltvetydigheter olösta, eftersom de krävde mänskliga beslut.

**Pass 2 (reconciliation)** genomfördes efter att de två besluten fattats. Här ändrades
text — men endast för att införa de fattade besluten, aldrig för att avgöra något på egen
hand. Varje ändring är listad med före, efter och motivering i
`Canonical Amendments v1.0.md`.

Ingen riskgräns, session, entry-, SL-, TP-, re-entry- eller news-regel har ändrats i
något av passen. De två ändringar som rör regelinnehåll är:

- London window-close break-even gjordes entydig (disambiguering av redan fattat beslut)
- intern floating force-close togs bort som logiskt ohållbar, och reserved risk infördes
  som explicit pre-entry-kontroll

Vad som gjordes i pass 1:

- inventering och verifiering av materialet
- korsläsning av samtliga dokument mot varandra
- registrering av motsägelser och tvetydigheter
- normalisering av dokumentprecedens, utan källändring
- sammanställning av öppna implementation gates
- assemblering av boken till ett sammanhängande dokument

Vad som **inte** gjordes:

- inga nya tradingregler
- inga ändrade riskgränser
- inga upplösta tvetydigheter genom gissning
- ingenting markerat canonical som inte faktiskt är beslutat

Där dokument var otydliga har otydligheten **registrerats**, inte lösts.

---

## 2. Inventering

### 2.1 Bokkapitel

Exakt Kapitel 1–20 återfanns. Inga saknas, inga dubbletter, inga extra.

Källkatalog: `Knowledge/Books/Trading boken/` i Omnira-arbetsytan.

| Kap | Titel | Byte | SHA-256 (16) |
|---|---|---|---|
| 01 | Vision | 79298 | `6bb2785b8801111b` |
| 02 | Tradingfilosofi | 87445 | `cc1b16f380433c09` |
| 03 | Strategispecifikation | 96961 | `2a6521709f3da375` |
| 04 | Riskhantering | 23880 | `1aca83b1b5a8be1b` |
| 05 | Systemarkitektur | 36853 | `b64aa5b26f74ac43` |
| 06 | Marknadsdata | 45141 | `9068c696102ec0a4` |
| 07 | AI som beslutsstöd | 41928 | `a74642c19a7cbcc3` |
| 08 | Exekvering | 49624 | `c282cba724be6bd1` |
| 09 | MetaTrader 5-integration | 54406 | `5281e4ee261b7862` |
| 10 | Backtesting | 58585 | `5e36f470f2137451` |
| 11 | Forward testing | 58366 | `14e41659c5ae7a35` |
| 12 | Prop firm-regler | 59577 | `0d92e250e8a68327` |
| 13 | Tradingjournal | 67275 | `d9c899afe991765f` |
| 14 | Prestationsanalys | 75335 | `fff5c347ddbc9be1` |
| 15 | Felmoder och failure scenarios | 83123 | `ba02d3b3b5c52952` |
| 16 | Säkerhet och kill switches | 83906 | `320ebc0546c825b8` |
| 17 | Demofas | 78878 | `bb6623e8a0f31ab9` |
| 18 | Live-deployment | 78843 | `6b96f3cc4eeaba91` |
| 19 | Kriterier för uppskalning | 81183 | `55577b3f4b35234b` |
| 20 | Lärdomar och förändringshistorik | 90891 | `867ad934ce2f9ac3` |

Samtliga kapitel: `.docx`, dokumenttyp *bokkapitel*, status *Baseline dokumenterad*
där statusblock finns. Kapitel 4 och 5 saknar statusblock — se Contradiction
Register C-06.

### 2.2 Fas 0-specifikationer

| Dokument | Byte | SHA-256 (16) |
|---|---|---|
| Omnira Liquidity Manipulation – Trading Strategy Specification – Canonical v1.0 | 40295 | `72b90871ce5da8f4` |
| Omnira Trading System – Systemarkitektur v0.1 | 44572 | `930c38bf192cfd55` |
| Omnira Trading System – Datamodell v0.1 | 60942 | `4eb52779f44da2d1` |
| Omnira Trading System – Risk Engine Specification v0.1 | 62872 | `865fcb11ecfde181` |

| Dokument | Typ | Version | Status |
|---|---|---|---|
| Trading Strategy Specification | Strategi | Canonical v1.0 | Låst baseline |
| Systemarkitektur | Arkitektur | v0.1 | Fas 0 – förslag för granskning |
| Datamodell | Datamodell | v0.1 | Fas 0 |
| Risk Engine Specification | Risk | v0.1 | Fas 0 – åtta öppna riskbeslut |

### 2.3 Anmärkningar från inventeringen

- En Word-ägarlåsfil, `~$ading Strategy Specification v1.0-RC1.docx` (162 byte),
  finns i källkatalogen. Den är inte innehåll och har inte kopierats vidare. C-08.
- Kapitel 4 är påtagligt kortare än övriga (7,7 kB extraherad text mot 17–33 kB).
  Detta är noterat eftersom kapitlet bär de tyngsta riskbesluten. C-06.
- Inga tracked changes och inga kommentarer återfanns i något källdokument.
- Ingen teckenkodningskorruption återfanns i någon extraherad text.

---

## 3. Cross-document canonical review

### 3.1 Strategi

Samtliga kontrollpunkter verifierade som **konsistenta** mellan Strategy
Specification Canonical v1.0 och Kapitel 3, med stöd i Kapitel 10, 11, 13 och 14:

NQ/MNQ som primär marknad; ES som SMT-jämförelseinstrument; `America/New_York` som
tidszon med uttrycklig förbjuden permanent UTC-4-offset; London 02:00–05:00 och
New York 10:00–12:00; endast de två tillhörande 4H-opens; liquidity och FVG på 5–15m
som alternativa manipulationstriggers; 1m entry phase; iFVG/CISD som
kärnconfirmation; SMT som frivillig confirmation som endast höjer A till A+; grades
A+/A/B/C samtliga tradebara i grundkonfigurationen; entry på confirmation close utan
obligatorisk retrace; teknisk SL bakom manipulationens swing; första giltiga
liquidity target ≥ 2R; break-even mot närmaste bekräftade 1m swing; inga partials;
ingen kontinuerlig trailing; en öppen position; re-entry endast efter förlust; max
tre attempts per 4H thesis; ingen re-entry efter winner eller BE; news T-1h → T+4h
för nya entries; befintlig position stängs T-15m; New York max fyra timmars
trade duration; London utan explicit tidsgräns.

**En tvetydighet hittades i pass 1:** London window-close och break-even. Den var gemensam
för båda dokumenten — de sa samma sak, och samma sak var tvetydigt.

**Stängd 2026-08-27.** En London-position som fortfarande är öppen 05:00 får
`SL → entry price`, även utan swing-trigger. Registrerad som CLOSED-03 i
strategispecifikationen. Se C-03 och `Canonical Amendments v1.0.md` avsnitt A.

### 3.2 Risk

Verifierat konsistent: $150 max risk per trade; $450 intern daily loss; max en öppen
position; max tre attempts per thesis; teknisk SL får aldrig flyttas för att passa
riskbudgeten; minsta handlingsbara quantity över budget ger `DENY`; Risk Engine är
deterministisk; Risk Engine har veto; ingen normal human override av hard risk
`DENY`; fail closed vid osäkerhet.

Siffrorna $150 och $450 förekommer i 18 respektive 15 dokument utan en enda
avvikelse. Alla andra belopp i materialet är räkneexempel och motsäger inte
baslinjen.

**En koherenslucka hittades i pass 1:** daily-loss force close.

**Stängd 2026-08-27.** Den interna dagsregeln tvångsstänger inte en öppen position.
Reserved risk infördes som explicit pre-entry-kontroll. Se C-01, C-02 och
`Canonical Amendments v1.0.md` avsnitt B.

### 3.3 Arkitektur

Systemarkitektur v0.1 §2 anger auktoritetskedjan **exakt** som krävd:

```
Market Data → Strategy Engine → AI Analysis → Risk Engine → Prop Firm Rules Engine
→ Trade Proposal → Approval / Automation Policy → Execution Gateway
→ Windows Execution Runner → MetaTrader 5 → Broker / Prop Firm → Journal & Analytics
```

> **Not 2026-08-28:** kedjan ovan är den som verifierades mot Systemarkitektur **v0.1**
> och bevaras som granskningsprotokoll. Den är sedan Beslut D ersatt av en
> futures-native, provider-neutral kedja i Systemarkitektur **v0.2**. Se
> `Canonical Amendments v1.0.md`, Beslut D, och `SOURCE_OF_TRUTH.md` för den
> gällande kedjan. Auktoritetsordningen och veto-lagren är oförändrade — endast
> den externa execution-noden har blivit provider-neutral.

Verifierat i materialet:

| Invariant | Status | Belägg |
|---|---|---|
| Strategy Signal är inte en order | OK | Arkitektur §3, Strategy §43 |
| AI har inte exekveringsauktoritet | OK | Kapitel 7, Strategy §36, Arkitektur §5 |
| Risk och Prop har veto | OK | Risk §2, §75, Kapitel 4, Kapitel 12 |
| Execution är isolerad och privilegierad | OK | Arkitektur §3, Kapitel 8 |
| UI är aldrig source of truth | OK | Kapitel 5, Kapitel 15, Arkitektur, Datamodell |
| Broker state är source of truth för exponering | OK | Kapitel 1, 9, 16, 18 |
| Reconciliation blockerar execution vid kritisk avvikelse | OK | Kapitel 8, 9, 15, 16, Datamodell |

**Endast anmärkning:** Strategy §35 återger kedjan förkortad och utelämnar Execution
Gateway. Detta är en delvy, inte en motsägelse, och har normaliserats genom en
precedensregel i `SOURCE_OF_TRUTH.md`. Källdokumentet är oförändrat. C-04.

### 3.4 Self-improvement

Gränsdragningen är **korrekt och konsistent** genom hela materialet.

Atlas får: observera, mäta, upptäcka mönster, jämföra performance, identifiera
findings, skapa hypoteser, föreslå parameterändringar, föreslå ny strategy version,
föreslå ny Risk Profile-version, skapa Change Proposal draft.

Atlas får inte: ändra canonical strategi, ändra aktiv RiskProfile, ändra prop
firm-regler, ändra exekveringsregler, ge sig själv final approval, promovera sig
själv till live, eller höja risk automatiskt.

Kapitel 5 formulerar principen som *Self-Improvement är inte Self-Modification* och
låser förbättringsflödet:

```
Observe → Measure → Detect Pattern → Create Hypothesis → Candidate Version
→ Backtest → Out-of-Sample Test → Forward Test → Review / Approval → Ny Canonical Version
```

Kapitel 20 kompletterar med explicit Change Approval, Promotion Record och kravet att
promotion är ett uttryckligt event. Kapitel 4, 14, 16 och 19 upprepar förbudet mot
autonom riskändring.

Inga avvikelser funna.

---

## 4. Risk Spec-rekonciliering

Risk Engine Specification v0.1 §84 listar åtta öppna riskbeslut. Samtliga har
bemötts av senare bokbeslut, i praktiken helt av Kapitel 4.

| Post | Fråga | Löst av | Beslut |
|---|---|---|---|
| OPEN-RISK-01 | Daily loss-beräkningsmetod | Kapitel 4 | Realiserad förlust. Floating P/L används inte som intern mätare |
| OPEN-RISK-02 | Daily reset policy | Kapitel 4 | 00:00 America/New_York |
| OPEN-RISK-03 | Separat max trades per day | Kapitel 4 | Ingen separat gräns i v1.0 |
| OPEN-RISK-04 | Intern max total drawdown | Kapitel 4 | Ingen separat intern gräns i v1.0 |
| OPEN-RISK-05 | Spread threshold | Kapitel 4 | Inget spread-filter aktivt i v1.0 |
| OPEN-RISK-06 | Losing-streak protection | Kapitel 4 | Ingen extra regel utöver daily stop |
| OPEN-RISK-07 | Öppen position vid daily breach | Kapitel 4 | Positionen ska stängas direkt |
| OPEN-RISK-08 | Margin utilization limits | Kapitel 4 | Ingen separat gräns i v1.0 |

Sju av åtta är rena, entydiga resolutioner.

**OPEN-RISK-07 var i pass 1 löst i ordalydelse men inte i koherens.** Beslutet
"stäng direkt" kombinerat med OPEN-RISK-01:s realiserade mätare och
`max_open_positions = 1` gav en regel utan nåbar trigger.

Detta är stängt sedan 2026-08-27. Se avsnitt 4.1.

Notera att §29 (spread) och §26 (total drawdown) inte är motsägelser mot Kapitel 4:
specifikationen kräver att Risk Engine *stöder* funktionerna, Kapitel 4 beslutar att
de inte är *aktiva* i v1.0. Kapacitet och aktivering är olika saker.

### 4.1 Uppdatering 2026-08-27

OPEN-RISK-07 är nu stängd. Beslutet blev **att ta bort den interna tvångsstängningen**,
inte att införa equity-baserad detektion — den senare hade motsagt realized-only-modellen.

Samtidigt låstes reserved risk som en explicit pre-entry-kontroll, vilket även stänger
den tidigare vilande GATE-11.

Den låsta modellen är:

```
MAX INTERNAL DAILY LOSS: $450
CALCULATION BASIS:       REALIZED LOSSES ONLY
RESET:                   00:00 America/New_York

realized_daily_loss + reserved_risk_for_new_trade <= daily_loss_limit
```

Vid `realized_daily_loss >= $450`: inga nya trades, `BLOCKED / DAILY_STOP`, execution av
nya intents blockeras, persistent över restart, audit event.

En öppen position tvångsstängs inte av den interna regeln. Prop-lagret får vara striktare.

**Resultat:** samtliga åtta OPEN-RISK-poster är stängda.
`Risk Engine Specification – Canonical v1.0` är promoverad och ligger i
`specifications/risk/`. CANDIDATE-versionen är flyttad till `archive/` med
superseded-banner, och v0.1 har försetts med en historik-banner så att dess OPEN-RISK-lista
inte kan läsas som aktuell.

---

## 5. Bokassemblering

Boken är assemblerad i den föreskrivna kapitelordningen 1–20, på svenska, i A4 med
titelsida, innehållsförteckning, kapitelöppningssidor, sidnummer, sidhuvud och
sidfot. Text är sökbar och markerbar. Kod- och state-exempel är visuellt särskilda.

Se `book/final/`.

---

## 6. Utfall

### 6.1 De två blockerarna är stängda

Pass 1 identifierade två defekter i den låsta regelmängden. Båda är nu stängda genom
explicita mänskliga beslut.

**C-03 / GATE-05 — London window-close och break-even.**
Canonical betydelse: en London-position som fortfarande är öppen 05:00 America/New_York
får `SL → entry price`, även om den swing-baserade triggern inte har inträffat.
Positionen fortsätter därefter, utan fyratimmarsgräns. Registrerat som CLOSED-03.

**C-01 / GATE-10 — Daily-loss force close.**
Canonical policy: den interna dagsregeln tvångsstänger inte en öppen position. Mätaren
förblir realiserad. Vid gränsbrott blockeras nya trades och state blir
`BLOCKED / DAILY_STOP`. Reserved risk infördes som pre-entry-kontroll, vilket samtidigt
stängde GATE-11.

Ingen av dessa löstes genom tolkning under granskningen. Båda avgjordes av beslut som
sedan infördes i texten och dokumenterades i `Canonical Amendments v1.0.md`.

### 6.2 Varför paketet nu är Canonical v1.0

Kriteriet för canonical-status är inte att allt är känt. Det är att **den låsta
regelmängden är intern konsistent och deterministiskt implementerbar**.

Skillnaden som avgjorde pass 1 gäller fortfarande, men faller nu ut åt andra hållet:

- **Defekter i den låsta regelmängden** — regler som motsäger varandra eller inte kan
  implementeras entydigt. Dessa blockerar canonical-status. Det fanns två. Det finns nu
  noll.
- **Medvetet uppskjutna detaljspecifikationer** — frågor som ännu inte behöver ett svar
  och som Kapitel 20 uttryckligen förutser. Dessa blockerar respektive fas, inte
  canonical-status. Det finns elva.

En manual kan vara kanonisk och samtidigt ha oöppnade dörrar, så länge varje dörr är
märkt och ingen av dem står på glänt in i ett rum som redan är beskrivet.

### 6.3 Status

| Artefakt | Status | Version |
|---|---|---|
| Boken, Kapitel 1–20 | **Canonical** | v1.0 |
| Trading Strategy Specification | **Canonical** | v1.0, rev. 2026-08-27 (CLOSED-03) |
| Risk Engine Specification | **Canonical** | v1.0, promoverad från CANDIDATE |
| Systemarkitektur | Fas 0-baseline, oförändrad | v0.1 |
| Datamodell | Fas 0-baseline | v0.1, rev. 2026-08-27 (additivt fält) |

**Arkitektur och datamodell promoveras inte.** Granskningen fann inga motsägelser i dem,
men det är inte samma sak som att de genomgått en promotionsprocess. Systemarkitektur
v0.1 är canonical **för auktoritetskedjan** genom en explicit precedensregel i
`SOURCE_OF_TRUTH.md` — det är en precedensutsaga, inte en versionsbump. Att promovera
dem här vore att hitta på ett beslut som ingen har fattat.

### 6.4 Kvarvarande öppna gates

Elva, samtliga medvetet uppskjutna:

| Gate | Blockerar |
|---|---|
| GATE-01 iFVG-detektion | Strategy Engine |
| GATE-02 CISD-detektion | Strategy Engine |
| GATE-03 equal-high/low-tolerans | Strategy Engine |
| GATE-04 SMT correspondence | Strategy Engine |
| GATE-08 marknadsdataprovider | Strategy Engine |
| GATE-06 news-provider | Execution |
| GATE-07 high-impact-klassificering | Execution |
| GATE-12 execution margin/slippage | Execution |
| GATE-09 första PropFirmProfile | Prop Mode |
| GATE-13 promotion thresholds | Live |
| GATE-14 live safety policies | Live |

Ingen av dem blockerar Fas 1 eller Fas 2.

### 6.5 Duglighet som implementationsbaslinje

**Materialet är dugligt som implementationsbaslinje.**

Domänmodellen, auktoritetskedjan, riskmodellen, journalkraven och datamodellen är låsta
och inbördes konsistenta. Risk Engine Specification har noll öppna riskbeslut.

**Nästa rekommenderade utvecklingsfas: Fas 1 – Trading Core**, enligt den canonical
implementationsordning som Kapitel 20 fastställer.

Fas 3 får inte påbörjas innan GATE-01, 02, 03, 04 och 08 är stängda.

### 6.6 Vad canonical inte betyder

Canonical v1.0 betyder att reglerna är tillräckligt definierade för att implementeras och
testas konsekvent.

Det betyder **inte** att strategin har bevisad positiv expectancy. Den ska bevisas eller
förkastas genom data. Strategispecifikationens egen formulering gäller oförändrat.
