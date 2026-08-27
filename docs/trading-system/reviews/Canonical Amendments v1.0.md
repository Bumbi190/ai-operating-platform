# Canonical Amendments v1.0

**Dokument:** Omnira Trading System – Canonical Amendments
**Version:** v1.0
**Datum:** 2026-08-27
**Föranlett av:** Två canonical-beslut som stängde GATE-05 och GATE-10
**Status:** Auditerbart ändringsspår

---

## Syfte

Detta dokument listar varje textändring som gjordes när de två sista blockerarna för
Canonical v1.0 stängdes.

Varje post visar **före**, **efter** och **varför**. Inget har ändrats utan att stå här.

**Originaldokumenten (`.docx`) är orörda.** Ändringarna är införda i markdown-versionerna,
som är aktiv text. Det gör det möjligt att se exakt vad som stod före beslutet.

---

## Beslut A — London window-close break-even

**Stänger:** GATE-05, Contradiction Register C-03
**Karaktär:** Disambiguering av ett redan fattat beslut, inte en ny regel

Den tidigare formuleringen "positionen skyddas genom break-even-regeln" tillät två
implementationer: forcerad BE vid 05:00, eller enbart fortsatt swing-baserad BE.

**Canonical betydelse:**

```
London-position fortfarande öppen 05:00 America/New_York
→ SL = entry price
```

Gäller även om den swing-baserade triggern ännu inte har inträffat. Positionen fortsätter
därefter. London behåller ingen fyratimmarsgräns.

### A1 — Strategy Specification §21, nytt avsnitt 21.1

**Före:** §21 definierade endast den swing-baserade triggern.

**Efter:** nytt avsnitt *21.1 Window-close break-even — London* som anger den tidsbaserade
triggern som en andra trigger för samma action, med explicit no-op om swing-triggern redan
har flyttat SL.

**Varför:** BE-regeln måste innehålla båda triggers, annars måste en implementatör
härleda den ena ur sessionsavsnittet.

### A2 — Strategy Specification §31

**Före:**

> Om positionen fortfarande är öppen när entry-window stänger får den fortsätta.
> Strategins instruktion är att positionen då ska skyddas genom break-even-regeln.

**Efter:** explicit `SL → entry price` vid 05:00, med angivelse att det sker även utan
swing-trigger, följt av att positionen får fortsätta och att exitlistan utökats med
emergency-/safety-exit. Avslutas med att regeln är deterministisk och inte discretionary.

**Varför:** detta var källan till tvetydigheten.

### A3 — Strategy Specification §45, ny CLOSED-03

**Före:** §45 dokumenterade CLOSED-01 och CLOSED-02 från v1.0-RC1.

**Efter:** CLOSED-03 tillagd, med den gamla formuleringen citerad så att rationalet bevaras.

**Varför:** dokumentet har redan en mekanism för att registrera disambigueringar utan
versionsbump. CLOSED-03 följer samma mönster.

### A4 — Strategy Specification, Dokumentstatus

**Efter:** revisionsrad tillagd som förklarar att ingen versionsbump sker enligt §44,
eftersom ingen materiell regel ändrats — endast en tvetydig formulering gjorts entydig.

### A5 — Kapitel 3, tre ändringar

- *Entry Window vs Position Management*: tillagd mening om att London har obligatorisk
  window-close BE, så att avsnittet inte läses som att inget händer 05:00.
- *Break-Even*: nytt underavsnitt *Window-close Break-Even — London*.
- *London Trade Management*: samma explicita omskrivning som A2.
- Sammanfattningsraden om break-even utökad med window-close-triggern.

### A6 — Kapitel 11, forward testing

**Efter:** testkriterier tillagda för window-close BE, inklusive fallet där swing-triggern
redan har inträffat, samt att actionen journalförs separat.

**Varför:** en regel som inte testas separat kan tyst gå sönder.

### A7 — Kapitel 13 och Datamodell, `be_trigger_type`

**Efter:** journalen ska skilja `SWING` från `WINDOW_CLOSE`. Fältet
`break_even_trigger_type` tillagt i datamodellens ändringslogg.

**Varför:** utan separationen går det inte att i efterhand mäta vad window-close-regeln
kostar eller sparar. Additivt fält, inget befintligt ändrat.

### A8 — Kapitel 10, backtesting

**Efter:** BE-analysen ska redovisa fördelningen mellan swing-BE och window-close-BE.

---

## Beslut B — Intern daily loss, reserved risk och ingen intern floating force-close

**Stänger:** GATE-10 (RISK-GATE-01), Contradiction Register C-01, samt GATE-11 / C-02
**Karaktär:** korrigering av en logiskt ohållbar regel, plus precisering

### Låst modell

```
MAX INTERNAL DAILY LOSS: $450
CALCULATION BASIS:       REALIZED LOSSES ONLY
RESET:                   00:00 America/New_York
```

**Reserved risk, pre-entry:**

```
realized_daily_loss + reserved_risk_for_new_trade <= daily_loss_limit
```

**Vid `realized_daily_loss >= $450`:** inga nya trades, state `BLOCKED / DAILY_STOP`,
execution av nya intents blockeras, persistent över restart, blockerad till nästa
canonical reset, audit event skapas.

**Ingen intern floating force-close.**

### B1 — Kapitel 4, *Daily stop*

**Före:**

> Om en position fortfarande är öppen när daily-loss-gränsen bryts ska positionen stängas direkt.

**Efter:** ersatt av det explicita DAILY_STOP-beteendet ovan, följt av ett nytt avsnitt
*Ingen intern floating force-close* som anger att den interna dagsregeln inte stänger en
öppen position, med den logiska motiveringen och listan över de regler som i stället
hanterar positionen.

**Varför:** den gamla regeln hade ingen nåbar trigger. Med en realiserad mätare och högst
en öppen position kan gränsen bara passeras när positionen redan är stängd. Att i stället
införa floating-baserad tvångsstängning hade motsagt realized-only-modellen.

### B2 — Kapitel 4, nytt avsnitt *Reserved risk*

**Efter:** reserved risk införd som pre-entry-kontroll med formeln och båda
räkneexemplen ($128 passerar, $151 nekas), samt explicit att den inte ändrar den
realiserade mätaren och frisläpps när traden stängs.

**Varför:** utan denna kontroll kunde en trade vars risk överstiger återstående dagsbudget
öppnas, eftersom mätaren är realiserad. Detta stänger även den tidigare vilande GATE-11.

### B3 — Kapitel 4, nytt statusblock

**Efter:** kapitlet har nu ett statusblock som övriga kapitel, med revisionsrad.

**Varför:** Kapitel 4 bär de tyngsta riskbesluten och saknade tidigare statusmarkering
(Contradiction Register C-06). Nu när innehållet ändrats behöver en läsare kunna se att
det är den reviderade versionen.

### B4 — Kapitel 16, *Automated Emergency Protection*

**Före:**

> Canonical riskbeslutet säger att en öppen position ska stängas när intern realized daily loss når $450.

**Efter:** omskrivet till att gränsen blockerar nya trades och sätter `BLOCKED / DAILY_STOP`,
att den interna regeln inte tvångsstänger en öppen position, samt att automatisk stängning
hör till prop-relaterade equity-/floating-/trailinggränser i Prop Firm Rules Engine.

**Varför:** detta var den enda kvarvarande platsen i boken som fortfarande hävdade intern
tvångsstängning. Utan denna ändring hade paketet motsagt sig självt.

### B5 — Kapitel 11, *Daily Stop Test*

**Före:** "öppen position hanteras enligt policy" — neutralt, eftersom policyn saknades.

**Efter:** explicita kriterier: state blir `BLOCKED / DAILY_STOP`, audit event skapas,
öppen position tvångsstängs **inte**, positionen hanteras vidare av sina egna exitregler,
och reserved risk nekar en trade som inte ryms.

### B6 — Risk Engine Specification, promotion

`Canonical v1.0 CANDIDATE` → **`Canonical v1.0`**.

- OPEN-RISK-01…08 markerade STÄNGDA, med promotionshistorik i avsnitt 0
- v0.1 §51 uttryckligen ersatt
- v0.1 §18 preciserad genom nytt avsnitt 5 om reserved risk
- nya reason codes: `DAILY_LOSS_LIMIT`, `DAILY_STOP_ACTIVE`, `RESERVED_RISK_EXCEEDED`
- CANDIDATE-filen flyttad till `archive/` med superseded-banner
- v0.1 försedd med historik-banner så att dess OPEN-RISK-lista inte läses som aktuell

---

## Dokument som medvetet **inte** ändrades

| Dokument | Varför |
|---|---|
| Kapitel 1 | Skiljer redan korrekt mellan kill switch och emergency close |
| Kapitel 12 | Skiljer redan korrekt intern realiserad modell från prop equity-modeller |
| Kapitel 2, 5–9, 14, 15, 17–20 | Ingen formulering i konflikt med de nya reglerna |
| Systemarkitektur v0.1 | Auktoritetskedjan berörs inte av dessa beslut |
| Samtliga `.docx` | Bevaras som oförändrade original |

---

## Ändrade filer

| Fil | Ändring |
|---|---|
| `specifications/strategy/…Canonical v1.0.md` | A1–A4, A7 |
| `book/chapters/03 - Strategispecifikation.md` | A5 |
| `book/chapters/04 - Riskhantering.md` | B1–B3 |
| `book/chapters/10 - Backtesting.md` | A8 |
| `book/chapters/11 - Forward testing.md` | A6, B5 |
| `book/chapters/13 - Tradingjournal.md` | A7 |
| `book/chapters/16 - Säkerhet och kill switches.md` | B4 |
| `specifications/data-model/…v0.1.md` | A7 |
| `specifications/risk/…v0.1.md` | Historik-banner |
| `specifications/risk/…Canonical v1.0.md` | Ny, B6 |
| `archive/…CANDIDATE.md` | Flyttad, superseded-banner |
