# Contradiction Register – Canonical v1.0

**Dokument:** Omnira Trading System – Contradiction Register
**Version:** v1.0
**Datum:** 2026-08-27
**Granskat material:** Kapitel 1–20 samt fyra Fas 0-specifikationer
**Status:** Uppdaterad 2026-08-27 efter canonical-beslut. C-01, C-02 och C-03 är STÄNGDA.
**Ändringsspår:** se `Canonical Amendments v1.0.md`

---

## Läsanvisning

Detta register listar varje motsägelse, tvetydighet och konsistensrisk som hittades
under den kontrollerade canonical-genomgången.

**Ingen post i detta register har lösts genom gissning.**

Poster märkta `KVARSTÅR` kräver ett explicit mänskligt beslut innan berörd
implementation får påbörjas. Poster märkta `NORMALISERAD` avser dokumentationsform,
inte tradinginnehåll. Poster märkta `STÄNGD` har fått ett explicit canonical beslut;
beslutet och den exakta textändringen finns i `Canonical Amendments v1.0.md`.

**Statusöversikt efter 2026-08-27:**

| Post | Status |
|---|---|
| C-01 Daily-loss force close | **STÄNGD** |
| C-02 Reserved risk | **STÄNGD** |
| C-03 London window-close BE | **STÄNGD** |
| C-04 Auktoritetskedja förkortad | NORMALISERAD |
| C-05 "Partial" överlagrad term | NORMALISERAD |
| C-06 Statusblock saknas | DELVIS ÅTGÄRDAD |
| C-07 Tredjepartsvillkor i Kapitel 12 | KVARSTÅR som referensvarning |
| C-08 Word-låsfil | NOTERAD |

Allvarlighetsgrad:

| Grad | Innebörd |
|---|---|
| HÖG | Regeln kan inte implementeras deterministiskt, eller två låsta regler ger olika utfall |
| MEDEL | Reell logisk lucka som får konsekvens i kod eller backtest |
| LÅG | Form-, terminologi- eller läsbarhetsrisk utan regelkonflikt |

---

## C-01 — Daily-loss force close saknar nåbar trigger

**Grad:** MEDEL
**Domän:** Risk
**Status:** **STÄNGD 2026-08-27**

> **Beslut:** Den interna dagsregeln tvångsstänger inte en öppen position. Mätaren förblir
> realiserad. Vid `realized_daily_loss >= $450` blockeras nya trades och state blir
> `BLOCKED / DAILY_STOP`, persistent över restart, med audit event. En öppen position
> hanteras vidare av SL, TP, canonical BE, London window-close BE, news exit, NY time exit,
> emergency-kontroller och Prop Firm Rules. Prop-lagret kan vara striktare.
>
> Se `Canonical Amendments v1.0.md` avsnitt B1, B4, B5, B6.

**Källor i konflikt (historik)**

- Kapitel 4, *Daily drawdown*: "den interna daily loss-beräkningen baseras på realiserade förluster. Floating P/L används inte som den interna Omnira daily-loss-mätaren."
- Kapitel 4, *Daily stop*: "Om en position fortfarande är öppen när daily-loss-gränsen bryts ska positionen stängas direkt."
- Risk Engine Specification v0.1 §20 och Strategy Specification §25: `max_open_positions = 1`, ingen ny position får öppnas medan en annan är öppen.

**Problemet**

Med en mätare som endast räknar realiserad förlust, och med högst en öppen position,
kan mätaren bara passera $450 i det ögonblick en position stängs och förlusten
realiseras. Vid den tidpunkten finns per definition ingen öppen position kvar att
tvångsstänga.

Force close-regeln har därmed ingen nåbar trigger så som reglerna nu är skrivna,
såvida inte *detektionen* av gränsbrottet sker på equity-/unrealized-basis — vilket
Kapitel 4 uttryckligen utesluter för *mätaren*.

**Vad som behöver beslutas**

Antingen:

1. Detektion av gränsbrott för force close sker på equity-/unrealized-basis medan den
   journalförda daily-loss-mätaren förblir realiserad, eller
2. Force close-regeln är redundant i v1.0 och ska formuleras om som en framtidsregel
   för `max_open_positions > 1`.

**Utfall:** alternativ 2 valdes, med explicit korrigering — regeln om intern
tvångsstängning togs bort som logiskt ohållbar, i stället för att införa
floating-baserad detektion som hade motsagt realized-only-modellen.

---

## C-02 — Reserved risk kontra realiserad daily-mätare

**Grad:** MEDEL
**Domän:** Risk
**Status:** **STÄNGD 2026-08-27**

> **Beslut:** Reserved risk är en pre-entry-kontroll:
> `realized_daily_loss + reserved_risk_for_new_trade <= daily_loss_limit`.
> Den ändrar inte definitionen av realiserad daily loss och skriver inget i mätaren.
> Reservationen frisläpps när traden stängs.
>
> Se `Canonical Amendments v1.0.md` avsnitt B2.

**Källor i spänning**

- Risk Engine Specification v0.1 §18 *Reserved Risk*: en öppen positions återstående
  möjliga förlust ska räknas som reserverad risk mot dagsbudgeten.
- Kapitel 4: dagsmätaren är realiserad, floating P/L används inte.

**Analys**

De två reglerna är förenliga om man skiljer på *mätare* och *admission control*:
reservationen är en förhandskontroll före ny trade, mätaren är realiserad utfallsdata.
Den tolkningen står dock ingenstans uttryckt.

I Strategy v1.0 är frågan praktiskt vilande, eftersom `max_open_positions = 1` gör att
ingen ny riskutvärdering kan ske medan en position är öppen. Reservationen har därför
inget att påverka.

**Utfall:** frågan är nu låst normativt, inte bara för framtiden. Regeln gäller redan i
v1.0 även om `max_open_positions = 1` gör att bara en reservation kan vara aktiv åt gången.
Modellen är därmed korrekt den dag fler positioner tillåts.

---

## C-03 — London window-close och break-even

**Grad:** HÖG
**Domän:** Strategi
**Status:** **STÄNGD 2026-08-27**

> **Beslut:** Läsning 1 (forcerad BE) är canonical. En London-position som fortfarande är
> öppen 05:00 America/New_York får `SL → entry price`, även om den swing-baserade triggern
> inte har inträffat. Positionen fortsätter därefter. Ingen fyratimmarsgräns tillkommer.
> Har swing-triggern redan flyttat SL är window-close-triggern en no-op.
>
> Registrerat som CLOSED-03 i strategispecifikationen.
> Se `Canonical Amendments v1.0.md` avsnitt A1–A8.

**Källor**

- Strategy Specification Canonical v1.0 §31: "Om positionen fortfarande är öppen när
  entry-window stänger får den fortsätta. Strategins instruktion är att positionen då
  ska skyddas genom break-even-regeln."
- Kapitel 3, *London Trade Management*: identisk formulering.
- Strategy Specification §21: break-even-triggern är närmaste bekräftade 1m swing
  high/low efter entry.

**Problemet**

Formuleringen "skyddas genom break-even-regeln" vid 05:00 har två läsningar:

1. **Forcerad BE:** vid 05:00 flyttas SL till entry oavsett om §21-triggern har inträffat.
2. **Fortsatt normal BE:** 05:00 ändrar ingenting; §21 fortsätter gälla som vanligt.

De två läsningarna ger materiellt olika utfall i backtest för varje London-trade som
fortfarande är öppen 05:00 utan att ha tagit närmaste 1m swing. Skillnaden träffar
både win rate, average R och drawdown.

Båda dokumenten är eniga med varandra — tvetydigheten är *gemensam*, inte en konflikt
mellan källor. Det gör den inte mindre blockerande.

**Utfall:** GATE-05 stängd. Regeln är nu deterministisk och tidsstyrd, journalförs med
`be_trigger_type = SWING | WINDOW_CLOSE`, och testas separat i forward test.

---

## C-04 — Auktoritetskedjan återges förkortad i strategispecifikationen

**Grad:** LÅG
**Domän:** Arkitektur
**Status:** NORMALISERAD (ingen källändring)

**Källor**

- Systemarkitektur v0.1 §2 anger den fullständiga kedjan i tretton led:
  Market Data → Strategy Engine → AI Analysis → Risk Engine → Prop Firm Rules Engine →
  Trade Proposal → Approval / Automation Policy → **Execution Gateway** →
  Windows Execution Runner → MetaTrader 5 → Broker / Prop Firm → Journal & Analytics.
- Strategy Specification §35 *Separation of Authority* utelämnar Market Data,
  **Execution Gateway**, Broker / Prop Firm och Journal & Analytics.
- Strategy Specification §46 *Canonical Strategy Flow* skriver "Execution" som ett steg.

**Analys**

Detta är en förkortning, inte en motsägelse. Ingen av texterna påstår att Execution
Gateway saknas. Risken är att en implementatör som läser §35 isolerat bygger en väg
från Approval direkt till Execution Runner och därmed förlorar gateway-lagret.

**Normalisering:** *Systemarkitektur v0.1 §2 är canonical för auktoritetskedjan.*
Strategy §35 ska läsas som en delvy av samma kedja. Detta är fastställt i
`SOURCE_OF_TRUTH.md` som precedensregel. Källdokumenten är oförändrade.

---

## C-05 — "Partial" används i två skilda betydelser

**Grad:** LÅG
**Domän:** Terminologi
**Status:** NORMALISERAD (ingen källändring)

- **Strategi:** Strategy §22 och Kapitel 3 — "inga partial profits". Positionen skalas
  aldrig ut stegvis mot TP.
- **Exekvering:** Kapitel 8 *Partial Fills* och Datamodell v0.1 `partially_filled` —
  datamodellen *ska* stödja partiella fills från brokern.

Ingen konflikt: det första är en strategiregel om vinsthemtagning, det andra en
exekveringsmekanik som systemet inte kontrollerar.

**Registrerad** för att förhindra att en framtida implementatör läser "inga partials"
som att partiella fills ska avvisas.

---

## C-06 — Kapitel 4 och 5 saknar statusblock

**Grad:** LÅG
**Domän:** Dokumentation
**Status:** **DELVIS ÅTGÄRDAD 2026-08-27**

> Kapitel 4 har nu ett statusblock, tillagt i samband med att kapitlets riskregler
> reviderades. Kapitel 5 saknar fortfarande statusblock. Ingen regeländring i något fall.

Samtliga kapitel utom 4 och 5 avslutas med ett statusblock. Kapitel 4 är dessutom det
klart kortaste kapitlet i boken — 7,7 kB extraherad text mot 17–33 kB för övriga.

Detta är anmärkningsvärt eftersom Kapitel 4 är det kapitel som i praktiken **löser
samtliga åtta OPEN-RISK-poster** från Risk Engine Specification v0.1. De mest
bärande riskbesluten i hela paketet ligger alltså i det minst formellt märkta kapitlet.

**Rekommendation:** lägg till statusblock i Kapitel 4 och 5. Ingen regeländring.

---

## C-07 — Kapitel 12 innehåller tredjepartsvillkor som kan ha ändrats

**Grad:** LÅG
**Domän:** Prop firm
**Status:** KVARSTÅR (referensvarning)

Kapitel 12 återger konkreta parametrar från namngivna prop firms — bland annat
FTMO:s 2-Step- och 1-Step-modeller samt Topsteps Trading Combine med
Maximum Loss Limit $2,000 under startbalans för ett $50K-konto.

Detta är kommersiella villkor hos tredje part. De kan ändras utan förvarning och utan
att detta dokument uppdateras.

**Regel:** dessa siffror är **referensexempel, aldrig implementationskälla**. Varje
faktisk `PropFirmProfile` ska byggas mot firmans då gällande regelbok och verifieras
mot firmans egna exempel innan den aktiveras. Se GATE-09.

---

## C-08 — Kvarvarande Word-låsfil i källkatalogen

**Grad:** INFO
**Domän:** Dokumenthygien
**Status:** NOTERAD

Källkatalogen innehåller `~$ading Strategy Specification v1.0-RC1.docx` (162 byte).
Detta är en Word-ägarlåsfil, inte innehåll. Den refererar dessutom ett filnamn
(`v1.0-RC1`) som inte längre finns i katalogen — nuvarande fil är `Canonical v1.0`.

Filen har **inte** kopierats in i dokumentationsträdet. Originalet är orört.

---

## Kontrollerade punkter utan anmärkning

Följande granskades uttryckligen och visade **ingen** motsägelse mellan dokumenten:

| Kontroll | Resultat |
|---|---|
| Max risk per trade $150 | Konsistent i samtliga 18 dokument som nämner den |
| Daily loss $450 | Konsistent i samtliga 15 dokument som nämner den |
| Max 1 öppen position | Konsistent |
| Max 3 attempts per 4H thesis | Konsistent |
| Sessioner 02:00–05:00 / 10:00–12:00 America/New_York | Konsistent |
| News T-1h → T+4h, befintlig position T-15m | Konsistent |
| Minimum 2R, R:R 1:2 | Konsistent |
| Teknisk SL får aldrig flyttas för riskanpassning | Konsistent |
| Minsta handlingsbara quantity över budget = DENY | Konsistent |
| Setup grades A+/A/B/C, SMT höjer endast A → A+ | Konsistent |
| Entry på confirmation close | Konsistent |
| Ingen partial profit, ingen kontinuerlig trailing | Konsistent |
| Re-entry endast efter förlust, ej efter winner/BE | Konsistent |
| NY max 4h trade duration, London utan tidsgräns | Konsistent |
| Risk Engine och Prop Firm Engine har veto | Konsistent |
| Fail closed vid osäkerhet | Konsistent |
| Ingen normal human override av hard risk DENY | Konsistent |
| Broker state = source of truth för faktisk exponering | Konsistent |
| UI är aldrig source of truth | Konsistent |
| Reconciliation blockerar execution vid kritisk avvikelse | Konsistent |
| Atlas får föreslå men aldrig självmodifiera canonical regler | Konsistent |
| Teckenkodning i samtliga extraherade kapitel | Ren, ingen mojibake |
| Tracked changes / kommentarer i källfiler | Inga funna |

### Tillkommande kontroller efter 2026-08-27

| Kontroll | Resultat |
|---|---|
| London window-close BE entydig i Kapitel 3 och strategispecifikationen | Konsistent |
| Swing-baserad BE-trigger fortfarande korrekt och oförändrad | Konsistent |
| `be_trigger_type` separerar SWING och WINDOW_CLOSE | Konsistent |
| Daily loss $450 realized-only i samtliga dokument | Konsistent |
| Daily reset 00:00 America/New_York | Konsistent |
| Reserved risk som pre-entry-kontroll | Konsistent |
| `BLOCKED / DAILY_STOP` persistent över restart | Konsistent |
| Ingen kvarvarande intern floating force-close-formulering | Verifierad borttagen |
| Intern risk och prop firm-risk fortfarande separata lager | Konsistent |
| Prop-lagret får vara striktare och kan kräva tidigare skydd | Konsistent |

---

*Registret är en observation av materialet. Där en post är märkt STÄNGD har ett explicit
mänskligt beslut fattats — inte en tolkning gjord under granskningen.*
