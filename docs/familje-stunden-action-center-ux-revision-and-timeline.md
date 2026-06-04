# Familje-Stunden — Action Center: UX-revision + Agent Timeline v1

**Status:** Granskningsklar design. **Ingen kod. Ingen ny funktionalitet.** Endast UX-förbättringar av
befintlig "Marknadsgranskning" + design av en aktivitetstidslinje ovanpå **befintliga** `runs` / `run_logs` /
`approvals`. Underlag: Marketing Engine v1-implementationen, Action Center (Fas 4), Campaign Planner, Channel
Drafter, Brand/Canon Guard. ⛔ Endast Familje-Stunden.

---

# DEL 1 — UX-REVISION av Marknadsgranskning

## 1.1 Nuläge (vad som finns idag)
En inbox för en operatör: header → månadschips (Juni/Juli + tema + plan-status) → köbadges (Godkända/Väntar/
Avvisade/Behöver underlag, klickbara filter) → kortlista. Varje kort: kanalikon + "Instagram · Reel" + månadschip
+ score-badge + 2-raders caption-preview + chevron; kortfot med **Godkänn / Skicka tillbaka / Redigera**; expandera
för Caption, CTA, Asset refs, Problem, Att tänka på, Tidslinje, Tekniska detaljer.

## 1.2 Utvärdering mot målen

| Fråga | Bedömning | Varför |
|------|-----------|--------|
| **Förstås sidan på 5 sek?** | 🟡 Delvis | Strukturen är tydlig, men 4 köbadges + plan-status-jargong (`draft/approved` i versaler) + dubbel kanalinfo (ikon **och** "Instagram") skapar brus. |
| **Beslut på 30 sek?** | 🔴 Nej (för blockerade) | Gröna kort: ja (ett klick). Men **warning-kort kräver expandering** för att se *varför* (t.ex. saknad landningssida) innan beslut → 3–4 klick. |
| **10 utkast på 2 min?** (12 s/st) | 🔴 Inte tillförlitligt | Kräver expandering per warning-kort. Tre synliga knappar per kort ökar besluts­friktion. Ingen "snabbväg" för rena godkännanden. |
| **Text att ta bort?** | ✅ Ja | plan-status-chip, `(follow)/(trial)` i parentes, "100/100" (siffran räcker), draft_key på ytan, edit-underrubrik. |
| **Knappar att ta bort?** | ✅ Ja | 3 knappar per kort → 1 primär + overflow. "Redigera" behövs bara när något faktiskt går att fixa. |
| **Detaljer att dölja?** | ✅ Ja | Asset refs är sällan beslutsrelevanta → bakom expander. Däremot bör **den enda blockerande orsaken** lyftas UPP till ytan. |

**Kärninsikt:** kortet visar idag *för mycket som inte påverkar beslutet* (kanal-dubblett, jargong, assets) och
*för lite av det som gör det* (orsaken till en warning). Ett beslut ska kunna fattas **utan att expandera**.

## 1.3 Förbättringsförslag

**A. Lyft beslutsorsaken till kortytan (P0).**
Visa den enda viktigaste statusraden direkt på kortet:
- Grönt (≥90, inga blockerare): inget extra — bara "Godkänn".
- Warning/blockerad: en rad i klartext, t.ex. `⚠ Landningssida saknas` eller `⚠ Saknar höstsymboler`.
- Critical: `⛔ The Prompt-element` (Godkänn redan dold).
→ Operatören behöver aldrig expandera för att veta varför.

**B. Komprimera kort-huvudet (P0).**
En rad: `◉ Reel · Juli · 80 ⚠`. Kanal som **ikon** (rosa IG / blå FB), inte ikon + ord. Ta bort månads­chipets
ram (bara text). Ta bort score-ordet "verdict"; behåll siffra + färg + emoji.

**C. En primär knapp + overflow (P1).**
Kortfot: **[ Godkänn ]** primär (grön) + **⋯** meny (Skicka tillbaka, Redigera, Visa detalj). När kortet är
**blockerat och fixbart** byts primärknappen till **[ Åtgärda ]** (öppnar inline-fix för landningssida). Det ger
*en* tydlig nästa-handling per kort.

**D. Rensa jargong (P0).**
Ta bort `draft/approved` versal-chip (visa hellre inget, eller en liten prick). Ta bort `(trial)`-parentes. Ta
bort draft_key/`status`-kod från ytan (finns kvar under "Tekniska detaljer").

**E. Dölj assets, lyft beslutsdata (P1).**
Detaljvyn: ordning **Caption → (ev.) Problem → CTA**. Flytta "Bilder (asset refs)" längst ned/bakom egen rad.
Behåll Tidslinje + Tekniska detaljer bakom expanders (redan så).

**F. Köbar som status, inte brus (P1).**
Standardfilter = **Väntar** (redan). Visa antal i varje badge; gör badge med 0 nedtonad. "Behöver underlag"
visas bara om count > 0 (annars dölj fjärde badgen → 3 badges som specat).

**G. Tomt läge som beröm (P2).**
När "Väntar" = 0: en lugn rad "Allt granskat ✓ — inget väntar." (inbox-zero-känsla) i stället för tom yta.

## 1.4 Mockups (före → efter)

**Kort — FÖRE:**
```
┌───────────────────────────────────────────────┐
│ ◉  Instagram · Reel  [Juli]  ⚠ 80/100 ⚠   ›   │
│    Sagosommar är här! Skapa egna berättelser…  │
├───────────────────────────────────────────────┤
│ [Godkänn] [Skicka tillbaka] [Redigera]         │
└───────────────────────────────────────────────┘
   (måste expandera för att se: landningssida saknas)
```

**Kort — EFTER (väntar, blockerat & fixbart):**
```
┌───────────────────────────────────────────────┐
│ ◉ Reel · Juli                         80 ⚠     │
│ "Sagosommar är här! Skapa egna berättelser…"   │
│ ⚠ Landningssida saknas                          │
│                              [ Åtgärda ]   ⋯    │
└───────────────────────────────────────────────┘
```

**Kort — EFTER (väntar, rent → ett klick):**
```
┌───────────────────────────────────────────────┐
│ ◉ Reel · Juli                         95 ✅     │
│ "Nova och Pling upptäcker sommarens första…"   │
│                               [ Godkänn ]  ⋯    │
└───────────────────────────────────────────────┘
```

**Kort — EFTER (avvisat/critical):**
```
┌───────────────────────────────────────────────┐
│ ◉ Inlägg · Juli                       40 ⛔     │
│ "Sagosommar med …"                              │
│ ⛔ The Prompt-element — kan ej godkännas         │
│                         [ Skicka tillbaka ]  ⋯  │
└───────────────────────────────────────────────┘
```

**Sidhuvud — EFTER:**
```
Marknadsgranskning
Juni · (tema ej satt)      Juli · Sagosommar
● Väntar 2   ● Avvisade 1   ○ Godkända 0
```

## 1.5 Prioriterad lista

| Prio | Förbättring | Effekt | Ansträngning |
|------|-------------|--------|--------------|
| **P0** | Lyft enda blockerande orsaken till kortytan (A) | Beslut utan expandering → klarar 30 s / 2 min | Låg |
| **P0** | Komprimera kort-huvud + ta bort jargong (B, D) | 5-sek-förståelse | Låg |
| **P1** | 1 primär knapp + overflow; kontextuell "Åtgärda" (C) | Färre klick, mindre felklick | Medel |
| **P1** | Dölj assets, ordna detalj efter beslutsvärde (E) | Mindre brus | Låg |
| **P1** | 3 badges (dölj tom "Behöver underlag"), nedtonade nollor (F) | Renare köbar | Låg |
| **P2** | Inbox-zero-läge (G) | Premium-känsla | Låg |
| **P2** | Tangentbord (j/k navigera, a godkänn) — *framtida* | Snabbare för power-user | Medel |

> Allt ovan omfördelar/döljer **befintlig** information. Ingen ny funktionalitet, ingen ny data.

---

# DEL 2 — AGENT TIMELINE v1

## 2.1 Syfte
En enkel, läsbar aktivitetstidslinje som visar vad agenterna gjort — i klartext, inte JSON. Ren **visualisering**
ovanpå befintliga `runs`, `run_logs` och `approvals`. Ingen ny agent, AI-logik eller workflow.

## 2.2 Eventmodell (visning)
Varje rad: `tid · aktör · händelse · statusprick`.
Aktörer: **Campaign Planner**, **Drafter**, **Guard**, **Operatör**.

Exempel (mål):
```
09:02  ●  Campaign Planner skapade plan för Juli (8 briefs)
09:03  ●  Drafter skapade 8 utkast
09:04  ●  Guard granskade 8 utkast  (7 ✅ · 1 ⚠)
09:05  ●  Du godkände 7 utkast
09:05  ●  Du skickade tillbaka 1 utkast
```

## 2.3 Datakällor (befintliga — inga nya tabeller)

| Tidslinjerad | Källa | Fält som används |
|--------------|-------|------------------|
| "Campaign Planner skapade plan … (N briefs)" | `runs` (kind=`marketing_campaign_planner`) + `run_logs` | `finished_at`/`created_at`; run_log-raden `✅ Plan … sparad: N briefs` |
| "Drafter skapade N utkast" | `runs` (kind=`marketing_channel_drafter`, status=`done`) **eller** `draft_posts.created_at` | aggregeras per plan/minut → antal |
| "Guard granskade N utkast (x ✅ · y ⚠ · z ⛔)" | `runs` (kind=`marketing_brand_guard`) + `guard_reports` | `verdict`-fördelning per plan |
| "Du godkände / skickade tillbaka / redigerade N" | `approvals` (kind=`marketing_draft`) | `action`, `decided_at`, `operator` |
| Fel/omförsök (om relevant) | `runs` (status=`failed`) + `run_logs` (`❌ …`) | `last_error` |

Allt scoped till `project_id = familje-stunden` (via plan/brief/draft → projekt, samt `runs.project_id`).
**Råmaterialet finns redan** — Planner/Drafter/Guard-handlers skriver redan klartext-rader i `run_logs`
(`✅ Plan … sparad`, `✍️ Utkast … sparat`, `🛡️ Guard …: warning (score 80)`), och Action Center skriver
beslut i `approvals`.

## 2.4 Aggregering (för läsbarhet)
Rå-events grupperas så tidslinjen blir kort:
- **Per plan + aktör + minutfönster** → en rad med antal. 8 guard-runs samma minut ⇒ "Guard granskade 8 utkast".
- Guard-raden summerar verdict: `(7 ✅ · 1 ⚠)` från `guard_reports.verdict`.
- Operatörsbeslut grupperas per `action` och dag: "Du godkände 7 utkast".
- Default: visa senaste **48 h** eller senaste planens cykel; "Visa äldre" expanderar.

## 2.5 Placering & format
- **Var:** en hopfällbar panel **"Aktivitet"** högst upp i Marknadsgranskning (under köbaren), default kollapsad
  på mobil, öppen på desktop. Alternativt en flik bredvid köfiltren.
- **Stil:** vertikal tidslinje, en prick per rad (grön=klar, gul=warning-utfall, röd=fel/critical, grå=pågår),
  monospace-tid, klartext-händelse. Ingen JSON, inga run_id på ytan (de ligger kvar i kortens "Tekniska detaljer").
- **Live:** återanvänd befintlig `LiveRefresh` (server-refresh var ~12 s) så den känns levande.

## 2.6 Mockup
```
Aktivitet                                    [ idag ▾ ]
│
●  09:05   Du skickade tillbaka 1 utkast
│
●  09:05   Du godkände 7 utkast
│
●  09:04   Guard granskade 8 utkast        7 ✅ · 1 ⚠
│
●  09:03   Drafter skapade 8 utkast
│
●  09:02   Campaign Planner skapade plan — Juli (8 briefs)
│
└─ Visa äldre
```
Mobil: samma lista, full bredd, tid till vänster, prick + text; panelen fälls in bakom "Aktivitet ▾".

## 2.7 Implementationsförslag (ingen kod nu)
1. **Datalager** `lib/marketing/timeline.ts` → `getMarketingTimeline(db, { sinceHours=48, planId? })`:
   läser `runs` (marketing_*), `run_logs` (för antal/“N briefs”), `guard_reports` (verdict-summa per plan),
   `approvals` (operatörsbeslut). Mappar → `TimelineEvent[] { at, actor, text, tone }`, aggregerar enligt 2.4,
   sorterar fallande. Ren och read-only (samma mönster som `review.ts`).
2. **UI** liten serverkomponent/panel som renderar listan i Marknadsgranskning + återanvänder `LiveRefresh`.
   Inga nya endpoints krävs (server-fetch som review). Vid behov: `GET /api/marketing/timeline` för klient-refresh.
3. **Ingen** ny tabell, agent, workflow eller AI — endast läsning + formattering.
4. **Ansträngning:** låg–medel (ett datalager + en panel). Kan byggas isolerat utan att röra Planner/Drafter/Guard.

## 2.8 Avgränsning
Endast visualisering av redan loggad aktivitet. Ingen styrning, ingen ändring av agenter, ingen publicering.
Run_id/teknisk detalj förblir dolt bakom befintliga expanders.

---

## Sammanfattning av leverabler
1. **UX-revision** — utvärdering mot alla sex frågor + 7 förbättringar (A–G) + prioriterad lista (P0–P2).
2. **Timeline-design** — eventmodell, aggregering, placering, format.
3. **Datakällor** — `runs` + `run_logs` + `guard_reports` + `approvals` (inga nya tabeller).
4. **Mockup** — kort före/efter, sidhuvud, tidslinje (desktop + mobil).
5. **Implementationsförslag** — ett datalager + en panel, återanvänder `LiveRefresh`; låg–medel ansträngning.

Inget av detta inför ny funktionalitet — det omfördelar/visualiserar befintlig data för snabbare, lugnare beslut.
