# iFVG B-only – första isolerade syntetiska experimentet

**Datum:** 2026-10-19  
**Status:** RESEARCH ONLY · INTE EN GODKÄND STRATEGI · INGEN VERKLIG BACKTEST  
**Researchbranch:** `research/trading-ifvg-b-only-evaluation-20261019`  
**Bas:** `research/trading-pattern-decision-matrix-20261019`, SHA `a99b6088fcb5ac8c215701f4315dda37747e5b1f`

## Bakgrund

Användaren förmedlade ett svar från strategikontakt Axel: ursprungs-FVG både **före** (A) och **efter** manipulationen (B) kan vara giltiga, men **B uppges vara vanligast**. I nästa svar föreslog Axel att vi skulle **köra enbart B och se vad resultatet blir**.

Detta arbete tolkar detta som ett **testuppdrag / hypotes**, inte som ett fullständigt, godkänt B-only-filter för den kanoniska strategin. Vi kan testa B separat och jämföra vad som försvinner, men vi ska inte påstå att Axel har gett en statistiskt verifierad regel eller att användaren uttryckligen godkänt att A förbjuds i slutlig strategi.

**Tidigare godkänt av användaren:** iFVG = **Inversion Fair Value Gap**, och invertering bekräftas av att en **helt färdig 1m-candle STÄNGER strikt bortom ursprungs-FVG:s bortre gräns**. Wick räcker inte; bekräftelsen får först användas efter candlens stängning. Det är fortfarande en separat *delregel*, inte hela GATE-01.

## Experimentdesign

Koden ligger endast i `scripts/trading/research/ifvg-b-only-study.mjs` och bygger på den redan existerande syntetiska forskningsfunktionen `inspectIfvg`.

Den jämför exakt samma **påhittade** 4-candlesekvens under två explicit valda former:

- **B-only:** `formation: "AFTER_MANIPULATION"`. Ursprungsgapets tredje FVG-candle måste vara **stängd strikt efter** `manipulationCompleteAt` för att gapet ska få följas. Inverteringen kräver också tidigare godkänd `crossing: "CLOSE_BEYOND_FAR_EDGE"`.
- **A+B, kontrollgrupp:** `formation: "ANY"`; här kan ursprungsgapet vara äldre, medan inverteringen fortfarande måste bekräftas efter manipulationen och av en färdig close.

Detta är ett isolerat **filterjämförelsetest**, inte ett motorbygge som upptäcker en riktig manipulation eller en riktig Nasdaq/ES-setup. Manuell `manipulationCompleteAt` ingår i syntetiska fixtures.

## Utfallet av de syntetiska testfallen

| Fall | B-only kandidater | A+B kandidater | Tolkning |
|---|---:|---:|---|
| Ursprunglig FVG färdig **samtidigt med / före** manipulationens avslut | 0 | 1 | B filtrerar bort den gamla zonen |
| Ursprunglig FVG färdig **efter** manipulationens avslut | 1 | 1 | B behåller den nyligen färdiga zonen |
| FVG:s tre candles **sträcker sig över** manipulationen, men sista candlen stänger efteråt | 1 | 1 | Viktig ännu öppen gränsregel: nuvarande B-kandidat räknar **gapets slutförande**, inte att alla tre candles måste komma efter |

**En observation är INTE en trade.** Testfunktionen returnerar `entryPermitted:false`, saknar risk/SL/TP/exekvering och kan inte räkna lönsamhet. Ingen skillnad i hit rate, expectancy, PnL eller profit factor går att beräkna av dessa fyra syntetiska bars.

### Nytt identifierat tolkningsbehov

”FVG bildas efter manipulationen” kan betyda två olika tekniska regler:

1. **Efter avslutad FVG-bildning:** tredje candlen har stängt efter `manipulationCompleteAt` (körda B-only-researchvarianten).
2. **Hela FVG:s tre-candle-sekvens efter manipulationen:** även den första candlen öppnar vid/efter manipulationens slut (striktare, ännu inte godkänd och **inte** representerad av befintlig `formation:"AFTER_MANIPULATION"`).

Vi får inte omärkligt ersätta (1) med (2). Den skillnaden behöver ett separat mänskligt beslut och framtida golden-fixtures.

## Verifiering

**62/62 PASS**, Node 22.22.3 på användarens anslutna Windows-stationära dator, i en separat temporär mapp med exakt researchkod från commit `20d84b50f53632f7333e132281100c33eb9a5fd9`.

- 52 befintliga pattern gate unit- och reviewtester passerade igen.
- 10 nya B-only-tester: åldersfilter, bekräftelse efter manipulation, gräns vid cutoff, tre-candle-spanning, anti-lookahead, wick-avvisning, fail closed för unsettled/real data, ingen trading authority, oförändrat OPEN-registry och deterministisk offline-kod.

Kör igen från repo-roten med:

```bash
node --test \
  scripts/trading/research/pattern-candidates.test.mjs \
  scripts/trading/research/pattern-candidates-mirror.test.mjs \
  scripts/trading/research/equal-smt-candidates.test.mjs \
  scripts/trading/research/pattern-decision-matrix.test.mjs \
  scripts/trading/research/ifvg-b-only-study.test.mjs
```

För att skriva ut aktuella syntetiska studieobjekt (ingen API-nyckel eller tjänst behövs):

```bash
node --input-type=module -e "import('./scripts/trading/research/ifvg-b-only-study.mjs').then(m => console.log(JSON.stringify(m.runIfvgBOnlyStudy(), null, 2)))"
```

## Safety/governance

`docs/trading-system/research/pattern-gates-pending-v0.1.json` är **inte ändrad** i detta experiment: `creationVsManipulationOrder:null`, GATE-01..04 `OPEN`, alla `approvedDetectionVersion:null`, `canProduceStrategySignals:false`, `canAuthorizeExecution:false`.

Vi har **inte** köpt/hämtat historik, valt NQ/ES-kontrakt, satt en kanonisk B-only-regel, skapat trades, skickat order, kontaktat en broker, startat CI eller gjort deploy. Inget faktabaserat påstående om strategi-edge kan göras.

**Rekommenderat nästa steg:** när vi valt om ”efter manipulation” betyder att hela tre-candle-fönstret ska vara efteråt eller enbart färdig FVG-bildning, definiera flera tydliga golden-exempel med både long och short, och först därefter granska gapets mitigation, invalidation, livslängd och prioritet. Parallellt krävs verklig licensierad prisdata för en riktig backtest.
