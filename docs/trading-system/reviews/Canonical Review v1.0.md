# Canonical Review v1.0

**Dokument:** Omnira Trading System – Canonical Documentation Review
**Version:** v1.0
**Datum:** 2026-08-27
**Granskare:** Kontrollerad canonical documentation pass
**Omfattning:** Kapitel 1–20 samt fyra Fas 0-specifikationer
**Utfall:** **CANONICAL CANDIDATE v1.0** — se avsnitt 6

---

## 1. Bevaranderegel

Denna review har **inte** ändrat någon tradingregel, riskgräns, session, entry-,
SL-, TP-, BE-, re-entry- eller news-regel.

Vad som gjordes:

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

**En tvetydighet kvarstår:** London window-close och break-even. Se C-03 / GATE-05.
Den är gemensam för båda dokumenten — de säger samma sak, och samma sak är tvetydigt.

### 3.2 Risk

Verifierat konsistent: $150 max risk per trade; $450 intern daily loss; max en öppen
position; max tre attempts per thesis; teknisk SL får aldrig flyttas för att passa
riskbudgeten; minsta handlingsbara quantity över budget ger `DENY`; Risk Engine är
deterministisk; Risk Engine har veto; ingen normal human override av hard risk
`DENY`; fail closed vid osäkerhet.

Siffrorna $150 och $450 förekommer i 18 respektive 15 dokument utan en enda
avvikelse. Alla andra belopp i materialet är räkneexempel och motsäger inte
baslinjen.

**En koherenslucka kvarstår:** daily-loss force close. Se C-01 / GATE-10.

### 3.3 Arkitektur

Systemarkitektur v0.1 §2 anger auktoritetskedjan **exakt** som krävd:

```
Market Data → Strategy Engine → AI Analysis → Risk Engine → Prop Firm Rules Engine
→ Trade Proposal → Approval / Automation Policy → Execution Gateway
→ Windows Execution Runner → MetaTrader 5 → Broker / Prop Firm → Journal & Analytics
```

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

**OPEN-RISK-07 är löst i ordalydelse men inte i koherens.** Beslutet "stäng direkt"
kombinerat med OPEN-RISK-01:s realiserade mätare och `max_open_positions = 1` ger en
regel utan nåbar trigger. Se C-01 / GATE-10.

Notera att §29 (spread) och §26 (total drawdown) inte är motsägelser mot Kapitel 4:
specifikationen kräver att Risk Engine *stöder* funktionerna, Kapitel 4 beslutar att
de inte är *aktiva* i v1.0. Kapacitet och aktivering är olika saker.

**Resultat:** `Risk Engine Specification – Canonical v1.0 CANDIDATE` är framtagen och
placerad i `specifications/risk/`. Den behåller CANDIDATE-status enbart på grund av
GATE-10.

---

## 5. Bokassemblering

Boken är assemblerad i den föreskrivna kapitelordningen 1–20, på svenska, i A4 med
titelsida, innehållsförteckning, kapitelöppningssidor, sidnummer, sidhuvud och
sidfot. Text är sökbar och markerbar. Kod- och state-exempel är visuellt särskilda.

Se `book/final/`.

---

## 6. Utfall

### 6.1 Varför inte Canonical v1.0

Materialet är av hög och ovanligt jämn kvalitet. Baslinjesiffrorna är konsistenta
över alla 24 dokument, auktoritetskedjan håller, self-improvement-gränsen är korrekt
dragen, och fail-closed-principen är genomförd rakt igenom.

Två poster hindrar ändå ärlig canonical-status:

**C-03 / GATE-05 — London window-close och break-even.**
En canonical strategiregel som inte kan implementeras deterministiskt som skriven.
De två möjliga läsningarna ger olika backtestresultat. Detta är en regeltvetydighet,
inte en saknad detalj.

**C-01 / GATE-10 — Daily-loss force close.**
Två låsta riskbeslut ger tillsammans en regel utan nåbar trigger. Detta är en
logisk lucka mellan två canonical beslut, inte en oskriven parameter.

Skillnaden mot de övriga gates spelar roll: GATE-01 till 04 och 06 till 14 är
**medvetet uppskjutna detaljspecifikationer**, precis som Kapitel 20 förutser. De
hindrar inte att boken är canonical. C-03 och C-01 är däremot **defekter i den
låsta regelmängden själv**.

Att kalla paketet Canonical v1.0 med dessa kvar vore att markera något som beslutat
som i praktiken inte är det.

### 6.2 Status

| Artefakt | Status |
|---|---|
| Boken (Kapitel 1–20) | **Canonical Candidate v1.0** |
| Trading Strategy Specification | Canonical v1.0, med GATE-05 kvar |
| Risk Engine Specification | **Canonical v1.0 CANDIDATE**, med GATE-10 kvar |
| Systemarkitektur | v0.1, oförändrad |
| Datamodell | v0.1, oförändrad |

### 6.3 Väg till Canonical v1.0

Två beslut krävs — inget av dem är stort, båda kräver en människa:

1. **GATE-05:** forcerad BE vid 05:00, eller enbart fortsatt §21-trigger.
2. **GATE-10:** equity-baserad detektion för force close, eller omformulering som
   framtidsregel.

När dessa två är låsta kan paketet promoveras till Canonical v1.0 utan ytterligare
granskning. Övriga gates blockerar respektive fas, inte canonical-status.

### 6.4 Duglighet som implementationsbaslinje

**Materialet är dugligt som implementationsbaslinje för Fas 1 och Fas 2.**

Ingen öppen gate berör Trading Core eller MT5 Read Only. Domänmodellen,
auktoritetskedjan, journalkraven och datamodellen är tillräckligt låsta för att
byggas mot.

**Nästa rekommenderade utvecklingsfas: Fas 1 – Trading Core**, enligt den canonical
implementationsordning som Kapitel 20 fastställer.

Fas 3 får inte påbörjas innan GATE-01 till 05 och 08 är stängda.
