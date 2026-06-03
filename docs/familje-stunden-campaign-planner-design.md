# Familje-Stunden — Campaign Planner v1 (Designspec)

**Status:** Granskningsklar design. **Ingen implementation.** Endast arkitektur, dataflöde, ansvar och beslutslogik.
**Källor (enbart):** Brand Rules · Character Bible v2 · Theme Bible v1 · Content Bible v1 · Marketing Bible v1 · RevenueIntel/Stripe.
⛔ The Prompt / AI News / andra projekt används ALDRIG. Allt scoped till `project_id = "familje-stunden"`.
Märkning: [KANON]=verifierad KB-fakta · [OSÄKER]=tolkning · [LUCKA]=saknas (genereras aldrig).

---

## 0. Vad Campaign Planner ÄR (och inte är)
Campaign Planner är **den första produktionsagenten** i Familje-Stunden Marketing Engine. Den är en **ren planerare**:
den läser kunskapsbasen + affärssignaler och producerar **en strukturerad månadskampanjplan** (kalender + content briefs).
Den **skriver inte färdig copy**, **väljer inte slutgiltiga bilder pixel-för-pixel**, **publicerar inte** och **anropar inga kanal-API:er**.
Allt det görs nedströms av Channel Drafters, Brand/Canon Guard, operatörsgodkännande och Publisher.

> Planerarens enda jobb: *"Givet månad X och nuvarande affärsläge, vad ska sägas, när, på vilken kanal, med vilken vinkel och vilka kanoniska tillgångar — så att Channel Drafters kan skriva utkast utan att gissa."*

---

## 1. Arkitektur

### 1.1 Placering i Marketing Engine
```
        KB (Brand/Character/Theme/Content/Marketing Bible + index.json)
        RevenueIntel / Stripe (live affärssignaler)
                         │
                         ▼
              ┌─────────────────────┐
              │  CAMPAIGN PLANNER    │  ← DENNA AGENT (v1)
              │  månad → kampanjplan │
              └─────────────────────┘
                         │  campaign_plan.json (utkast, status=draft)
                         ▼
              [Operatörsgranskning av PLAN]  ← människa godkänner planen först
                         │  status=approved
                         ▼
              [Channel Drafters: IG, FB]  → konkret copy + valda assets per brief
                         ▼
              [Brand/Canon Guard]  → validerar mot KB ──fail──▶ tillbaka
                         ▼
              [Operatörsgodkännande av UTKAST]
                         ▼
              [Publisher (gated, egna tokens)]
                         ▼
              [Insights → Operations Center → tillbaka till Planner (v3-loop)]
```

### 1.2 Interna moduler i Campaign Planner (logiska steg, ej kodfiler)
| # | Modul | Ansvar (kort) |
|---|-------|---------------|
| A | **KB Loader** | Läser brand-rules, aktivt tema, character v2, content-bible, marketing-bible, asset-index. Read-only. |
| B | **Theme Resolver** | Bestämmer aktivt + nästa tema utifrån planeringsmånad (steg 3). |
| C | **Angle Selector** | Väljer kampanjvinkel + emotionell pelare ur Marketing Bible (steg 4). |
| D | **Revenue Reader** | Läser Stripe-signaler → sätter kampanjmål/tonvikt (steg 5). |
| E | **Calendar Builder** | Bygger månadskalender per beat × kanal (steg 6). |
| F | **Brief Generator** | Skapar content briefs för IG/FB per kalenderpost (steg 7). |
| G | **Gap Guard** | Markerar/ersätter [LUCKA]-data, blockerar påhitt (steg 9). |
| H | **Plan Emitter** | Serialiserar allt till `campaign_plan.json` (steg 2 + 10). |

### 1.3 Infrastruktur (återanvänd, neutral)
Körs som ett **durable workflow run** (`pending → drain → done/failed`, retry/heartbeat) scoped till
`project_id="familje-stunden"`. Output lagras som en rad i en `campaign_plans`-tabell (status `draft/approved/archived`)
+ JSON-blob. **Ingen delad data/KB/tokens med The Prompt.** [KANON: isoleringsregel]

---

## 2. Dataflöde (end-to-end för planeraren)

```
INPUT
  trigger { project_id, target_month, planning_mode, lead_offset }
        │
        ▼
[A KB Loader] ── läser ──▶ brand-rules.md, themes/index.json + <månad>.md,
        │                   nova-v2.md, pling-v2.md, content-bible/*, marketing-bible.md,
        │                   characters/index.json (asset-register)
        ▼
[D Revenue Reader] ── läser ──▶ RevenueIntel: { active, trialing, mrr, trial→paid, churn }
        ▼
[B Theme Resolver]  → active_theme + next_theme  (+ gap-flagga om tema=[LUCKA])
        ▼
[C Angle Selector]  → primary_angle + emotional_pillar + proof_points + forbidden_check
        ▼
[E Calendar Builder] → kalender: beats (teaser→lansering→mitt→bro) × kanaler (IG, FB) × datum
        ▼
[F Brief Generator]  → en content_brief per kalenderpost (vad, vinkel, asset-ref, CTA, format)
        ▼
[G Gap Guard]        → varje fält klassat KANON/OSÄKER/LUCKA; inga påhittade fakta
        ▼
[H Plan Emitter]     → campaign_plan.json (status=draft)
        ▼
OUTPUT → operatörsgranskning → (approved) → Channel Drafters
```

**Princip:** planeraren **läser KB först, alltid**, och allt den föreslår ska kunna spåras till en KB-rad eller en
Stripe-siffra. Saknas underlag → `[LUCKA]` + `human_input_needed`, aldrig en uppfunnen detalj. [KANON-princip ur Engine-design §3]

---

## 3. Agentansvar (vad Planner äger vs. inte äger)

**Planner ÄGER:**
- Val av aktivt/nästa tema (utifrån kalender).
- Val av kampanjvinkel + emotionell pelare (ur Marketing Bible).
- Tolkning av Stripe-läget → kampanjmål och tonvikt.
- Månadskalenderns struktur: beats, datum, kanalmix, kadens.
- Content briefs (instruktion till Drafters) inkl. asset-*referenser* och CTA-*val*.
- Gap-märkning + flaggor för mänsklig input.

**Planner ÄGER INTE (nedströms):**
- Slutlig copy/bildtext → **Channel Drafter**.
- Slutligt assetval/derivat → **Asset Selector** (Drafter använder Planner-referensen som hint).
- Kanonvalidering → **Brand/Canon Guard**.
- Publicering/schemaläggning → **Publisher** (gated, egna tokens).
- Mätning → **Insights**.

---

## 4. Beslutslogik

### Steg 3 — Hur agenten väljer aktivt tema
1. `target_month` kommer från triggern (default = nästa månad ⇒ förlansering, `lead_offset=1`). [OSÄKER default]
2. **Theme Resolver** slår upp månaden i `themes/index.json` → motsvarande `themes/<månad>.md`. [KANON: fast 12-månaderscykel]
3. `active_theme` = temat för `target_month`; `next_theme` = temat för `target_month + 1` (för "bro till nästa tema"). [KANON: bro-mönster finns i diplom/saga]
4. **Gap-regel:** om temat är ofastställt (juni `juni-ej-faststallt.md`; december-innehåll [LUCKA]) → Theme Resolver sätter
   `theme_status="LUCKA"` och eskalerar via Gap Guard istället för att hitta på ett tema. [KANON: juni/dec-luckor]
5. Theme Resolver extraherar de KB-fält Drafters behöver: syfte, känslomässig ton, typiska aktiviteter, återkommande
   symboler, **"vad som inte hör hemma"** (negativ guardrail), nyckelbild-referens. [KANON ur theme-filen]

### Steg 4 — Hur agenten väljer kampanjvinkel ur Marketing Bible
1. **Angle Selector** läser Marketing Bible §10 (Tema→Marknadsvinkel-mappning) för `active_theme` → grundvinkel. [KANON tema-hook / OSÄKER vinkeltext]
2. Väljer **en primär emotionell pelare** (Marketing Bible §2) som matchar temat, t.ex. höst/skörd → "Närhet" + "Ritual/förväntan". [OSÄKER matchning]
3. Hämtar **proof points** + **kärnbudskap** (§1, §5) och **godkända vinklar** (§7) som tillåtna byggstenar.
4. Kör **forbidden-check** mot §8: filtrerar bort allt som är förbjudet (The Prompt-element, skrämmande motiv,
   ogrundade utvecklingslöften, skärmtids-skambudskap, överdrifter mot vad paketet levererar). [KANON/OSÄKER]
5. Sätter **CTA** ur §9: primär = "Prova gratis" (provmånad → landningssida); sekundär = "Starta prenumeration"/"Ge bort"/"Följ @familjestunden". [KANON]
6. Resultat: `{ primary_angle, emotional_pillar, core_message, proof_points[], approved_angle_tags[], cta }` — varje fält canon-märkt.

### Steg 5 — Hur agenten använder Stripe-data
RevenueIntel ger `{ active, trialing, mrr, trial_to_paid, churn }`. Planeraren **ändrar inte innehållets kanon** utan
**tonvikt och mål** (regelbaserat, ej påhittat):

| Signal | Beslut (kampanjmål/tonvikt) | Säkerhet |
|--------|------------------------------|----------|
| Många `trialing`, låg `trial→paid` | Lägg extra beat på **konvertering** (visa "vad ingår denna månad", CTA "Starta prenumeration"). | [OSÄKER regel] |
| `churn` ↑ | Förstärk **retention/ritual**-budskap (diplomsamling, "se fram emot nästa månad"). | [OSÄKER regel] |
| Lågt `active` vs. mål 200/år | Tyngdpunkt på **awareness + provmånad** (CTA "Prova gratis"). | [KANON mål 200; OSÄKER regel] |
| Stabil tillväxt | Balanserad mix; lyft upsell (Bok 129 / Box 199). | [KANON pris; OSÄKER regel] |
| Stripe **otillgänglig** | Sätt `revenue_status="LUCKA"`, kör default-balanserad plan, flagga. | [KANON gap-princip] |

Stripe påverkar **kampanjmål, beat-vikter och CTA-prioritet** — aldrig temats eller karaktärernas kanon.

### Steg 6 — Hur agenten genererar månadskalendern
1. **Beats (fast mönster)** [KANON ur Engine-design §4 + diplom/saga-bro]:
   **(1) Teaser/förlansering → (2) Lansering → (3) Mitt-i-månaden (engagemang/pyssel) → (4) Slut + bro till nästa tema.**
2. **Kanaler v1:** Instagram + Facebook (Pinterest/e-post = v2). [KANON låst omfattning]
3. **Kadens v1 (default, OSÄKER — operatör justerar):** ~6–9 poster/månad fördelat:
   Teaser 1–2 (IG Reel + FB-inlägg), Lansering 2 (IG karusell + FB temalansering), Mitt 2–3 (IG Stories/pyssel-demo + FB community-fråga), Bro 1 (IG + FB "Nästa gång…").
4. Varje kalenderpost får: `date` (eller `week`), `beat`, `channel`, `format`, `content_type`, `brief_ref`.
5. **Datumlogik:** lansering ankras till månadsskiftet (paketet släpps månadsvis); teaser ligger sista dagarna i föregående
   beat-fönster; bro i slutet. Exakta veckodagar = [OSÄKER] tills engagemangsdata finns (v3). [KANON: månadsvis kadens]

### Steg 7 — Hur agenten genererar content briefs (IG & FB)
En **content brief** är planerarens instruktion till en Channel Drafter — tillräckligt komplett för att skriva utkast **utan att gissa**:
- `channel` (instagram | facebook), `format` (reel | carousel | story | single_post | fb_post | fb_event),
- `beat`, `objective` (awareness/konvertering/engagemang/retention),
- `emotional_pillar` + `primary_angle` + `core_message` (ur §1/§2/§5),
- `key_points[]` (3–5 budskapspunkter, byggda av godkända vinklar §7),
- `asset_refs[]` — **referenser** till kanoniska tillgångar via `index.json`/`covers/<månad>.png`/Nova & Pling-poser (Drafter/Asset Selector hämtar faktisk fil),
- `character_usage` (Nova = kännande/nyfiken hook; Pling = lekfull/förklarande wow — ur Character Bible v2), [KANON roller]
- `cta` (ur §9) + `landing_url_slot` (funnel-ankare),
- `must_not[]` (temats "vad som inte hör hemma" + Marketing Bible §8 forbidden),
- `canon_level` per fält + `tone` (varm, trygg, magisk, svensk).

Briefen innehåller **ingen färdig caption** — bara råmaterial och regler. Drafter skriver texten; Guard validerar.

### Steg 8 — Hur agenten planerar beat-bågen (teaser → lansering → mitt → bro)
| Beat | Syfte | Kanal/format (typ) | Vinkel/pelare | CTA |
|------|-------|--------------------|---------------|-----|
| **Teaser** | Väck nyfikenhet inför månadens tema | IG Reel + FB-inlägg | Magi/fantasi + "något att se fram emot" | "Följ @familjestunden" / mjuk "Prova gratis" |
| **Lansering** | Presentera månadens äventyr + vad som ingår | IG karusell + FB temalansering | Value prop + Enkelhet ("ingen planering") | "Prova gratis" → landningssida |
| **Mitt-i-månaden** | Engagemang, pyssel-demo, gemenskap | IG Stories/Reel + FB community-fråga | Närhet + Lärande genom lek | "Starta prenumeration" / dela |
| **Bro** | Avsluta + brygga till nästa tema | IG + FB "Nästa gång ses vi i …" | Ritual/förväntan | "Prova gratis" / "Följ" |

Bro-beatet använder **samma "Nästa gång ses vi i: <nästa månad>"-mönster** som sagorna och diplomet → använder
`next_theme` från Theme Resolver. [KANON: bro-mönster i diplom/saga]

### Steg 9 — Hur agenten hanterar saknad data ([LUCKA])
**Gap Guard** är obligatorisk innan plan emitteras. Regler:
1. **Aldrig hitta på.** Saknas ett KB-fält → fältet sätts till `null` + `canon_level="LUCKA"` + post-`status="needs_input"`. [KANON-princip]
2. **Tema-lucka** (juni ofastställt; december-innehåll): planeraren **stoppar inte hela månaden** men markerar temat
   `LUCKA` och producerar endast generiska, kanon-säkra beats (varumärke + Nova & Pling + "nytt äventyr snart"),
   resten flaggas för operatör. [KANON: juni/dec-luckor]
3. **Asset-lucka** (t.ex. färgpalett/saga-text ej verifierad för Skördemånaden): brief refererar nyckelbilden men
   markerar `palette: LUCKA`; Drafter får inte uppfinna exakta färger/scener. [KANON: theme-fil luckor]
4. **Stripe-lucka**: `revenue_status="LUCKA"` → default-plan + flagga (se steg 5).
5. Alla luckor samlas i plan-objektets `gaps[]` + `human_input_needed[]` så operatör ser dem på ett ställe.

### Steg 10 — Hur outputen ska se ut för att Channel Drafters ska kunna använda den
Output är **maskinläsbar JSON** (se §6) med en `content_briefs[]`-array där varje brief är **självförsörjande**:
en Drafter ska kunna ta *en* brief och skriva ett utkast utan att läsa något annat än den briefen + de KB-filer
den pekar på. Krav på Drafter-vänlighet:
- Stabila `brief_id` (kalenderpost ↔ brief 1:1).
- Explicita `asset_refs` (sökväg/`index.json`-nyckel), inte fritext "någon Nova-bild".
- `canon_level` per fält så Drafter vet vad som är fast vs. tolkningsbart.
- `must_not[]` inbäddat i varje brief (Drafter behöver inte gå till Marketing Bible §8 själv).
- `cta` + `landing_url_slot` ifyllt.
- Inga tomma uppfunna fält — `null` + `LUCKA` istället.

---

## 5. Promptdesign (Campaign Planner systemprompt — designskiss, ej kod)

**Roll:** "Du är Campaign Planner för Familje-Stunden. Du planerar — du skriver inte färdig copy och publicerar inte."

**Hårda regler (icke förhandlingsbara):**
1. Använd **ENDAST** Familje-Stundens KB + RevenueIntel. ⛔ Aldrig The Prompt/AI News/andra projekt.
2. **Hitta aldrig på fakta.** Saknas underlag → `null` + `canon_level:"LUCKA"` + lägg i `gaps[]`. Gissa aldrig tema, datum, pris, palett eller saga-innehåll.
3. Märk varje meningsbärande fält `KANON` / `OSÄKER` / `LUCKA`.
4. Nova & Pling endast i sina kanon-roller (Character Bible v2). Inga nya karaktärer/utseenden.
5. Respektera temats "vad som inte hör hemma" + Marketing Bible §8 (forbidden angles).
6. Håll ton: varm, trygg, magisk, svensk. Barnet är hjälten.

**Indata till prompten (kontext):** brand-rules, aktivt + nästa tema (KB-utdrag), Character Bible v2-roller,
Content Bible-paketstruktur + beat-mönster, Marketing Bible §1/§2/§5/§7/§8/§9/§10, asset-index, Stripe-signaler.

**Uppgift:** "Producera `campaign_plan.json` enligt schemat: välj tema → vinkel/pelare → läs Stripe → bygg kalender
(teaser/lansering/mitt/bro × IG/FB) → en content brief per kalenderpost → kör Gap Guard → emit."

**Output-kontrakt:** giltig JSON enligt §6, `status:"draft"`, alla luckor i `gaps[]`. Ingen prosa utanför JSON.

**Self-check före emit (i prompten):** (a) varje brief har channel/format/beat/objective/angle/cta/asset_refs/must_not;
(b) inga forbidden angles; (c) inga uppfunna fakta; (d) `next_theme` satt för bro-beat; (e) alla `LUCKA` listade i `gaps[]`.

---

## 6. JSON-schema

### 6.1 Input
```json
{
  "$schema": "campaign-planner-input.v1",
  "project_id": "familje-stunden",
  "target_month": "2026-09",
  "planning_mode": "prelaunch",
  "lead_offset": 1,
  "channels": ["instagram", "facebook"],
  "revenue_signals": {
    "source": "revenueIntel",
    "active_subscribers": 5,
    "trialing": 3,
    "mrr_sek": 295,
    "trial_to_paid_rate": null,
    "churn_rate": 0,
    "annual_goal_subscribers": 200,
    "status": "KANON"
  },
  "kb_refs": {
    "brand_rules": "content/familje-stunden/_meta/brand-rules.md",
    "theme_index": "content/familje-stunden/themes/index.json",
    "character_bible": ["content/familje-stunden/characters/nova-v2.md", "content/familje-stunden/characters/pling-v2.md"],
    "content_bible": "content/familje-stunden/content-bible/",
    "marketing_bible": "content/familje-stunden/marketing-bible.md",
    "asset_index": "content/familje-stunden/characters/index.json"
  }
}
```

### 6.2 Output (`campaign_plan.json`)
```json
{
  "$schema": "campaign-planner-output.v1",
  "project_id": "familje-stunden",
  "plan_id": "fs-2026-09",
  "status": "draft",
  "generated_at": "2026-06-03T00:00:00Z",
  "target_month": "2026-09",
  "theme": {
    "key": "skordemanaden",
    "name": "Skördemånaden",
    "file": "content/familje-stunden/themes/skordemanaden.md",
    "purpose": "Skördetid — äpplen, svampar, pumpor; lärande med smak",
    "tone": "mysig, höstlig, nyfiken",
    "symbols": ["äpplen", "svampar", "pumpor", "skörd"],
    "key_visual_ref": "covers/september.png",
    "palette": null,
    "must_not": ["uppmana smaka okända/giftiga svampar utan vuxen", "andra månaders ämnen"],
    "canon_level": {"purpose": "KANON", "tone": "OSAKER", "symbols": "KANON", "palette": "LUCKA"}
  },
  "next_theme": {"key": "lov-och-skuggmanaden", "name": "Löv- & skuggmånaden", "canon_level": "KANON"},
  "campaign_angle": {
    "primary_angle": "Mysig höstskörd tillsammans — smaker, svamp och pumpor",
    "emotional_pillar": "Närhet + Ritual/förväntan",
    "core_message": "Magisk, skärmfri kvalitetstid varje månad — färdigt att använda direkt",
    "proof_points": ["ingen förberedelse krävs", "ljudsaga + diplom ingår", "59 kr + provmånad gratis"],
    "approved_angle_tags": ["skärmfri kvalitetstid", "säsong/tema", "lärande genom lek", "prisvärt + provmånad"],
    "cta": {"primary": "Prova gratis", "secondary": ["Starta prenumeration", "Följ @familjestunden"]},
    "canon_level": {"primary_angle": "OSAKER", "emotional_pillar": "OSAKER", "core_message": "KANON", "cta": "KANON"}
  },
  "revenue_strategy": {
    "focus": "awareness + provmånad (lågt active vs mål 200)",
    "beat_weighting": {"teaser": 0.2, "launch": 0.4, "mid": 0.25, "bridge": 0.15},
    "canon_level": "OSAKER",
    "based_on": "active=5, trialing=3, goal=200 [KANON]; viktningsregel [OSAKER]"
  },
  "calendar": [
    {"post_id": "fs-2026-09-01", "beat": "teaser", "channel": "instagram", "format": "reel", "week": "2026-W35", "brief_ref": "brief-01"},
    {"post_id": "fs-2026-09-02", "beat": "teaser", "channel": "facebook", "format": "fb_post", "week": "2026-W35", "brief_ref": "brief-02"},
    {"post_id": "fs-2026-09-03", "beat": "launch", "channel": "instagram", "format": "carousel", "date": "2026-09-01", "brief_ref": "brief-03"},
    {"post_id": "fs-2026-09-04", "beat": "launch", "channel": "facebook", "format": "fb_post", "date": "2026-09-01", "brief_ref": "brief-04"},
    {"post_id": "fs-2026-09-05", "beat": "mid", "channel": "instagram", "format": "story", "week": "2026-W37", "brief_ref": "brief-05"},
    {"post_id": "fs-2026-09-06", "beat": "mid", "channel": "facebook", "format": "fb_post", "week": "2026-W37", "brief_ref": "brief-06"},
    {"post_id": "fs-2026-09-07", "beat": "bridge", "channel": "instagram", "format": "reel", "week": "2026-W39", "brief_ref": "brief-07"},
    {"post_id": "fs-2026-09-08", "beat": "bridge", "channel": "facebook", "format": "fb_post", "week": "2026-W39", "brief_ref": "brief-08"}
  ],
  "content_briefs": [
    {
      "brief_id": "brief-03",
      "post_id": "fs-2026-09-03",
      "channel": "instagram",
      "format": "carousel",
      "beat": "launch",
      "objective": "awareness+trial",
      "emotional_pillar": "Närhet + Enkelhet",
      "primary_angle": "Skördemånaden är här — höstmagi utan planering",
      "core_message": "Magisk, skärmfri kvalitetstid varje månad — färdigt att använda direkt",
      "key_points": [
        "September = Skördemånaden: äpplen, svampar, pumpor",
        "Allt färdigt i ett PDF-paket — ingen förberedelse",
        "Nova & Pling guidar genom skörden",
        "Ingår: saga, ljudsaga, pyssel, diplom"
      ],
      "asset_refs": ["covers/september.png", "characters/index.json#nova_pose_default", "characters/index.json#pling_pose_default"],
      "character_usage": {"nova": "nyfiken/kännande – introducerar höstkänslan", "pling": "lekfull/förklarande – visar skörde-pysslet"},
      "cta": "Prova gratis",
      "landing_url_slot": "<landningssida-UTM>",
      "tone": "varm, trygg, magisk, svensk",
      "must_not": ["uppmana smaka okända/giftiga svampar utan vuxen", "ogrundade utvecklingslöften", "The Prompt-element"],
      "canon_level": {"key_points": "KANON/OSAKER", "asset_refs": "KANON-ref/LUCKA-innehåll", "cta": "KANON"}
    }
  ],
  "gaps": [
    {"field": "theme.palette", "level": "LUCKA", "note": "Färgpalett ej verifierad för Skördemånaden"},
    {"field": "theme.saga_text", "level": "LUCKA", "note": "Saga-PDF finns men ej textanalyserad — Drafter får inte citera handling"},
    {"field": "revenue.trial_to_paid_rate", "level": "LUCKA", "note": "Saknas i RevenueIntel"},
    {"field": "calendar.exact_weekdays", "level": "OSAKER", "note": "Optimal posttid okänd tills engagemangsdata finns (v3)"}
  ],
  "human_input_needed": [
    "Bekräfta kadens (8 poster) och exakta datum",
    "Bekräfta landningssidans UTM-URL",
    "Verifiera höstpalett innan färgkänsliga assets används"
  ]
}
```

---

## 7. Exempel — en hel månad: **Skördemånaden (september 2026)**

**Tema [KANON]:** Skördetid — äpplen, svampar, pumpor; lärande med smak. Ton: mysig/höstlig/nyfiken [OSÄKER].
Symboler: äpplen, svampar, pumpor, skörd [KANON]. Nyckelbild: `covers/september.png` [KANON-ref].
**Vad som inte hör hemma [KANON]:** uppmana smaka okända/giftiga svampar utan vuxen; andra månaders ämnen.
**Nästa tema (bro) [KANON]:** Löv- & skuggmånaden (oktober).

**Vinkel [Marketing Bible §10 + §2]:** "Mysig höstskörd tillsammans" → pelare **Närhet + Ritual/förväntan**;
kärnbudskap [KANON] "Magisk, skärmfri kvalitetstid varje månad". CTA [KANON]: primär "Prova gratis".

**Stripe-styrning [steg 5]:** active=5, trialing=3, mål=200 → **awareness + provmånad** prioriteras; lansering tyngst.

**Kalender (8 poster, IG+FB):**

| # | Beat | Kanal | Format | När | Kärnidé (för Drafter) | CTA |
|---|------|-------|--------|-----|------------------------|-----|
| 1 | Teaser | IG | Reel | v.35 | "Något mysigt på väg i september…" höst-glimt, Nova & Pling | Följ @familjestunden |
| 2 | Teaser | FB | Inlägg | v.35 | "Snart är Skördemånaden här" – väck förväntan | Följ / Prova gratis |
| 3 | Lansering | IG | Karusell | 1 sep | "Skördemånaden är här": äpplen/svamp/pumpor + vad som ingår | **Prova gratis** |
| 4 | Lansering | FB | Temalansering | 1 sep | Längre berättelse: höst hemma utan planering | **Prova gratis** |
| 5 | Mitt | IG | Stories/Reel | v.37 | Pyssel-demo: gör egen äppelmos (föräldrainstruktion-känsla) | Starta prenumeration / dela |
| 6 | Mitt | FB | Community-fråga | v.37 | "Vilken är er höstfavorit – äpple, svamp eller pumpa?" | Dela / Prova gratis |
| 7 | Bro | IG | Reel | v.39 | "Vi har skördat klart – nästa gång ses vi i Löv- & skuggmånaden" | Prova gratis |
| 8 | Bro | FB | Inlägg | v.39 | Avrunda september + teasa oktober (skuggteater/höstlykta) | Följ / Prova gratis |

**Asset-referenser [steg 7]:** `covers/september.png`, kanoniska Nova- & Pling-poser ur `characters/index.json`.
Pyssel-demo (#5) refererar paketets skörde-aktivitet "gör egen äppelmos" [KANON ur theme-fil].
Säkerhetsregel inbäddad i #5/#6: svampmoment ska alltid ske med vuxen [KANON must_not].

**Luckor i denna månad [steg 9]:**
- `palette: LUCKA` (höstfärger ej verifierade) → Drafter får inte ange exakta hex.
- `saga_text: LUCKA` (saga-PDF ej textanalyserad) → ingen citerad handling/sensmoral.
- `trial_to_paid_rate: LUCKA` → revenue-vikt är default/OSÄKER.
- Exakta postdatum: OSÄKER → operatör bekräftar.

Allt ovan emitteras som `campaign_plan.json` med `status:"draft"` → operatör granskar → `approved` → Channel Drafters (IG/FB).

---

## 8. Öppna designfrågor (för granskning)
1. **Kadens:** är 8 poster/månad (4 beats × 2 kanaler) rätt v1-default, eller vill du fler mitt-i-poster?
2. **Lead time:** ska planeraren default-planera **nästa** månad (förlansering, `lead_offset=1`) eller innevarande?
3. **Stripe-viktning:** godkänns de regelbaserade beat-vikterna i steg 5 som [OSÄKER] tills v3-loopen finns?
4. **Landningssida:** finns URL/UTM-konvention att hårdkoda i `landing_url_slot`, eller lämnas den som human-input?
5. **Plan-godkännande:** ska planen godkännas som helhet *innan* Drafters kör (som ritat), eller ska Drafters köra på draft och godkännas per utkast?

> Inga av dessa hittas på i designen — de är medvetet lämnade som operatörsbeslut.
