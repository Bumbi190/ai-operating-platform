# Familje-Stunden — Channel Drafter v1 (Designspec)

**Status:** Granskningsklar design. **Ingen kod. Ingen implementation. Ingen publicering/schemaläggning.**
V1 gör **endast utkast** (Instagram + Facebook).
**Källor (enbart):** Brand Rules · Character Bible v2 · Theme Bible v1 · Content Bible v1 · Marketing Bible v1 · Campaign Planner v1.
⛔ The Prompt / AI News / andra projekt används ALDRIG. Scoped `project_id="familje-stunden"`.
Märkning: [KANON]=verifierad KB-fakta · [OSÄKER]=tolkning · [LUCKA]=saknas (genereras aldrig).

---

## 0. Vad Channel Drafter ÄR
Channel Drafter tar **en content brief** ur `campaign_plan.json` och producerar **ett `draft_post.json`** — färdig
caption + hashtags + CTA + valda **befintliga** asset-referenser, kanalanpassat för IG/FB. Den **skriver text**,
men **publicerar inte**, **schemalägger inte**, **genererar inga bilder** och **validerar inte slutgiltigt** (det gör Brand Guard).

> Drafterns enda jobb: *"Givet en brief, skriv ett kanalfärdigt utkast som följer KB — eller flagga en lucka. Aldrig gissa."*

---

## 1. Arkitektur

### 1.1 Placering i Marketing Engine
```
[Campaign Planner] → campaign_plan.json (status=approved)
        │  en content_brief per post
        ▼
┌──────────────────────────────┐
│   CHANNEL DRAFTER (v1)         │  ← DENNA AGENT
│   brief → draft_post.json      │
│   IG Reel · IG Karusell · FB   │
└──────────────────────────────┘
        │  draft_post.json (status=drafted)
        ▼
[Brand/Canon Guard]  → validerar mot KB ──fail──▶ tillbaka till Drafter (retry m. felorsak)
        │ pass
        ▼
[Operatörsgodkännande]  (Action Center)
        │
        ▼
[Publisher]  (v2 — INTE i v1; egna tokens, gated)
```

### 1.2 Interna moduler (logiska steg, ej kodfiler)
| # | Modul | Ansvar |
|---|-------|--------|
| A | **Brief Reader** | Läser en `content_brief` + planens tema/vinkel/CTA-kontext. |
| B | **KB Resolver** | Hämtar de KB-utdrag briefen pekar på (tema, Nova/Pling-roller, marketing-pelare, must_not). |
| C | **Caption Builder** | Bygger caption i 4 lager: Hook → Story → Value → CTA. |
| D | **Character Voicer** | Applicerar Nova/Pling-roller per kanal. |
| E | **Asset Binder** | Matchar `asset_refs` mot asset-index; markerar luckor (ingen bildgenerering). |
| F | **Hashtag/Format Module** | Kanalregler: IG 5–10 hashtags; FB minimalt/inga; formatlängder. |
| G | **CTA Resolver** | Väljer exakt CTA + landningssida ur briefen/Marketing Bible §9. |
| H | **Gap Guard** | Stoppar påhitt; saknat → `null` + `LUCKA` + `needs_input`. |
| I | **Self-Check** | Kör checklistan (§10) innan emit. |
| J | **Draft Emitter** | Serialiserar `draft_post.json` (status=drafted). |

### 1.3 Infrastruktur
Körs som **durable workflow run** scoped `project_id="familje-stunden"`. En run per brief (idempotent på `brief_id`).
Output lagras som rad i `draft_posts` (status `drafted/needs_input/guard_failed/approved`). **Ingen delad KB/tokens med The Prompt.**

---

## 2. Dataflöde
```
campaign_plan.json (approved)
        │  plocka content_brief[i]
        ▼
[A Brief Reader] → brief + plan-kontext (tema, vinkel, CTA, gaps)
        ▼
[B KB Resolver] → tema-fält, Nova/Pling-roller (Character Bible v2),
        │           Marketing Bible pelare/proof/forbidden, content-bible format
        ▼
[E Asset Binder] → matcha asset_refs mot characters/index.json + covers/  (luckor flaggas)
        ▼
[C Caption Builder] + [D Character Voicer] → Hook → Story → Value → CTA
        ▼
[F Hashtags/Format] + [G CTA Resolver]
        ▼
[H Gap Guard] → saknat blir LUCKA, inte gissning
        ▼
[I Self-Check] → checklista; fail ⇒ needs_input/guard-flagga
        ▼
[J Emitter] → draft_post.json (status=drafted) → Brand Guard
```

---

## 3. Agentansvar — gränsdragning

### 3.1 Channel Drafter ÄGER
- Att skriva **caption** (hook/story/value/CTA) på svenska i rätt ton.
- Kanalanpassning: IG Reel-manus/overlay-text, IG karusellslides, FB-inläggstext.
- **Val bland befintliga** assets utifrån `asset_refs` (Asset Binder).
- Hashtags (IG) + CTA-formulering + landningssidans slot.
- Nova/Pling-röst per kanal.
- Gap-märkning + self-check.

### 3.2 Channel Drafter ÄGER INTE
- **Strategi/kalender/vinkelval** → Campaign Planner.
- **Bildgenerering / nya assets** → finns inte i v1 (förbjudet).
- **Slutlig kanonvalidering / godkänn-avslag** → Brand/Canon Guard.
- **Publicering / schemaläggning / API-anrop / tokens** → Publisher (v2).
- **Mätning** → Insights.

### 3.3 Gränslinjer (vem bestämmer vad)
| Beslut | Planner | Drafter | Brand Guard | Publisher |
|--------|:------:|:------:|:-----------:|:---------:|
| Vilket tema/vinkel/beat | ✅ | — | — | — |
| Vilken kanal/format per post | ✅ | följer | — | — |
| Exakt captiontext | — | ✅ | granskar | — |
| Vilka befintliga assets | föreslår (`asset_refs`) | väljer | granskar | — |
| Godkänt/underkänt mot KB | — | self-check | ✅ slutgiltigt | — |
| Publicering/tid | — | — | — | ✅ (v2) |

> **Princip:** Planner = *vad & varför*. Drafter = *hur det formuleras*. Guard = *får det publiceras*. Publisher = *när & var det går ut*.

---

## 4. Input — vilka fält Drafter läser ur `campaign_plan.json`

Drafter behöver **inte** hela planen — bara plan-kontext + **en** brief. Den läser:

### 4.1 Input-schema (`channel-drafter-input.v1`)
```json
{
  "$schema": "channel-drafter-input.v1",
  "project_id": "familje-stunden",
  "plan_id": "fs-2026-09",
  "plan_context": {
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
      "canon_level": {"purpose": "KANON", "tone": "OSAKER", "palette": "LUCKA"}
    },
    "next_theme": {"key": "lov-och-skuggmanaden", "name": "Löv- & skuggmånaden"},
    "campaign_angle": {
      "primary_angle": "Mysig höstskörd tillsammans",
      "emotional_pillar": "Närhet + Ritual/förväntan",
      "core_message": "Magisk, skärmfri kvalitetstid varje månad — färdigt att använda direkt",
      "proof_points": ["ingen förberedelse krävs", "ljudsaga + diplom ingår", "59 kr + provmånad gratis"],
      "approved_angle_tags": ["skärmfri kvalitetstid", "säsong/tema", "lärande genom lek"],
      "cta": {"primary": "Prova gratis", "secondary": ["Starta prenumeration", "Följ @familjestunden"]}
    },
    "landing_url_slot": "<landningssida-UTM>"
  },
  "content_brief": {
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
  },
  "kb_refs": {
    "brand_rules": "content/familje-stunden/_meta/brand-rules.md",
    "character_bible": ["content/familje-stunden/characters/nova-v2.md", "content/familje-stunden/characters/pling-v2.md"],
    "marketing_bible": "content/familje-stunden/marketing-bible.md",
    "content_bible": "content/familje-stunden/content-bible/",
    "asset_index": "content/familje-stunden/characters/index.json"
  }
}
```

**Fält Drafter MÅSTE ha** för att kunna skriva utan att gissa: `channel`, `format`, `beat`, `objective`,
`emotional_pillar`, `primary_angle`, `core_message`, `key_points`, `asset_refs`, `character_usage`, `cta`,
`landing_url_slot`, `must_not`, `theme.*`. Saknas något ⇒ Gap Guard (§9).

---

## 5. Output — `draft_post.json`

### 5.1 Gemensam kärna (alla format)
```json
{
  "$schema": "draft-post.v1",
  "project_id": "familje-stunden",
  "draft_id": "draft-fs-2026-09-03",
  "brief_id": "brief-03",
  "post_id": "fs-2026-09-03",
  "status": "drafted",
  "channel": "instagram",
  "format": "carousel",
  "beat": "launch",
  "language": "sv",
  "caption": {
    "hook": "...",
    "story": "...",
    "value": "...",
    "cta_line": "..."
  },
  "caption_rendered": "Hela captiontexten sammansatt i publiceringsordning",
  "hashtags": ["#familjestunden", "..."],
  "cta": {"type": "trial", "label": "Prova gratis", "landing_url_slot": "<landningssida-UTM>"},
  "asset_plan": [],
  "character_usage": {"nova": "...", "pling": "..."},
  "tone": "varm, trygg, magisk, svensk",
  "must_not_applied": ["..."],
  "self_check": {"passed": true, "items": {}},
  "gaps": [],
  "needs_input": [],
  "canon_level": {"caption": "OSAKER", "asset_plan": "KANON-ref/LUCKA", "cta": "KANON"},
  "source_trace": {"theme": "skordemanaden.md", "pillar": "marketing-bible.md#2", "characters": "nova-v2.md,pling-v2.md"}
}
```

### 5.2 Instagram **Reel** (`format:"reel"`)
```json
{
  "format": "reel",
  "reel_spec": {
    "duration_target_sec": 15,
    "scenes": [
      {"order": 1, "beat_role": "hook", "on_screen_text": "Snart börjar något mysigt…", "voiceover_note": "Novas nyfikna ton", "asset_ref": "characters/index.json#nova_pose_default"},
      {"order": 2, "beat_role": "story", "on_screen_text": "September = Skördemånaden 🍂", "asset_ref": "covers/september.png"},
      {"order": 3, "beat_role": "value", "on_screen_text": "Allt färdigt — ingen planering", "voiceover_note": "Pling förklarar lekfullt", "asset_ref": "characters/index.json#pling_pose_default"},
      {"order": 4, "beat_role": "cta", "on_screen_text": "Prova gratis", "asset_ref": null}
    ],
    "audio_note": "Mjuk, varm bakgrund (ingen specifik låt fastställd) [LUCKA]"
  }
}
```
> Reel = manus + overlay-text + scenanvisningar. Ingen videoproduktion i v1 — bara utkast/instruktion.

### 5.3 Instagram **Karusell** (`format:"carousel"`)
```json
{
  "format": "carousel",
  "carousel_slides": [
    {"order": 1, "role": "hook", "headline": "Skördemånaden är här 🍂", "body": "", "asset_ref": "covers/september.png"},
    {"order": 2, "role": "story", "headline": "Höstens äventyr med Nova & Pling", "body": "Äpplen, svampar och pumpor — magi i vardagen.", "asset_ref": "characters/index.json#nova_pose_default"},
    {"order": 3, "role": "value", "headline": "Allt färdigt i ett paket", "body": "Saga, ljudsaga, pyssel och diplom. Ingen förberedelse.", "asset_ref": "characters/index.json#pling_pose_default"},
    {"order": 4, "role": "cta", "headline": "Prova gratis", "body": "Första månaden gratis – länk i profilen.", "asset_ref": null}
  ],
  "slide_count": 4
}
```

### 5.4 Facebook **Inlägg** (`format:"fb_post"`)
```json
{
  "format": "fb_post",
  "fb_post": {
    "primary_text": "Hela inläggstexten (hook→story→value→cta) i FB-längd, längre berättande ton.",
    "link_preview_slot": "<landningssida-UTM>",
    "asset_ref": "covers/september.png",
    "hashtags": []
  }
}
```

---

## 6. Caption Framework (Hook → Story → Value → CTA)

| Lager | Vad det gör | Källa | Canon |
|-------|-------------|-------|-------|
| **Hook** | Fånga blicken på 1–2 rader; väck höst/förväntan | **Theme Bible** (känslomässig ton, symboler) + Marketing Bible §2 (pelare) | tema=KANON/OSÄKER |
| **Story** | Kort berättelse med Nova & Pling i temat | **Character Bible v2** (roller) + **Theme Bible** (miljö/symboler) | roller=KANON |
| **Value** | Vad familjen får + varför enkelt (proof points) | **Marketing Bible** §1/§5 (value prop, proof) + Content Bible (paketinnehåll) | KANON |
| **CTA** | En tydlig handling | **Marketing Bible** §9 + briefens `cta` | KANON |

**Regler:**
- Hook använder temats känsla/symboler — aldrig generiska eller andra månaders ämnen.
- Story håller Nova & Pling i kanon-roller (§5); inga nya karaktärer.
- Value lovar **bara det paketet faktiskt levererar** (Marketing Bible §6) — inga utvecklingsgarantier.
- CTA = exakt **en** primär handling per post (sekundär CTA endast som mjuk PS om relevant).
- Ton genomgående: varm, trygg, magisk, svensk; barnet/föräldern tilltalas varmt.

---

## 7. Nova & Pling i marknadsföring

**Roller [KANON ur Character Bible v2 + Engine-design §5]:**
- **Nova = känslomässig hook.** Relaterbar, kännande, nyfiken flicka. Hon **öppnar** känslan ("Tänk att det är skördetid…"),
  ställer frågor, skapar igenkänning hos barn/förälder. Driver Hook + Story-känslan.
- **Pling = lekfull förklarare.** Blå robot, "Blipp blipp!", gadget-glad. Han **förklarar/visar** ("Titta vad vi gör!"),
  bär wow/lärande. Driver Value/demo-momentet.

**Regler per kanal:**

| Kanal/format | Nova | Pling |
|--------------|------|-------|
| **IG Reel** | Öppnar scen 1 (nyfiken voiceover/overlay), känslohook | Förklarar value-scenen (lekfull demo), "Blipp blipp!" sparsamt |
| **IG Karusell** | Slide 2 (story/känsla), introducerar temat | Slide 3 (value), visar vad som ingår |
| **FB Inlägg** | Bär den varma berättande inledningen | Lyfter det konkreta/roliga ("så här gör ni") |

**Hårda gränser [KANON]:** endast kanoniska bilder/poser; aldrig nya utseenden, namn eller karaktärer; Nova=hon, Pling=han;
deras inbördes relation och ton matchar sagorna. Karaktärsanvändning som inte kan beläggas i Character Bible v2 ⇒ LUCKA, inte påhitt.

---

## 8. Asset Selection (ingen bildgenerering i v1)

**Princip [KANON]:** Drafter **hittar aldrig på bilder**. Den binder endast **befintliga** tillgångar.

Asset Binder-logik:
1. Läs `asset_refs` ur briefen (t.ex. `covers/september.png`, `characters/index.json#nova_pose_default`).
2. Slå upp varje ref i **asset-index** (`characters/index.json` + `covers/`). Tre utfall:
   - **Hittad & uppladdad** → `asset_plan[].status="available"` med `storage_path`.
   - **Refererad men ej uppladdad** (känt pending-tillstånd i index) → `status="pending_upload"` + flagga.
   - **Saknas helt** → `status="LUCKA"` + lägg i `gaps[]` + `needs_input`.
3. Asset-slots utan kanonisk källa lämnas `asset_ref:null` med `status="LUCKA"` — **aldrig** en uppfunnen eller AI-genererad bild.
4. Ingen bildredigering/generering. Drafter beskriver bara *vilken befintlig* asset som ska användas var.

`asset_plan`-exempel:
```json
"asset_plan": [
  {"slot": "slide-1", "asset_ref": "covers/september.png", "status": "available", "storage_path": "familje-stunden/covers/september.png"},
  {"slot": "slide-2", "asset_ref": "characters/index.json#nova_pose_default", "status": "available"},
  {"slot": "slide-4-cta", "asset_ref": null, "status": "LUCKA", "note": "Ingen kanonisk CTA-slide-asset – operatör väljer"}
]
```

---

## 9. Hashtag Strategy

**Instagram [5–10 hashtags]:**
- Tillåtet: varumärke (`#familjestunden`), målgrupp/nisch (`#småbarnsliv`, `#barnpyssel`, `#skärmfritt`),
  säsong/tema (`#skördetid`, `#höstmedbarn`), svenska föräldratermer.
- Förbjudet: The Prompt/AI-relaterade taggar; engelska spam-taggar; irrelevanta trend-taggar; >10 taggar;
  taggar som lovar utvecklingsresultat (`#smartarebarn`).
- Placering: i caption-slut eller första kommentar (slot anges; operatör väljer).

**Facebook [minimalt eller inga]:**
- Default: **inga** hashtags. Max 0–1 om starkt motiverat (t.ex. `#familjestunden`).
- Förbjudet: hashtag-block som på IG (off-brand på FB).

**Gemensamt:** alltid svenska, alltid on-brand, alltid kopplade till tema/målgrupp. Hittas aldrig på engelska/trendiga taggar för räckvidd.

---

## 10. CTA Logic (beslutsregler)

CTA väljs primärt ur briefens `cta`; om brief lämnar val öppet använder Drafter dessa regler (Marketing Bible §9 + beat):

| CTA | Används när | Beat (typiskt) |
|-----|-------------|----------------|
| **Prova gratis** (primär) | Awareness/lansering; nå nya föräldrar; mål 200/år | Teaser, Lansering |
| **Starta prenumeration** | Konvertering; redan varma/trial-nära; "vad ingår denna månad" | Mitt-i-månaden |
| **Följ @familjestunden** | Ren awareness/relationsbygge utan hård säljvinkel | Teaser, Bro |
| **Ge bort som present** | Säsong/gåvolägen (jul, födelsedag); Box-paket som present | Säsongsbeats (t.ex. dec) |

**Regler:**
- Exakt **en** primär CTA per post; en mjuk sekundär CTA tillåts som PS.
- CTA måste matcha beat + objective (ingen hård "Starta prenumeration" i en ren teaser).
- "Prova gratis" och "Starta prenumeration" kräver `landing_url_slot` ifyllt — annars LUCKA (§9 gap).
- Aldrig CTA som lovar mer än paketet (Marketing Bible §6/§8).

---

## 11. Gap Handling — LUCKA ersätts ALDRIG med gissning

| Saknas | Drafter-beteende |
|--------|------------------|
| **Tema ofastställt** (juni/dec) | Skriv ingen temaspecifik copy. Producera endast kanon-säker varumärkescaption ELLER returnera `status="needs_input"`. Tema-detaljer = `LUCKA`. |
| **Bild/asset** | `asset_ref:null` + `status="LUCKA"`; aldrig AI-bild eller påhittad bild. Captiontext kan ändå skrivas; asset flaggas. |
| **CTA saknas/landningssida saknas** | CTA-text kan föreslås ur §9, men `landing_url_slot` lämnas `LUCKA` + `needs_input`; ingen påhittad URL. |
| **Landningssida** | Aldrig hitta på URL/UTM. Slot = `<landningssida-UTM>` tills operatör fyller i. |
| **Saga-innehåll ej verifierat** | Citera/återge ingen handling; håll copy generisk om temat. |
| **Palett ej verifierad** | Ange inga exakta färger/hex i overlay-anvisningar. |

Alla luckor samlas i `gaps[]` + `needs_input[]`; om en **obligatorisk** del saknas (t.ex. kanal/format) sätts
`status="needs_input"` och utkastet skickas inte vidare till Guard förrän kompletterat. **Regel: LUCKA → flagga, aldrig gissa.**

---

## 12. Self-Check (körs innan utkast returneras)

Drafter kör checklistan; alla måste vara `true` för `status="drafted"`, annars `needs_input`/`guard_flag`:

```json
"self_check": {
  "passed": true,
  "items": {
    "follows_brand_rules": true,
    "follows_character_bible": true,
    "follows_theme_bible": true,
    "no_forbidden_angles": true,
    "no_invented_facts": true,
    "cta_present_and_valid": true,
    "asset_refs_resolved_or_flagged": true,
    "only_familje_stunden_no_the_prompt": true,
    "tone_warm_safe_swedish": true,
    "must_not_respected": true,
    "hashtags_within_channel_rules": true
  }
}
```

Checkpunkter i ord:
1. **Brand Rules** — ton, varumärke, isolering följs.
2. **Character Bible** — Nova/Pling i kanon-roller, inga nya karaktärer.
3. **Theme Bible** — rätt tema, symboler, "vad som inte hör hemma" respekteras.
4. **Inga förbjudna vinklar** (Marketing Bible §8).
5. **Inga uppfunna fakta** — allt spårbart till KB; luckor flaggade.
6. **CTA finns och är giltig** (matchar beat, landningssida-slot hanterad).
7. **asset_refs upplösta eller flaggade** — inga påhittade bilder.
8. **Endast Familje-Stunden** — noll The Prompt-element.

Self-Check är Drafterns *interna* spärr; **Brand/Canon Guard är fortfarande den slutgiltiga, oberoende grinden** efteråt.

---

## 13. Promptdesign (Channel Drafter systemprompt — designskiss)

**Roll:** "Du är Channel Drafter för Familje-Stunden. Du skriver kanalfärdiga UTKAST (IG/FB) — du publicerar inte och hittar aldrig på."

**Hårda regler:**
1. Använd ENDAST briefen + Familje-Stundens KB. ⛔ Aldrig The Prompt/AI News.
2. Hitta aldrig på fakta, bilder, URL:er, priser, palett eller saga-handling. Saknas → `null` + `LUCKA` + `needs_input`.
3. Bygg caption i 4 lager: Hook (tema-känsla) → Story (Nova & Pling i kanon) → Value (proof points, bara vad paketet ger) → CTA (en, ur §9).
4. Nova = känslohook; Pling = lekfull förklarare. Endast kanoniska poser/bilder.
5. Respektera briefens `must_not` + Marketing Bible §8 + temats "vad som inte hör hemma".
6. Kanalregler: IG 5–10 sv hashtags; FB minimalt/inga. Ton: varm, trygg, magisk, svensk.
7. Kör Self-Check (§12) före emit. Output = giltig `draft_post.json`, ingen prosa utanför JSON.

**Indata:** ett `channel-drafter-input.v1`-objekt (plan-kontext + en brief + kb_refs).
**Output-kontrakt:** ett `draft_post.v1`-objekt, `status` ∈ {drafted, needs_input}.

---

## 14. Exempel — **Skördemånaden** (3 utkast)

### 14.1 Instagram **Reel** (teaser→value, brief-01-stil)
```json
{
  "draft_id": "draft-fs-2026-09-01", "brief_id": "brief-01", "channel": "instagram", "format": "reel",
  "beat": "teaser", "status": "drafted", "language": "sv",
  "caption": {
    "hook": "Något mysigt är på väg i september… 🍂",
    "story": "Nova och Pling gör sig redo för skördetid — äpplen, svampar och pumpor.",
    "value": "Ett helt nytt äventyr, färdigt att mysa med. Ingen planering.",
    "cta_line": "Följ oss så missar du inget ✨"
  },
  "caption_rendered": "Något mysigt är på väg i september… 🍂\nNova och Pling gör sig redo för skördetid — äpplen, svampar och pumpor.\nEtt helt nytt äventyr, färdigt att mysa med. Ingen planering.\nFölj oss så missar du inget ✨",
  "reel_spec": {
    "duration_target_sec": 15,
    "scenes": [
      {"order": 1, "beat_role": "hook", "on_screen_text": "Snart börjar något mysigt…", "voiceover_note": "Novas nyfikna ton", "asset_ref": "characters/index.json#nova_pose_default"},
      {"order": 2, "beat_role": "story", "on_screen_text": "September = Skördemånaden 🍂", "asset_ref": "covers/september.png"},
      {"order": 3, "beat_role": "value", "on_screen_text": "Allt färdigt — ingen planering", "voiceover_note": "Pling: Blipp blipp!", "asset_ref": "characters/index.json#pling_pose_default"},
      {"order": 4, "beat_role": "cta", "on_screen_text": "Följ @familjestunden", "asset_ref": null}
    ],
    "audio_note": "Mjuk varm bakgrund [LUCKA – ingen låt fastställd]"
  },
  "hashtags": ["#familjestunden", "#skördetid", "#höstmedbarn", "#barnpyssel", "#skärmfritt", "#småbarnsliv"],
  "cta": {"type": "follow", "label": "Följ @familjestunden", "landing_url_slot": null},
  "asset_plan": [
    {"slot": "scene-1", "asset_ref": "characters/index.json#nova_pose_default", "status": "available"},
    {"slot": "scene-2", "asset_ref": "covers/september.png", "status": "available"},
    {"slot": "scene-3", "asset_ref": "characters/index.json#pling_pose_default", "status": "available"},
    {"slot": "scene-4-cta", "asset_ref": null, "status": "LUCKA", "note": "Ingen kanonisk CTA-asset"}
  ],
  "character_usage": {"nova": "öppnar med nyfiken höstkänsla", "pling": "lekfull value-scen"},
  "must_not_applied": ["inga giftsvamps-uppmaningar", "inga utvecklingslöften", "inga The Prompt-element"],
  "gaps": [{"field": "reel_spec.audio", "level": "LUCKA"}, {"field": "asset.cta_slide", "level": "LUCKA"}],
  "needs_input": ["Bekräfta om hashtags i caption eller första kommentar"],
  "self_check": {"passed": true, "items": {"follows_brand_rules": true, "follows_character_bible": true, "follows_theme_bible": true, "no_forbidden_angles": true, "no_invented_facts": true, "cta_present_and_valid": true, "asset_refs_resolved_or_flagged": true, "only_familje_stunden_no_the_prompt": true}}
}
```

### 14.2 Instagram **Karusell** (lansering, brief-03)
```json
{
  "draft_id": "draft-fs-2026-09-03", "brief_id": "brief-03", "channel": "instagram", "format": "carousel",
  "beat": "launch", "status": "drafted", "language": "sv",
  "caption": {
    "hook": "Skördemånaden är här! 🍂🍎",
    "story": "Följ med Nova och Pling genom äpplen, svampar och pumpor — höstmagi i vardagen.",
    "value": "Allt färdigt i ett paket: saga, ljudsaga, pyssel och diplom. Ingen förberedelse krävs.",
    "cta_line": "Prova första månaden gratis – länk i profilen 💫"
  },
  "caption_rendered": "Skördemånaden är här! 🍂🍎\nFölj med Nova och Pling genom äpplen, svampar och pumpor — höstmagi i vardagen.\nAllt färdigt i ett paket: saga, ljudsaga, pyssel och diplom. Ingen förberedelse krävs.\nProva första månaden gratis – länk i profilen 💫",
  "carousel_slides": [
    {"order": 1, "role": "hook", "headline": "Skördemånaden är här 🍂", "body": "", "asset_ref": "covers/september.png"},
    {"order": 2, "role": "story", "headline": "Höst med Nova & Pling", "body": "Äpplen, svampar och pumpor.", "asset_ref": "characters/index.json#nova_pose_default"},
    {"order": 3, "role": "value", "headline": "Allt i ett paket", "body": "Saga, ljudsaga, pyssel, diplom. Ingen förberedelse.", "asset_ref": "characters/index.json#pling_pose_default"},
    {"order": 4, "role": "cta", "headline": "Prova gratis", "body": "Första månaden gratis – länk i profilen.", "asset_ref": null}
  ],
  "slide_count": 4,
  "hashtags": ["#familjestunden", "#skördetid", "#höstmedbarn", "#barnpyssel", "#skärmfritt", "#småbarnsliv", "#pysselmedbarn"],
  "cta": {"type": "trial", "label": "Prova gratis", "landing_url_slot": "<landningssida-UTM>"},
  "asset_plan": [
    {"slot": "slide-1", "asset_ref": "covers/september.png", "status": "available"},
    {"slot": "slide-2", "asset_ref": "characters/index.json#nova_pose_default", "status": "available"},
    {"slot": "slide-3", "asset_ref": "characters/index.json#pling_pose_default", "status": "available"},
    {"slot": "slide-4-cta", "asset_ref": null, "status": "LUCKA"}
  ],
  "character_usage": {"nova": "slide 2 – introducerar höstkänslan", "pling": "slide 3 – visar vad som ingår"},
  "must_not_applied": ["inga giftsvamps-uppmaningar utan vuxen", "inga utvecklingsgarantier", "inga The Prompt-element"],
  "gaps": [{"field": "theme.palette", "level": "LUCKA"}, {"field": "cta.landing_url", "level": "LUCKA"}, {"field": "asset.cta_slide", "level": "LUCKA"}],
  "needs_input": ["Landningssidans UTM-URL"],
  "self_check": {"passed": true, "items": {"follows_brand_rules": true, "follows_character_bible": true, "follows_theme_bible": true, "no_forbidden_angles": true, "no_invented_facts": true, "cta_present_and_valid": true, "asset_refs_resolved_or_flagged": true, "only_familje_stunden_no_the_prompt": true}}
}
```

### 14.3 Facebook **Inlägg** (lansering, brief-04)
```json
{
  "draft_id": "draft-fs-2026-09-04", "brief_id": "brief-04", "channel": "facebook", "format": "fb_post",
  "beat": "launch", "status": "drafted", "language": "sv",
  "caption": {
    "hook": "Hösten är här — och med den Skördemånaden! 🍂",
    "story": "Den här månaden tar Nova och Pling med barnen ut i skördetiden: äpplen, svampar och pumpor, med sagor och pyssel att mysa med tillsammans.",
    "value": "Som vanligt är allt färdigt i ett paket — saga, ljudsaga, pyssel och diplom. Ingen planering, bara fin tid ihop. Från 59 kr/mån, och första månaden är gratis.",
    "cta_line": "Prova gratis idag – länken nedan."
  },
  "caption_rendered": "Hösten är här — och med den Skördemånaden! 🍂\n\nDen här månaden tar Nova och Pling med barnen ut i skördetiden: äpplen, svampar och pumpor, med sagor och pyssel att mysa med tillsammans.\n\nSom vanligt är allt färdigt i ett paket — saga, ljudsaga, pyssel och diplom. Ingen planering, bara fin tid ihop. Från 59 kr/mån, och första månaden är gratis.\n\nProva gratis idag – länken nedan.",
  "fb_post": {
    "primary_text": "(= caption_rendered)",
    "link_preview_slot": "<landningssida-UTM>",
    "asset_ref": "covers/september.png",
    "hashtags": []
  },
  "hashtags": [],
  "cta": {"type": "trial", "label": "Prova gratis", "landing_url_slot": "<landningssida-UTM>"},
  "asset_plan": [
    {"slot": "main", "asset_ref": "covers/september.png", "status": "available"}
  ],
  "character_usage": {"nova": "varm berättande inledning", "pling": "lyfter det konkreta/roliga"},
  "must_not_applied": ["inga giftsvamps-uppmaningar utan vuxen", "inga utvecklingsgarantier", "inga The Prompt-element"],
  "gaps": [{"field": "cta.landing_url", "level": "LUCKA"}],
  "needs_input": ["Landningssidans UTM-URL"],
  "self_check": {"passed": true, "items": {"follows_brand_rules": true, "follows_character_bible": true, "follows_theme_bible": true, "no_forbidden_angles": true, "no_invented_facts": true, "cta_present_and_valid": true, "asset_refs_resolved_or_flagged": true, "only_familje_stunden_no_the_prompt": true}}
}
```

> Pris "59 kr / första månaden gratis" i FB-exemplet är [KANON] ur Marketing Bible. Alla tre utkast lämnar
> `landing_url_slot` som LUCKA (ingen påhittad URL) och flaggar saknad CTA-asset — exakt enligt §9/§11.

---

## 15. Öppna designfrågor (för granskning)
1. **Hashtag-placering IG:** i caption eller första kommentar — vill du ha en fast regel?
2. **Reel-längd:** är 15 sek rätt v1-default?
3. **Karusell-slides:** fast 4 (hook/story/value/cta) eller variabelt 3–6?
4. **En Drafter eller två:** en parametriserad agent (kanal som indata) vs. separata IG/FB-agenter — jag föreslår **en parametriserad** för v1.
5. **Emoji-policy:** nuvarande utkast använder sparsamt emoji (🍂✨). Vill du tillåta/begränsa?

> Inget av detta hittas på i designen — medvetna operatörsbeslut.
