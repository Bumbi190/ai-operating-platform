# Familje-Stunden — Brand / Canon Guard v1 (Designspec)

**Status:** Granskningsklar design. **Ingen kod. Ingen implementation.**
Guard är en **oberoende valideringsagent** som granskar varje `draft_post.json` **innan** det når Action Center.
**Källor (enbart):** Brand Rules · Character Bible v2 · Theme Bible v1 · Content Bible v1 · Marketing Bible v1 · Campaign Planner v1 · Channel Drafter v1.
⛔ The Prompt / AI News / andra projekt används ALDRIG. Scoped `project_id="familje-stunden"`.
Märkning: [KANON]=verifierad KB-fakta · [OSÄKER]=tolkning · [LUCKA]=saknas.

---

## 0. Vad Guard ÄR och INTE ÄR
Guard är en **domare, inte en författare**. Den läser ett utkast + KB och fäller **ett av fyra utfall**:
**godkänn · underkänn · varna · flagga lucka** — alltid med **förklaring** och **poäng**.

> Guard **skriver aldrig om innehållet.** Den ändrar inte caption, byter inte asset, lägger inte till hashtags.
> Den säger bara *om* utkastet får gå vidare och *varför inte*. Omskrivning är Drafterns jobb (efter retur).

Detta gör Guard till en **oberoende andra part** — Drafterns egen Self-Check (Channel Drafter §12) räknas inte;
Guard validerar utifrån, med egna regler, mot KB:n direkt.

---

## 1. Arkitektur

### 1.1 Placering i Marketing Engine
```
[Channel Drafter] → draft_post.json (status=drafted)
        │
        ▼
┌─────────────────────────────────┐
│   BRAND / CANON GUARD (v1)        │  ← DENNA AGENT
│   draft_post.json → guard_report  │
│   godkänn · underkänn · varna     │
└─────────────────────────────────┘
        │  guard_report.json
        ├── approved/warning ─▶ [Action Center] → operatör (Approve/Reject/Return)
        └── rejected ─────────▶ [Return to Drafter] (med violations + felorsak)
                                          │
                                          ▼
                                  (Publisher = v2, aldrig från Guard)
```

### 1.2 Interna moduler (logiska validatorer, ej kodfiler)
| # | Validator | Granskar mot |
|---|-----------|--------------|
| A | **Intake/Schema** | Att `draft_post.json` är komplett & välformat (obligatoriska fält finns). |
| B | **Brand Validator** | Brand Rules: ton, språk, värderingar, varumärkeslöften, isolering. |
| C | **Character Validator** | Character Bible v2: Nova/Pling-roller, inga nya karaktärer, ingen rollblandning. |
| D | **Theme Validator** | Theme Bible: rätt tema, symboler, känsla, "vad som inte hör hemma". |
| E | **Marketing Validator** | Marketing Bible: rätt CTA, inga förbjudna vinklar, inga falska/överdrivna löften. |
| F | **Asset Validator** | Asset-index: asset_refs existerar, inga uppfunna/AI-genererade bilder. |
| G | **Gap Validator** | LUCKA-hantering: saknad URL/asset/tema-fakta → rätt beslut. |
| H | **Scorer** | Väger violations → poäng 0–100 → utfall. |
| I | **Report Emitter** | Bygger `guard_report.json` + Action Center-payload. |

### 1.3 Infrastruktur
Körs som **durable workflow run** scoped `project_id="familje-stunden"`, en run per `draft_id` (idempotent).
Guard är **read-only mot utkast och KB** — muterar aldrig utkastet. Resultat lagras i `guard_reports`
(kopplat till `draft_id`). **Ingen delad KB/tokens med The Prompt.**

---

## 2. Dataflöde
```
draft_post.json (drafted)
        │
        ▼
[A Intake] ── saknar obligatoriskt fält? ──▶ HARD-FAIL (rejected, schema-violation)
        │ ok
        ▼
ladda KB-utdrag (brand-rules, nova/pling-v2, aktivt tema, marketing-bible, asset-index)
        │
        ▼
[B][C][D][E][F][G] kör parallellt → samlar violations[] + warnings[]
        │
        ▼
[H Scorer] → score 0–100 + verdict (approved | warning | rejected)
        │
        ▼
[I Emitter] → guard_report.json → Action Center (eller Return to Drafter)
```
Alla sex validatorerna körs alltid (även om en tidig CRITICAL hittas) så operatören ser **hela** bilden i en granskning.

---

## 3. Agentansvar — gränsdragning

### 3.1 Guard ANSVARAR FÖR
- Att **oberoende** verifiera att ett utkast följer hela KB:n (brand/character/theme/marketing/asset).
- Att fälla utfall: **approved / warning / rejected** + **score** + **violations** + **warnings**.
- Att **flagga luckor** korrekt (LUCKA-beslutsregler).
- Att **förklara varför** varje violation finns (med KB-referens).
- Att paketera ett Action Center-underlag.

### 3.2 Guard ANSVARAR INTE FÖR
- **Att skriva/skriva om copy eller välja assets** → Channel Drafter.
- **Strategi/vinkel/kalender** → Campaign Planner.
- **Slutgiltigt mänskligt godkännande** → operatören i Action Center (Guard *rekommenderar*).
- **Publicering/schemaläggning/tokens** → Publisher (v2).

### 3.3 Gränslinjer
| Beslut | Planner | Drafter | **Guard** | Operatör | Publisher |
|--------|:------:|:------:|:--------:|:--------:|:---------:|
| Vad/varför (strategi) | ✅ | — | — | — | — |
| Hur det formuleras | — | ✅ | — | — | — |
| Får det publiceras (KB-regel) | — | self-check | ✅ **rekommendation** | — | — |
| Slutgiltigt ja/nej | — | — | — | ✅ | — |
| När/var publicering | — | — | — | — | ✅ (v2) |

> **Princip:** Guard har **veto-rekommendation**, inte verkställighet. CRITICAL ⇒ Guard sätter `rejected` och utkastet
> kan inte gå vidare utan retur — men det är operatören som trycker på knappen.

---

## 4. Input

### 4.1 Vad Guard läser
Guard läser **hela** `draft_post.json` (output från Channel Drafter) + KB-referenserna det pekar på.
Den läser även den ursprungliga `content_brief`/plan-kontext (för att verifiera att utkastet matchar beat/tema/CTA som planerades).

### 4.2 Input-schema (`brand-guard-input.v1`)
```json
{
  "$schema": "brand-guard-input.v1",
  "project_id": "familje-stunden",
  "draft_post": { "...": "komplett draft_post.json från Channel Drafter" },
  "plan_context": {
    "plan_id": "fs-2026-09",
    "theme": {"key": "skordemanaden", "name": "Skördemånaden", "symbols": ["äpplen","svampar","pumpor","skörd"], "must_not": ["uppmana smaka okända/giftiga svampar utan vuxen","andra månaders ämnen"]},
    "campaign_angle": {"approved_angle_tags": ["skärmfri kvalitetstid","säsong/tema","lärande genom lek"], "cta": {"primary": "Prova gratis", "secondary": ["Starta prenumeration","Följ @familjestunden","Ge bort som present"]}},
    "expected": {"beat": "launch", "channel": "instagram", "format": "carousel"}
  },
  "kb_refs": {
    "brand_rules": "content/familje-stunden/_meta/brand-rules.md",
    "character_bible": ["content/familje-stunden/characters/nova-v2.md","content/familje-stunden/characters/pling-v2.md"],
    "theme_file": "content/familje-stunden/themes/skordemanaden.md",
    "marketing_bible": "content/familje-stunden/marketing-bible.md",
    "asset_index": "content/familje-stunden/characters/index.json"
  }
}
```

### 4.3 Obligatoriska fält att kontrollera i `draft_post.json`
Om något av dessa saknas/är tomt ⇒ **Intake HARD-FAIL** (`rejected`, schema-violation, retur till Drafter):
`draft_id`, `brief_id`, `channel`, `format`, `beat`, `caption` (hook/story/value/cta_line), `caption_rendered`,
`cta`, `asset_plan`, `character_usage`, `must_not_applied`, `self_check`.
Villkorligt obligatoriska: `hashtags` (om channel=instagram), `reel_spec` (format=reel), `carousel_slides` (carousel), `fb_post` (fb_post).

---

## 5. Output — `guard_report.json`

```json
{
  "$schema": "guard-report.v1",
  "project_id": "familje-stunden",
  "report_id": "guard-fs-2026-09-03",
  "draft_id": "draft-fs-2026-09-03",
  "brief_id": "brief-03",
  "channel": "instagram",
  "format": "carousel",
  "evaluated_at": "2026-06-03T00:00:00Z",
  "verdict": "warning",
  "approved": false,
  "rejected": false,
  "score": 82,
  "score_breakdown": {
    "brand": 25, "character": 20, "theme": 18, "marketing": 19, "asset": 0, "gap": -0,
    "max": {"brand": 25, "character": 20, "theme": 20, "marketing": 20, "asset": 15},
    "penalties_applied": -18
  },
  "violations": [
    {
      "id": "MKT-LANDING-MISSING",
      "severity": "HIGH",
      "category": "marketing",
      "field": "cta.landing_url_slot",
      "explanation": "CTA 'Prova gratis' kräver landningssida men landing_url_slot är LUCKA.",
      "kb_ref": "marketing-bible.md#9",
      "recommended_action": "return_to_drafter_or_operator_fill"
    }
  ],
  "warnings": [
    {
      "id": "THEME-PALETTE-UNVERIFIED",
      "severity": "LOW",
      "category": "theme",
      "field": "theme.palette",
      "explanation": "Höstpalett ej verifierad i Theme Bible; utkastet anger inga hex (korrekt hanterat).",
      "kb_ref": "skordemanaden.md#10"
    }
  ],
  "gap_flags": [
    {"field": "cta.landing_url", "level": "LUCKA", "blocking": true},
    {"field": "asset.cta_slide", "level": "LUCKA", "blocking": false},
    {"field": "theme.palette", "level": "LUCKA", "blocking": false}
  ],
  "checks": {
    "schema_complete": true,
    "brand_ok": true,
    "character_ok": true,
    "theme_ok": true,
    "marketing_ok": false,
    "asset_ok": true,
    "no_the_prompt": true,
    "no_invented_facts": true
  },
  "recommendation": "Return to Drafter eller låt operatör fylla landningssida; allt annat on-brand.",
  "action_center": {
    "headline": "Skördemånaden – IG Karusell: 82/100 (Varning)",
    "blocking_issue": "Saknad landningssida för 'Prova gratis'",
    "available_actions": ["approve_with_fix", "reject", "return_to_drafter"]
  }
}
```

**Fältsemantik:** `verdict` ∈ {approved, warning, rejected}; `approved`/`rejected` är bekvämlighets-booleans.
`violations` = blockerande/poängdragande; `warnings` = icke-blockerande noteringar; `gap_flags` = LUCKA-status med `blocking`.

---

## 6. Valideringsregler

### 6.1 Brand Validation (mot Brand Rules)
Guard verifierar:
- **Ton:** varm, trygg, magisk, svensk; barnet/föräldern tilltalas vänligt. Avvikelse (säljig/kall/aggressiv) ⇒ MEDIUM.
- **Språk:** svenska; åldersanpassat (3–7 år); inga svåra/olämpliga ord. Fel språk/engelska brödtext ⇒ HIGH.
- **Värderingar:** närhet, enkelhet, glädje, skärmfri kvalitetstid (Marketing Bible §2). Värdekonflikt ⇒ MEDIUM.
- **Varumärkeslöften:** lova bara vad paketet levererar (Marketing Bible §6). Överlöfte ⇒ HIGH.
- **Isolering:** **noll** The Prompt/AI News-element (ord, ton, ämne). Träff ⇒ **CRITICAL**.
Metod: nyckelords-/mönsterkontroll + semantisk bedömning mot brand-rules.md; varje träff loggas med KB-ref.

### 6.2 Character Validation (mot Character Bible v2)
- **Nova korrekt:** mänsklig flicka, kännande/nyfiken; pronomen **hon**; roll = känslohook. Fel ⇒ HIGH.
- **Pling korrekt:** blå robot, lekfull förklarare, "Blipp blipp!", gadgets; pronomen **han**; roll = förklarare/wow. Fel ⇒ HIGH.
- **Inga nya karaktärer:** endast Nova & Pling. Ny/namngiven extra karaktär ⇒ **CRITICAL**.
- **Ingen rollblandning:** Nova får inte agera "robot-förklarare", Pling inte "kännande flicka". Hopblandning ⇒ HIGH.
- **Endast kanoniska utseenden** (via asset_refs). Beskrivning av avvikande utseende ⇒ HIGH.

### 6.3 Theme Validation (mot Theme Bible / aktivt tema)
- **Rätt månadstema:** utkastets tema == plan-kontextens `theme.key`. Fel tema ⇒ **CRITICAL**.
- **Rätt symboler:** använder temats symboler (Skördemånaden: äpplen/svampar/pumpor/skörd). Saknas helt ⇒ MEDIUM.
- **Rätt känsla:** matchar temats ton (mysig/höstlig/nyfiken). Avvikelse ⇒ LOW–MEDIUM.
- **Inga andra teman:** inga element från andra månader (t.ex. jul/rymd i september). Träff ⇒ HIGH.
- **"Vad som inte hör hemma":** temats negativa guardrail (t.ex. uppmana smaka okända svampar utan vuxen) ⇒ **CRITICAL** (barnsäkerhet).

### 6.4 Marketing Validation (mot Marketing Bible)
- **Rätt CTA:** CTA ∈ §9 och matchar beat (ingen hård "Starta prenumeration" i ren teaser). Fel CTA ⇒ MEDIUM.
- **Inga förbjudna vinklar (§8):** The Prompt-element (CRITICAL), skrämmande motiv (CRITICAL), ogrundade utvecklingslöften (HIGH), skärmtids-skambudskap (MEDIUM), överdrift mot leverans (HIGH).
- **Inga falska löften:** pris/innehåll måste stämma (59/129/199, provmånad gratis). **Falskt pris ⇒ CRITICAL.**
- **Inga överdrivna utvecklingspåståenden:** "blir smartare/snabbare i skolan" etc. ⇒ HIGH.

### 6.5 Asset Validation (mot asset-index)
- **asset_refs existerar:** varje ref i `asset_plan` ska finnas i asset-index (`available`/`pending_upload`). Saknad ref utan LUCKA-flagga ⇒ HIGH.
- **Inga uppfunna bilder:** asset utan källa i index ⇒ HIGH; om utkastet *påstår* en bild men ingen ref finns ⇒ HIGH.
- **Inga AI-genererade karaktärer:** v1 förbjuder bildgenerering helt; tecken på genererad/icke-kanonisk karaktärsbild ⇒ **CRITICAL**.
- Korrekt hanterad LUCKA (asset_ref=null + status=LUCKA) ⇒ ingen violation, bara `gap_flag`.

---

## 7. Gap Validation (beslutsregler)

| Lucka | Blocking? | Beslut |
|-------|:--------:|--------|
| **CTA-landningssida saknas** (trial/sub-CTA) | **Ja** | HIGH violation; verdict ≤ warning; kan ej `approved` förrän URL finns (operatör fyller eller retur). |
| **Asset saknas** (icke-CTA-slot, korrekt LUCKA-flaggad) | Nej | `gap_flag` (non-blocking); operatör kan välja asset vid godkännande. |
| **Tema ofastställt** (juni/dec) | **Ja** | Temaspecifik copy mot ofastställt tema ⇒ CRITICAL; utkast ska vara generiskt eller returneras. |
| **Tema-fakta saknas** (palett/saga-text) | Nej | OK **så länge utkastet inte hittat på** dem; om utkastet anger hex/handling som inte finns ⇒ HIGH (uppfunnen fakta). |
| **Saknat obligatoriskt fält** | **Ja** | Intake HARD-FAIL (schema-violation) ⇒ rejected. |

**Grundregel [KANON]:** Korrekt **flaggad** LUCKA straffas milt/inte alls. **Uppfunnen** ersättning för en LUCKA
(påhittad URL, påhittad färg, påhittad sagohandling, påhittad bild) är en **allvarlig** överträdelse (HIGH/CRITICAL).
Guard belönar ärlig osäkerhet och bestraffar gissning.

---

## 8. Scoring Model (0–100)

### 8.1 Poängbas (max 100)
Utkastet startar på **100** och får **avdrag per violation**. Kategoritak säkerställer balans:

| Kategori | Maxbidrag (informativt) |
|----------|------------------------|
| Brand | 25 |
| Character | 20 |
| Theme | 20 |
| Marketing | 20 |
| Asset | 15 |

### 8.2 Avdrag per allvarlighetsgrad
| Severity | Avdrag | Effekt |
|----------|:------:|--------|
| **CRITICAL** | utkastet sätts direkt till **rejected**, score **kapas till 0–40** | Får aldrig `approved`. |
| **HIGH** | −20 | Två HIGH ⇒ under 70 ⇒ rejected. |
| **MEDIUM** | −10 | |
| **LOW / warning** | −3 (eller 0 om ren notering) | |

### 8.3 Trösklar → utfall (för Action Center)
| Score | Verdict | Innebörd |
|-------|---------|----------|
| **90–100** | **approved** | On-brand; operatör kan godkänna direkt. |
| **70–89** | **warning** | Mindre problem/luckor; operatör granskar extra, ev. fix. |
| **< 70** | **rejected** | Allvarliga problem; retur till Drafter. |
| **valfri CRITICAL** | **rejected** (oavsett siffra) | Hård spärr; barnsäkerhet/isolering/falskt pris. |

> En blockerande LUCKA (t.ex. saknad landningssida för en trial-CTA) håller verdict på max **warning** — aldrig `approved` —
> tills den är löst.

---

## 9. Violation Library (katalog)

### CRITICAL (hård spärr → rejected oavsett poäng)
| ID | Beskrivning | KB-ref |
|----|-------------|--------|
| `BR-THEPROMPT` | The Prompt / AI News / annat projekt nämns eller anas | brand-rules / isolering |
| `CH-NEWCHAR` | Ny karaktär skapad (utöver Nova & Pling) | character-bible v2 |
| `CH-AIGEN` | AI-genererad/icke-kanonisk karaktärsbild | asset-regel v1 |
| `MKT-FALSEPRICE` | Falskt/felaktigt pris (≠ 59/129/199, eller fel om provmånad) | marketing-bible §6 |
| `TH-WRONGTHEME` | Fel månadstema mot planen | theme-bible / plan |
| `TH-UNSAFE` | Barnosäker uppmaning (t.ex. smaka okända svampar utan vuxen) | skordemanaden.md §12 |
| `MKT-SCARY` | Skrämmande/olämpligt barninnehåll | marketing-bible §8 |
| `GAP-UNDEF-THEME` | Temaspecifik copy mot ofastställt tema (juni/dec) | theme-bible luckor |

### HIGH (−20)
| ID | Beskrivning |
|----|-------------|
| `BR-OVERPROMISE` | Lovar mer än paketet levererar |
| `MKT-DEVCLAIM` | Ogrundat utvecklings-/inlärningspåstående ("blir smartare") |
| `MKT-LANDING-MISSING` | Trial/sub-CTA utan landningssida |
| `CH-ROLEMIX` | Nova/Pling-roller hopblandade |
| `CH-WRONGTRAIT` | Fel karaktärsdrag/pronomen |
| `AS-INVENTED` | Asset utan källa i index / uppfunnen bild |
| `TH-OTHERTHEME` | Element från annat tema inblandat |
| `GAP-INVENTED` | Uppfunnen ersättning för en LUCKA (URL/färg/handling) |

### MEDIUM (−10)
| ID | Beskrivning |
|----|-------------|
| `BR-TONE` | Ton avviker (säljig/kall/aggressiv) |
| `MKT-WRONGCTA` | CTA matchar inte beat/objective |
| `MKT-SHAME` | Skärmtids-skambudskap mot föräldrar |
| `TH-NOSYMBOL` | Temats symboler saknas helt |
| `BR-VALUE` | Värderingskonflikt mot kärnvärden |

### LOW (−3 / notering)
| ID | Beskrivning |
|----|-------------|
| `TH-PALETTE-UNVERIFIED` | Palett ej verifierad (korrekt ej påhittad) |
| `BR-EMOJI` | Emoji-användning utanför policy |
| `HT-COUNT` | Hashtag-antal utanför 5–10 (IG) / >1 (FB) |
| `STYLE-MINOR` | Mindre stil/formuleringsanmärkning |

---

## 10. Action Center-integration

### 10.1 Vad operatören ser (per utkast)
- **Rubrik:** tema + kanal/format + **score + verdict-färg** (grön ≥90 / gul 70–89 / röd <70).
- **Förhandsvisning:** `caption_rendered` + asset-thumbnails (eller LUCKA-platshållare) + CTA + hashtags.
- **Blockerande problem** (om något) överst, i klartext.
- **Violations-lista** (severity-färgad) med förklaring + KB-referens.
- **Warnings + gap_flags** (LUCKA, blocking/non-blocking).
- **Checks-rad:** brand/character/theme/marketing/asset ✓/✗ + "Ingen The Prompt ✓".

### 10.2 Åtgärder (knappar)
| Åtgärd | Tillåten när | Effekt |
|--------|--------------|--------|
| **Approve** | verdict=approved (≥90, inga blockerare) | Utkast markeras godkänt; (Publisher v2 senare). |
| **Approve with fix** | verdict=warning + endast operatörsfixbara luckor (t.ex. landningssida) | Operatör fyller fältet, sedan godkänt. |
| **Reject** | alltid | Avvisat; arkiveras med skäl. |
| **Return to Drafter** | verdict=rejected eller på begäran | Skickar tillbaka med `violations[]` som felorsak → Drafter gör nytt utkast. |

CRITICAL ⇒ **Approve döljs/avaktiveras**; endast Reject / Return to Drafter (ev. efter fix om fixbart, men aldrig vid CRITICAL).

### 10.3 Spårbarhet
Varje beslut loggas (operatör, tid, åtgärd, score) i beslutsminnet (samma mönster som befintligt Action Center),
kopplat till `draft_id` + `report_id`, så Insights/Hermes (v3) kan lära av vad som godkänns/avvisas.

---

## 11. Promptdesign (Guard systemprompt — designskiss)

**Roll:** "Du är Brand/Canon Guard för Familje-Stunden. Du är en oberoende domare. Du skriver ALDRIG om innehåll —
du godkänner, underkänner, varnar och förklarar mot kunskapsbasen."

**Hårda regler:**
1. Bedöm ENDAST mot Familje-Stundens KB. ⛔ The Prompt = automatisk CRITICAL.
2. Ändra aldrig utkastet. Returnera bara `guard_report.json`.
3. Kör alla sex validatorer (brand/character/theme/marketing/asset/gap) varje gång.
4. CRITICAL ⇒ verdict=rejected oavsett poäng.
5. Korrekt flaggad LUCKA straffas milt; **uppfunnen** ersättning straffas hårt (HIGH/CRITICAL).
6. Varje violation MÅSTE ha `severity`, `category`, `field`, `explanation`, `kb_ref`.
7. Hitta aldrig på en regel som inte finns i KB; om underlag saknas, varna (LOW) istället för att fälla.

**Indata:** `brand-guard-input.v1` (utkast + plan-kontext + kb_refs).
**Output-kontrakt:** ett giltigt `guard-report.v1`-objekt, ingen prosa utanför JSON.

---

## 12. Fullständigt exempel — Skördemånaden **IG Karusell** (draft-fs-2026-09-03)

**Indata:** karusell-utkastet från Channel Drafter §14.2 (lansering, "Prova gratis", `landing_url_slot` = LUCKA).

**Guards bedömning:**
- **Brand:** ton varm/svensk/magisk ✓; lovar bara paketinnehåll ✓; ingen The Prompt ✓ → OK (25/25).
- **Character:** Nova (slide 2) = höstkänsla/nyfiken ✓; Pling (slide 3) = visar vad som ingår ✓; inga nya karaktärer ✓; roller ej blandade ✓ → OK (20/20).
- **Theme:** tema=skordemanaden ✓; symboler äpplen/svampar/pumpor ✓; höstkänsla ✓; inga andra teman ✓; svampmoment utan farlig uppmaning ✓ → OK (18/20, LOW: palett ej verifierad men korrekt ej påhittad).
- **Marketing:** CTA "Prova gratis" ∈ §9 och matchar launch-beat ✓; inga förbjudna vinklar ✓; inga falska löften ✓; **MEN** `landing_url_slot` = LUCKA för en trial-CTA → **HIGH `MKT-LANDING-MISSING`**.
- **Asset:** `covers/september.png` + Nova/Pling-poser finns i index ✓; CTA-slide korrekt LUCKA-flaggad (non-blocking) ✓; inga AI-bilder ✓ → OK (15/15).
- **Gap:** landningssida = blocking LUCKA; palett + cta-slide = non-blocking.

**Resultat:**
```json
{
  "report_id": "guard-fs-2026-09-03",
  "draft_id": "draft-fs-2026-09-03",
  "verdict": "warning",
  "approved": false, "rejected": false,
  "score": 80,
  "violations": [
    {"id": "MKT-LANDING-MISSING", "severity": "HIGH", "category": "marketing", "field": "cta.landing_url_slot",
     "explanation": "CTA 'Prova gratis' kräver landningssida men landing_url_slot är LUCKA.", "kb_ref": "marketing-bible.md#9",
     "recommended_action": "operator_fill_or_return"}
  ],
  "warnings": [
    {"id": "TH-PALETTE-UNVERIFIED", "severity": "LOW", "category": "theme", "field": "theme.palette",
     "explanation": "Höstpalett ej verifierad; utkastet anger korrekt inga hex.", "kb_ref": "skordemanaden.md#10"}
  ],
  "gap_flags": [
    {"field": "cta.landing_url", "level": "LUCKA", "blocking": true},
    {"field": "asset.cta_slide", "level": "LUCKA", "blocking": false},
    {"field": "theme.palette", "level": "LUCKA", "blocking": false}
  ],
  "checks": {"schema_complete": true, "brand_ok": true, "character_ok": true, "theme_ok": true, "marketing_ok": false, "asset_ok": true, "no_the_prompt": true, "no_invented_facts": true},
  "recommendation": "On-brand och kanon-säkert. Enda blockeraren: landningssidan saknas. Låt operatör fylla URL (Approve with fix) eller returnera till Drafter.",
  "action_center": {
    "headline": "Skördemånaden – IG Karusell: 80/100 (Varning)",
    "blocking_issue": "Saknad landningssida för 'Prova gratis'",
    "available_actions": ["approve_with_fix", "reject", "return_to_drafter"]
  }
}
```

**Tolkning:** utkastet är helt on-brand/kanon — det skulle ha fått ~95+ om landningssidan funnits. Den enda
blockeraren är en **ärligt flaggad LUCKA** (landningssida), vilket håller verdict på **warning** (80) och erbjuder
operatören "Approve with fix". Hade utkastet istället **hittat på** en URL hade det blivit `GAP-INVENTED` (HIGH) eller värre.

---

## 13. Öppna designfrågor (för granskning)
1. **Approve with fix:** ska operatörsifylld landningssida räknas som godkänd direkt, eller köras genom Guard igen (re-score)?
2. **CRITICAL-kapning:** ska score kapas till 0 eller till "0–40-band" vid CRITICAL (jag föreslår band, för att skilja "nära" från "långt ifrån")?
3. **Auto-return:** ska `rejected` returneras automatiskt till Drafter, eller alltid kräva operatörsklick?
4. **Semantisk vs. nyckelords-kontroll:** hur mycket ska Guard luta på mönster/nyckelord vs. modellbedömning för ton/vinkel?
5. **Tröskelvärden:** är 90/70 rätt gränser för approved/warning/rejected för ett varumärke med betalande kunder, eller vill du ha strängare (95/80)?

> Inget av detta hittas på i designen — medvetna operatörsbeslut.
