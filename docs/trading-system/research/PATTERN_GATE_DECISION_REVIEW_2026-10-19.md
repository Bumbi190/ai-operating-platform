# Omnira Trading – GATE-01–04: Beslutsunderlag för strategins mönster

**Datum:** 2026-10-19  
**Status:** 100 % offline, syntetisk research – inga regler godkända, ingen riktig backtest  
**Branch:** `research/trading-pattern-decision-matrix-20261019` (bas `codex/trading-phase3-gates-review-20261018`)  
**Beräkning:** `scripts/trading/research/pattern-decision-matrix.mjs`, resultat från redan existerande kandidatfunktioner. **45/45 Node-tester PASS** på den stationära Windows-datorn (34 gamla + 11 nya). Ingen npm-installation, externa API:n, CI, PR eller orders.

## 1. Så här används beslutsunderlaget

Det är **sju separata beslutsexempel** för fyra fortfarande öppna pattern-gates, inte sju godkända strategiregler. Varje jämförelse beräknas på **samma** noggrant definierade syntetiska candles inom respektive exempel. Utfall som `RESEARCH_OBSERVATIONS_ONLY`, `DIVERGENCE_RESEARCH`, `EQUAL_RESEARCH` och `UNKNOWN` är **forskningsklassifikationer**, aldrig entry- eller tradebeslut.

Regelstatus efter detta arbete är fortfarande:
```
GATE-01 iFVG          OPEN – approval null
GATE-02 CISD          OPEN – approval null
GATE-03 Equal levels  OPEN – approval null
GATE-04 SMT NQ/ES     OPEN – approval null
```

### Bekräftat terminologival – iFVG (2026-10-19)

**Användaren bekräftade uttryckligen att Omniras iFVG betyder _Inversion Fair Value Gap_, inte _Implied Fair Value Gap_.** Vi använder därför inversion-begreppet genom hela kommande strategispecifikationen.

Detta **bekräftar begreppets innebörd men inte dess fullständiga detektion eller entrylogik**. GATE-01 står fortfarande **OPEN**, med `approvedDetectionVersion:null`. Särskilt `CLOSE_BEYOND_FAR_EDGE` kontra `WICK_BEYOND_FAR_EDGE`, fönstret för skapande relativt manipulation, väntetid, FVG-urval, invalidation och expiry kräver separata beslut och tester.

**Nästa direkta fråga:** ska den inverterade FVG:n räknas först när en **färdig 1-minutscandle stänger strikt förbi zonens bortre kant**, eller räcker det att **wick** går förbi? Rekommendationen att pröva close-bekräftelse är en forskningsrekommendation, inte ett godkänt handelsbeslut. Undvik att markera någon signal/permission utifrån detta förrän användaren har valt och den canonical regeln har genomgått promotion.

### GATE-01: iFVG

**Val A – wick kontra bekräftad close genom den inverterade FVG-zonen.**

Syntetisk bearish ursprungs-FVG övergår till long-observation:
- `WICK_BEYOND_FAR_EDGE`: den första författade observationen vid **candle-index 3**, dvs efter bar 4:s färdigställande.
- `CLOSE_BEYOND_FAR_EDGE`: observationen vid **index 4**, efter bar 5:s färdigställande.

**Mänskligt beslut:** Kräver modellen en *färdig candle-close strikt genom zonens bortre kant*, eller räcker en wick? Begreppet **inversion (inte implied) är bekräftat av användaren**; crossing-regeln och alla övriga kriterier återstår.

**Val B – gap bildat före eller efter manipulation.**

Samma författade exempel, med avslutad manipulation vid en explicit cutoff:
- `ANY`: **1** syntetisk kandidathändelse.
- `AFTER_MANIPULATION`: **0** kandidathändelser.

**Mänskligt beslut:** Får ursprungsgapet vara äldre än manipulationen? Även expiry, invalidation, kandidatprioritet och lämplig grad av displacement förblir öppna.

### GATE-02: CISD

En syntetisk följd med två motriktade candles ger:
- `FIRST_RUN_OPEN`: en research-observation vid **index 3** (efter bar 4).
- `LAST_RUN_OPEN`: motsvarande observation vid **index 2** (efter bar 3).

**Mänskligt beslut:** Ska CISD-referensen vara öppningen på den första eller sista motriktade candle i runnen? Dessutom återstår marknadsstrukturens roll, hantering av doji, wick-vs-close, tidsgräns/expiry och flertydighet. Kandidatfunktionerna har ännu ingen slutligt definierad canonical handelslogik.

### GATE-03: Equal highs/lows

Två strict 5m swing highs, **101** och **101.25**, med explicit syntetisk tickstorlek **0.25**, har avståndet **exakt 1 tick**:
- Tolerans 1 tick **inklusive gränsen**: `EQUAL_RESEARCH`.
- Tolerans 1 tick **exklusive gränsen**: `DIFFERENT_RESEARCH`.

**Mänskligt beslut:** Hur många ticks är "equal" och räknas gränsvärdet? Dessa två val ensamma räcker inte: hur närliggande pivots paras ihop, separata 5m/15m-zoner, giltighetstid och kluster/sweep-policy är fortfarande öppna. Canon har redan låst **strikt 3-candle pivot, bekräftad först när höger candlen stängt**; den ändras inte här.

### GATE-04: NQ/ES SMT

**Val A – wick eller close tar referenslikviditet.**

På tidslinjematchade syntetiska NQ/ES-candles med *handparade* referenser:
- `WICK`: `DIVERGENCE_RESEARCH` för **NQ_ONLY**.
- `CLOSE`: `NO_DIVERGENCE_OBSERVED_RESEARCH`.

**Val B – tillåtet tidsavstånd mellan referenspivots.**

Samma explicita referenspar har **1 minuts** skillnad i bekräftelsetid:
- `0_MINUTES`: `UNKNOWN` (`REFERENCE_TIMING_POLICY_NOT_MET`).
- `1_MINUTE`: `DIVERGENCE_RESEARCH` under syntetiskt wick-antagande.

**Negativt säkerhetsfall:** Om ES-serien inte är `SETTLED` blir SMT **`UNKNOWN`**. Den blir inte en bekräftad divergence eller ett säkert "ingen SMT".

**Viktig canonical begränsning:** SMT får endast vara en *kompletterande bekräftelse* som eventuellt uppgraderar en i övrigt giltig A-setup till A+. Den får **inte** skapa egna trades, användas som primär entrytrigger eller påhittas när ES saknas. Automatisk faktisk pivotkorrespondens, tidsfönstrets varaktighet och matching över verkliga kontrakts- och kalendersessioner saknas fortfarande.

## 2. Vad som inte får väljas automatiskt

- Ingen av de sju kandidatraderna väljer vinnare, optimerar avkastning eller främjar grade.
- Alla mönsterstatus är **reproducerbara, syntetiska jämförelser** och förblir forskning utanför `apps/web/lib/trading`.
- `pattern-gates-pending-v0.1.json` förblir oförändrad: samtliga `decisions` är `null`, ingen `approvedDetectionVersion`, inga signal- eller execution permissions.
- Live/faktiska CME-candles får **inte** stoppas in i syntetiska sammanhängande fixtures för att kringgå verkliga ContractCalendar, SessionCalendar eller marknadsdatalicenser.
- Ingen lönsamhet, träffsäkerhet, faktisk strategi-edge, kommission/slippage eller out-of-sample har testats.

## 3. Föreslagen beslutsgång – människan godkänner

**Först:** Verifiera vilket iFVG-begrepp och vilken CISD-triggermodell du faktiskt vill handla, med 2–3 manuellt granskade exempel per riktning. Det är de viktigaste *blockerande* detektionsreglerna.

**Därefter:** definiera tolerance/lookback och pivotparning för GATE-03, samt referensparning, wick/close och tidsgränser för GATE-04; kontrollera att SMT endast kan uppgradera A till A+.

**Sedan:** skriv fyra självständiga versionerade detection contracts med golden fixtures och signerat beslut; använd **samma** implementation i replay/backtest/forward och visa bara observerade trades efter ett godkänt realdataflöde.

**Separat databeroende:** GATE-08 måste kompletteras med licensierad historisk NQ/ES-data, faktiska tids- och kontraktskalendrar, oberoende source-snapshot och kontraktsskopad C3C adapter, innan en riktig historisk backtest går att betrakta som tillförlitlig.

## 4. Exakt kod och reproduktion

```bash
node --test \
  scripts/trading/research/pattern-candidates.test.mjs \
  scripts/trading/research/pattern-candidates-mirror.test.mjs \
  scripts/trading/research/equal-smt-candidates.test.mjs \
  scripts/trading/research/pattern-decision-matrix.test.mjs
```

Utfallet i den faktiska Windows-körningen: **45 tests / 45 pass / 0 fail**. Koden finns på `research/trading-pattern-decision-matrix-20261019`; varken Backtest Lab v2 eller den rena C3C-branchen ändras.

**Ingen PR, merge, prod deploy, betald datakälla eller autentisk tradingtrade har aktiverats.**
