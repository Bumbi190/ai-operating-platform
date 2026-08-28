# Omnira Trading System – Documentation

**Status:** **Canonical v1.1** · 2026-08-28
**Språk:** Svenska (dokumentation), engelska (kod och identifierare)

> **Läs detta först.** Detta träd är auktoritativ kontext för allt arbete med Omnira
> Trading System. Det gäller Claude, Codex, Atlas och mänskliga utvecklare lika.
> Ingen implementation får påbörjas utan att relevanta delar av detta träd är lästa.

---

## 1. Vad detta är

Den kompletta, versionsstyrda beslutsgrunden för Omnira Trading System: en bok i
tjugo kapitel, fyra Fas 0-specifikationer, och den canonical review som knyter ihop
dem.

Detta är **inte** bakgrundsläsning. Det är den enda giltiga källan för tradingregler,
riskgränser och auktoritetsordning. Kod som avviker från detta träd är fel, även om
den fungerar.

## 2. Vad som är canonical

| Dokument | Status |
|---|---|
| `specifications/strategy/…Canonical v1.0.md` | **Canonical v1.0**, rev. 2026-08-27 |
| `specifications/risk/…Canonical v1.0.md` | **Canonical v1.0**, 0 öppna riskbeslut |
| `book/chapters/*.md` + `book/final/…Canonical v1.0.pdf` | **Canonical v1.0** |
| `specifications/architecture/…v0.1.md` | v0.1. Canonical **för auktoritetskedjan** genom precedensregel |
| `specifications/data-model/…v0.1.md` | v0.1, rev. 2026-08-27 |

`.md` är aktiv text. `.docx` i `book/source/` och `specifications/` är historiska
original och kan avvika — vid konflikt vinner alltid `.md`. Se
`reviews/Canonical Amendments v1.0.md`.

## 3. Vad som är arkiverat

| Dokument | Varför |
|---|---|
| `archive/…Canonical v1.0 CANDIDATE.md` | Ersatt när RISK-GATE-01 stängdes |
| `archive/…Canonical Candidate v1.0.pdf` | Ersatt av Canonical v1.0-PDF:en |
| `specifications/risk/…v0.1.md` | Historiskt. Dess OPEN-RISK-lista är **inte** aktuell |

Arkiverade dokument är revisionsspår. Använd dem aldrig som implementationsunderlag.

## 4. Regler som aldrig får gissas

Om svaret inte står uttryckligen i detta träd — **fråga, implementera inte.**

- exakt iFVG- och CISD-detektion (GATE-01, GATE-02)
- equal-high / equal-low-tolerans (GATE-03)
- SMT correspondence och timing (GATE-04)
- news-provider och high-impact USD-klassificering (GATE-06, GATE-07)
- marknadsdataprovider, contract rollover och kontraktsserie (GATE-08)
- PropFirmProfile-parametrar och providerkompatibilitet (GATE-09)
- execution safety margin och slippagetröskel (GATE-12)
- **val av futures execution provider (GATE-15)**
- **Execution Provider Adapter-kontrakt (GATE-16)**
- **execution runtime- och deploymenttopologi (GATE-17)**

GATE-15 och GATE-16 blockerar **connectivity-kod och connectivity proof**, inte den
utredning och kontraktsdesign som krävs för att stänga dem. Det arbetet får börja direkt.
- promotion thresholds och live safety policies (GATE-13, GATE-14)

Riskgränser, sessioner, entry, SL, TP, break-even, re-entry och news-regler får
**aldrig** härledas, avrundas eller "förbättras" i kod. De ändras bara genom en ny
versionsidentifierare.

### Låst sedan 2026-08-27 — härled inte om

**London window-close break-even.** En London-position som fortfarande är öppen
05:00 America/New_York får `SL → entry price`, även om den swing-baserade 1m-triggern
inte har inträffat. Positionen fortsätter därefter. Ingen fyratimmarsgräns för London.
Journalförs som `be_trigger_type = WINDOW_CLOSE`.

**Intern daily loss.** `$450`, **realized only**, reset `00:00 America/New_York`.
Floating P/L ingår inte i den interna mätaren.

**Reserved risk.** Pre-entry:
`realized_daily_loss + reserved_risk_for_new_trade <= daily_loss_limit`.

**Ingen intern floating force-close.** Den interna dagsregeln stänger inte en öppen
position. Vid `realized_daily_loss >= $450`: `BLOCKED / DAILY_STOP`, persistent över
restart, audit event. Prop-lagret får vara striktare.

## 5. Auktoritetsordning

```
Market Data → Strategy Engine → AI Analysis → Risk Engine → Prop Firm Rules Engine
→ Trade Proposal → Approval / Automation Policy → Execution Gateway
→ Execution Provider Adapter → Futures Execution Provider → Journal & Analytics
```

Ingen komponent får kringgå ett efterföljande säkerhetslager.

En Strategy Signal är inte en order. En AI-rekommendation är inte ett risktillstånd.
Ett Risk PASS är inte execution approval. Ett Trade Proposal är inte en skickad order.

Broker state är source of truth för faktisk exponering. UI är aldrig source of truth.

## 6. Risk och Prop kan inte kringgås

Risk Engine och Prop Firm Rules Engine har **veto**. Båda måste passera. Vid olika
gränser vinner den striktaste.

Det finns **ingen** normal human override av ett hard risk `DENY`. Ingen
"Trade anyway"-knapp får byggas. Vill man ändra en riskregel ändrar man RiskProfile
genom versionsstyrd governance.

Vid osäkerhet: **fail closed.** Avsaknad av information är aldrig grund för att
tillåta trading.

## 7. AI får inte ändra produktionsregler

Atlas får observera, mäta, upptäcka mönster, skapa hypoteser och **föreslå**
kandidatversioner.

Atlas får inte ändra canonical strategi, aktiv RiskProfile, prop firm-regler eller
exekveringsregler. Atlas får inte ge sig själv approval, promovera sig själv till
live, eller höja risk automatiskt.

```
Observe → Measure → Detect Pattern → Create Hypothesis → Candidate Version
→ Backtest → Out-of-Sample → Forward Test → Review / Approval → Ny Canonical Version
```

*Self-Improvement är inte Self-Modification.*

## 8. Backtest/replay/live-paritet

Samma regeldefinition ska ge samma utfall i backtest, market replay och live.

Detta är hela skälet till att iFVG och CISD måste ha deterministiska detection rules
före implementation: om ett pattern definieras på ett sätt i backtest och ett annat
live har systemet i praktiken två olika strategier, och all historisk validering
förlorar sitt bevisvärde.

Ingen AI-modell får tolka vad som "ser ut som" ett entrykritiskt pattern.

## 9. Kontrollera gates före varje fas

Läs `reviews/Open Implementation Gates v1.0.md` innan en ny fas påbörjas. Varje gate
är klassificerad efter exakt vilken fas den blockerar.

**Ingen gate blockerar Fas 1**, som dessutom redan är genomförd (PR #96). **Fas 2 är
sedan 2026-08-28 grindad** av GATE-15 och GATE-16 — en provider måste väljas innan
read-only-connectivity kan bevisas. Fas 3 kräver GATE-01, 02, 03, 04 och 08.

Fjorton gates är öppna. GATE-05, GATE-10 och GATE-11 stängdes 2026-08-27;
GATE-15, GATE-16 och GATE-17 tillkom 2026-08-28.

Canonical fasordning enligt Kapitel 20:

```
Fas 0 Specs → Fas 1 Trading Core → Fas 2 Futures Connectivity (Read Only) → Fas 3 Strategy Engine
→ Fas 4 AI Analysis → Fas 5 Risk Engine → Fas 6 Manual Approval
→ Fas 7 Demo Automation → Fas 8 Backtest + Forward → Fas 9 Prop Firm Mode
→ Fas 10 Controlled Live
```

**Nästa fas: Fas 2 – Futures Connectivity (Read Only).** Implementationen är blockerad av
GATE-15 och GATE-16; utvärdering av provider och design av adapterkontraktet är nästa
konkreta arbete och är inte blockerat.

## 10. Versionering av dokumentationen

Varje materiell ändring av entry, confirmation, SL, TP, setup grades, sessioner,
news-regler, break-even, re-entry, trade duration eller strategifilter kräver en **ny
versionsidentifierare**. Gamla resultat får aldrig automatiskt räknas som resultat
för en ny version.

Detsamma gäller RiskProfile och PropFirmProfile.

Promotion från CANDIDATE till Canonical ska vara ett explicit event med
Promotion Record: gammal version, ny version, tester, approval, aktiveringsdatum och
rollback-plan.

Ändra aldrig ett canonical dokument på plats utan versionsändring.

---

## Träd

```
docs/trading-system/
├── README.md                    ← du är här
├── SOURCE_OF_TRUTH.md           ← precedensregler vid konflikt
├── CHECKSUMS.md                 ← SHA-256 för alla artefakter
├── CHECKSUMS.sha256             ← maskinverifierbart manifest
├── book/
│   ├── source/                  20 kapitel, historiska .docx-original
│   ├── chapters/                20 kapitel, AKTIV kanonisk text
│   └── final/                   Canonical v1.0-PDF
├── specifications/
│   ├── strategy/                Canonical v1.0
│   ├── architecture/            v0.1
│   ├── data-model/              v0.1
│   ├── risk/                    Canonical v1.0 + v0.1 (historik)
│   ├── prop-firm/               tom, gated av GATE-09
│   └── pattern-detection/       tom, gated av GATE-01/02
├── reviews/
│   ├── Canonical Review v1.0.md
│   ├── Open Implementation Gates v1.0.md
│   ├── Contradiction Register v1.0.md
│   └── Canonical Amendments v1.0.md   ← före/efter för varje ändring
└── archive/                     superseded, aldrig implementationsunderlag
```

**Vid tveksamhet:** läs `SOURCE_OF_TRUTH.md`. Avgör aldrig precedens själv.
