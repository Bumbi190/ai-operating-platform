# Fas 0 — Canon Foundation (Familje-Stunden)

**Datum:** 2026-06-05
**Syfte:** Fastställ en maskinläsbar, versionerad och långsiktigt hållbar kanonkälla för Nova, Pling, brand, månadsteman och aktivitetskanon — *innan* publicering eller bildautomation byggs.
**Princip:** Prosa-biblarna är människo-författad sanning; JSON-manifesten är den maskinläsbara projektionen (samma mönster som `marketing-canon.ts` redan följer). Ingen implementation i detta steg — detta fastställer grunden.

> Grundat i faktisk kod/innehåll (juni 2026). Sökvägar relativa till `AI Operating Platform/` om inget annat anges.

---

## Project Isolation (officiell arkitekturprincip)

Project Isolation är en **officiell arkitekturprincip** i Omnira — på samma nivå som *Canon is the source of truth*, *Child Safety has veto* och *Human approval before publishing*. Den gäller all design i detta dokument.

**Låsta principer:**
1. Omnira är ett multi-project operating system.
2. Varje projekt är ett isolerat workspace.
3. Varje workspace har eget: memory, knowledge base, canon, QA-agenter, workflows, publishing pipeline, business intelligence.
4. Agenter instansieras **per projekt, inte globalt** (instansiering — inte filter).
5. Global Atlas får se alla projekt.
6. Project Atlas får endast se sitt eget projekt.
7. Cross-project-kommunikation får endast ske genom Omnira-orkestrering.
8. Delat agentminne mellan projekt är **förbjudet**.
9. `project_id` ska vara förstklassigt i datamodell, QA, automation och framtida execution engine.

**Tillämpning här:** Canon-manifesten i `content/familje-stunden/canon/` tillhör **enbart** Familje-Stunden. Varje projekt har sin egen canon-mapp; ingen agent läser ett annat projekts canon. Canon resolvas via `canon(project_id)`, aldrig från en global lista över alla projekts canon.

---

## 1. Inventering — referensbilder som faktiskt finns

**Omnira-repot (`content/familje-stunden/characters/`):** inga binära bilder på disk — bara `index.json` med **Google Drive-pekare** (ej importerade till Supabase Storage). Pekar på 4 transparenta figur-PNG:er + ett scenbibliotek (~40 bilder, Drive-mapp `1tPVFx-…`).

**Familje-sajtens repo (`familje-stunden-v2/`):** här finns de **faktiska, användbara** bilderna på disk och webb-serverade:

| Fil | Mått | Format | Roll | Kanon-kandidat |
|---|---|---|---|---|
| `public/images/nova_clean.png` | 939×1056 | RGBA (alpha) | Nova frontvy, vinkar | **JA – primär** |
| `public/images/pling_clean.png` | 939×1056 | RGBA (alpha) | Pling frontvy, vinkar | **JA – primär** |
| `src/assets/nova.png` / `pling.png` | 939×1056 | RGBA | Identiska med _clean (samma storlek/bytes) | dubblett |
| `public/images/nova-winter-transparent.png` | 1772×1181 | RGBA | Nova vintervariant | sekundär (tema) |
| `public/images/pling-winter-transparent.png` | 939×1056 | RGBA | Pling vintervariant | sekundär (tema) |
| `src/assets/{maj,november,december,april}-…-nova-pling*.png` | varierar | RGBA | Säsongs-/scenbilder | sekundär (scen) |
| `public/startpaket/farglaggning-nova-pling-{1,2,3}.png` | 1024×1536 | RGB | Färgläggning (linjekonst) | ej kanonfärg (svartvitt) |

**Verifierat mot v2-biblar (jag har granskat bilderna):**
- **Nova** (`nova_clean.png`): människoflicka, brunt hår i sidosvans, **rosa/magenta hårband**, **turkos pikétröja** med krage, **rosa veckkjol**, rosa strumpor + rosa sneakers, håller en **bok**. ✔ matchar `nova-v2.md`.
- **Pling** (`pling_clean.png`): blå robot, hjälmhuvud med mörk ansiktsskärm, **ljusblå ögon + leende**, **rosa antennkula**, **gult hjärta** på bröstet, tvåtonad blå kropp, rundade fötter. ✔ matchar `pling-v2.md`.

**Två avvikelser att lösa (se Gap §5):**
1. `characters/index.json` anger rollen **"rymdkapten"** för båda — strider mot v2 (Nova = nyfiken flicka, Pling = robot-hjälpare). Stale.
2. `nova-v2.md` säger **"gul/orange bok"**, men på `nova_clean.png` är boken **blå/turkos**. Vilken är kanon?

---

## 2. Kanoniska Nova- & Pling-referenser (rekommendation)

**Primär kanonreferens** (för Character Consistency Agent + palett-sampling):
- Nova → `nova_clean.png` (939×1056, transparent, neutral frontpose).
- Pling → `pling_clean.png` (939×1056, transparent, neutral frontpose).

Motivering: rena, transparenta, fronvinklade, neutral pose, hög upplösning, verifierat kanon-korrekta. Idealiska som (a) referensbild i VLM-jämförelse och (b) källa för exakt färgsampling.

**Åtgärd:** importera dessa till Supabase Storage som **enda sanningskälla** (`familje-stunden/characters/nova/canonical-front.png`, `…/pling/canonical-front.png`), med checksum. Kontrollera om Drive-pekarnas `nova-vanlig.png`/`pling-vanlig.png` är samma bild (sannolikt) — dedupa, behåll en.

**Sekundära referenser** (variation/few-shot, efter dedup): alt-poser + säsongsvarianter + scenbiblioteket (~40). Märks som `secondary`, används aldrig för palettsanning, bara för pose-/scen-variation.

**Inte kanonfärg:** färgläggningsbilderna (linjekonst, svartvitt) — exkluderas ur palettsampling.

---

## 3. Arkitektur — Canon Foundation-lagret

Ett versionerat sanningslager i Omnira med tre maskinläsbara manifest + binära assets i Storage. Alla agenter (Story, Activity, Marketing, framtida QA-agenter) läser härifrån.

```
content/familje-stunden/
  canon/
    character-reference.json   ← Nova/Pling: visuell + beteende-kanon (maskinläsbar)
    theme-canon.json           ← 12 månader + aktivitetskanon + valideringsregler
    child-safety-rules.json    ← barnsäkerhetsregelverk (text + bild)
    canon.meta.json            ← version, checksums, ägarskap, schema-pekare
  characters/  *.md            ← prosa-biblar (människo-sanning, oförändrade)
  themes/      *.md            ← prosa per månad

Supabase Storage (bucket 'familje-stunden'):
  characters/nova/canonical-front.png        (+ checksum)
  characters/pling/canonical-front.png
  characters/{nova,pling}/secondary/*         (alt + scener)
  covers/<månad>.png
```

**Styrprinciper:**
- **En sanningskälla per fakta.** Idag finns teman på tre ställen (Omnira `themes/index.json`, `marketing-canon.ts`, *och* `familje-stunden-v2/src/config/months/*`) med namnskillnader (t.ex. "Vinterexpedition" vs "Vintermånaden"). `theme-canon.json` blir **den** källan; övriga ska härledas/synkas från den.
- **Prosa → granskning → JSON.** JSON skapas/uppdateras från prosa-biblarna, aldrig tvärtom utan granskning.
- **Versionering.** `canon_version` (semver) + per-asset checksum. Agenter pinnar en version och loggar vilken de använde.
- **`[LUCKA]` är förstklassig.** Fält som saknas markeras explicit `null` + `status:"gap"`; en agent får aldrig hitta på dem (befintlig regel i `character-rules.md`).

---

## 4. Datamodell

### 4.1 `character-reference.json` (förslag)

```jsonc
{
  "canon_version": "0.1.0",
  "updated": "2026-06-05",
  "brand": "familje-stunden",
  "characters": [
    {
      "id": "nova",
      "name": "Nova",
      "species": "human_girl",            // INTE 'rymdkapten' — rättar index.json
      "pronoun": "hon",
      "role_in_duo": "nyfiken/kännande utforskare",
      "canonical_images": [
        { "role": "primary_front", "storage_path": "characters/nova/canonical-front.png",
          "checksum": "sha256:…", "width": 939, "height": 1056, "transparent": true }
      ],
      "secondary_images": [ /* alt + scener, role:'secondary' */ ],
      "palette": [
        { "name": "hårband_rosa",  "hex": null, "delta_e_tol": 6, "where": "hårband, kjol, skor", "status": "gap_sample" },
        { "name": "tröja_turkos",  "hex": null, "delta_e_tol": 6, "where": "pikétröja", "status": "gap_sample" },
        { "name": "hår_brunt",     "hex": null, "delta_e_tol": 8, "where": "hår", "status": "gap_sample" },
        { "name": "bok",           "hex": null, "delta_e_tol": 8, "where": "boken hon håller", "status": "conflict" } // gul (v2) vs blå (bild)
      ],
      "must_have_features": [
        "brunt hår i sidosvans", "rosa hårband", "turkos pikétröja med krage",
        "rosa veckkjol", "rosa sneakers", "håller en bok"
      ],
      "must_not": [
        "robot/maskindrag", "byta hårfärg eller frisyr", "vuxen", "skrämmande uttryck",
        "annan klädsel-färgschema än kanon"
      ],
      "proportions": {                       // status:'gap' tills uppmätt från primärbild
        "head_to_body_ratio": null, "landmarks": null, "status": "gap_measure"
      },
      "count_rule": "exakt 1 Nova per bild",
      "vlm_criteria": [                       // mänskligt läsbara kriterier för VLM-grind
        "Matchar frisyr, hårband och färgschema referensbilden?",
        "Är det samma person (inte en ny flicka)?"
      ]
    },
    {
      "id": "pling",
      "name": "Pling",
      "species": "robot",
      "pronoun": "han",
      "role_in_duo": "kunnig/teknisk guide & förklarare",
      "canonical_images": [ { "role": "primary_front", "storage_path": "characters/pling/canonical-front.png", "checksum": "sha256:…", "width": 939, "height": 1056, "transparent": true } ],
      "palette": [
        { "name": "kropp_blå",    "hex": null, "delta_e_tol": 6, "where": "kropp/huvud", "status": "gap_sample" },
        { "name": "ögon_ljusblå", "hex": null, "delta_e_tol": 6, "where": "ögon", "status": "gap_sample" },
        { "name": "antenn_rosa",  "hex": null, "delta_e_tol": 6, "where": "antennkula", "status": "gap_sample" },
        { "name": "hjärta_gult",  "hex": null, "delta_e_tol": 6, "where": "bröst-hjärta", "status": "gap_sample" }
      ],
      "must_have_features": [
        "hjälmhuvud med mörk ansiktsskärm", "ljusblå ögon + leende",
        "rosa antennkula högst upp", "gult hjärta på bröstet", "tvåtonad blå kropp"
      ],
      "must_not": [ "människa/flicka", "byta kroppsfärg", "sakna hjärtknapp eller antenn" ],
      "proportions": { "status": "gap_measure" },
      "count_rule": "exakt 1 Pling per bild"
    }
  ],
  "duo_rules": {
    "default_frame": "Nova & Pling utforskar månadens tema tillsammans med barnet",
    "allowed_characters": ["nova", "pling"],
    "allowed_recurring_elements": ["kometvän", "stjärnstenen"],
    "forbidden": ["nya huvudkaraktärer", "blanda med The Prompt", "namngivna verkliga personer"],
    "max_total_main_characters": 2
  }
}
```

### 4.2 `theme-canon.json` + aktivitetsvalidering (förslag)

```jsonc
{
  "canon_version": "0.1.0",
  "source_of_truth": true,                  // övriga månadskällor härleds från denna
  "months": [
    {
      "slug": "juni",
      "month_number": 6,
      "display_name": null,                  // [LUCKA] tema ej fastställt
      "emoji": null,
      "status": "blocked",                   // blocked | draft | defined
      "publishable": false,                  // juni får ej publiceras förrän defined
      "focus": null,
      "symbols": [],
      "palette": [],
      "must_not": [],
      "activities": [],                      // tom → ingen aktivitet "finns" i juni
      "key_visual": { "storage_path": "covers/juni.png", "checksum": "sha256:…" },
      "cta": { "url": "https://familje-stunden.se/prova-gratis", "price_sek": 59 }
    },
    {
      "slug": "februari",
      "month_number": 2,
      "display_name": "Kärleksmånad",
      "emoji": "❤️",
      "status": "defined",
      "publishable": true,
      "focus": "Känslor och vänskap; hjärtpyssel",
      "symbols": ["hjärtan", "vänskap", "känslor"],
      "must_not": ["skrämmande", "The Prompt", "vuxna kärleksteman"],
      "activities": [
        { "id": "feb-farglaggning", "type": "farglaggning", "title": "Hjärtfärgläggning",
          "exists": true, "asset_ref": "activities/februari/farglaggning.pdf" },
        { "id": "feb-klipp-klistra", "type": "klipp-klistra", "exists": true, "asset_ref": "activities/februari/klipp-och-klistra.pdf" }
        /* … diplom, klistermärken, broschyr … */
      ]
    }
    /* … alla 12 månader … */
  ]
}
```

**Aktivitetsvalidering** (regler en agent kör mot manifestet):
1. Månadens `status === "defined"` och `publishable === true` — annars blockera (juni faller här).
2. En refererad aktivitet måste finnas i `months[aktuell].activities[]` med `exists:true` (matchning på `id`/`type`).
3. Minst en `symbol` ur månaden ska förekomma i copy; inga symboler från andra månader (korstema-block).
4. `cta.url`/`price_sek` måste matcha månadens kanon.

### 4.3 `child-safety-rules.json` (se §6)

---

## 5. Gap-analys — vad som måste fyllas innan Character Consistency Agent kan byggas

| # | Lucka | Påverkan | Åtgärd i Fas 0 |
|---|---|---|---|
| G1 | Kanoniska PNG:er ej i Omnira Storage (bara Drive-pekare + i sajt-repot) | Agenten saknar referensbild-källa | Importera `nova_clean`/`pling_clean` → Storage, checksum, dedupa mot Drive |
| G2 | **Exakta hex-paletter ej samplade** (Nova + Pling) | Deterministisk palettgrind omöjlig | Sampla ur primärbilderna; sätt ΔE-toleranser |
| G3 | **Proportioner/landmärken odefinierade** | Proportionskontroll omöjlig | Mät head:body + nyckelmått från primärbild |
| G4 | Kanon-konflikt: `index.json` roll "rymdkapten" fel | Fel sanning matas till agenter | Rätta roll → människoflicka / robot |
| G5 | Visuell konflikt: bokfärg gul (v2) vs blå (bild) | Palett/feature-check blir fel | **Beslut krävs** vilken som är kanon |
| G6 | Ingen maskinläsbar `character-reference.json` | Allt är prosa idag | Författa enligt §4.1 |
| G7 | Tema-sanning splittrad på 3 ställen + namnkrock (Vinterexpedition/Vintermånaden, m.fl.) | Aktivitet/tema-validering blir tvetydig | Konsolidera till `theme-canon.json` som enda källa |
| G8 | **Juni-temat odefinierat** | Kan inte validera juni-innehåll | Sätt `status:"blocked"` tills temat beslutas |
| G9 | Aktivitetskanon gles i `themes/index.json` (bara feb har aktiviteter) | "Aktivitet finns denna månad" ej validerbart för flertalet månader | Fyll `activities[]` per månad ur paketkällor |
| G10 | Inget barnsäkerhetsregelverk maskinläsbart | Child Safety QA kan ej byggas | Författa `child-safety-rules.json` (§6) |
| G11 | Kvarvarande `[LUCKA]` i Pling (extra "aldrig"-regler) | Mindre — par-nivå räcker tills vidare | Logga, fyll vid tillfälle |
| G12 | Ingen versionering/ägarskap/synk-process | Kanon driftar isär över tid | Definiera `canon.meta.json` + process |

**Exit-kriterium Fas 0:** alla tre manifest validerar mot schema; inga `gap`-fält kvar i de fält Character Consistency Agent är beroende av (G2, G3, G5); kanoniska bilder i Storage med checksum; juni satt `blocked`.

---

## 6. Child Safety QA-komponent (tillsammans med Brand QA)

**Princip:** Child Safety och Brand QA är **ortogonala**. Brand frågar "känns det som oss / på tema / rätt CTA". Child Safety frågar "är detta tryggt för ett barn 3–9 år". Child Safety är en **hård vetogrind** — `BLOCK` kan aldrig auto-godkännas eller överröstas; `WARN` tvingar till review.

**Omfattning (text + bild):**

*Text:*
- Inget skrämmande, våldsamt, otäckt eller ångestframkallande.
- Inga osäkra instruktioner (t.ex. äta okänd svamp/växt, vatten/eld/höjd utan vuxen) → kräver "tillsammans med en vuxen"-formulering.
- Åldersanpassat språk; inga vuxenteman.
- Inga ogrundade utvecklings-/hälsopåståenden (överlappar Brand men säkerhetskritiskt).
- Ingen insamling av barns personuppgifter; inga länkar till okända domäner.

*Bild:*
- Inga skrämmande/olämpliga motiv; inga osäkra aktiviteter avbildade utan vuxen.
- Endast kanoniska karaktärer (inga främlingar/vuxna i osäker kontext).
- Ingen olämplig eller felaktig text i bild.
- Choking-hazard/pyssel med smådelar → kräver vuxen-notis.

**Datamodell `child-safety-rules.json` (förslag):**
```jsonc
{
  "canon_version": "0.1.0",
  "veto": true,                              // BLOCK kan aldrig auto-godkännas
  "rules": [
    { "id": "CS-SCARY",   "scope": "both", "method": "vlm",
      "criterion": "Något skrämmande, hotfullt eller ångestframkallande för 3–9 år?",
      "severity": "block", "message": "Skrämmande innehåll" },
    { "id": "CS-UNSAFE-ACT", "scope": "text", "method": "hybrid",
      "criterion": "Osäker aktivitet utan vuxennotis (svamp/växt/vatten/eld/höjd/smådelar)?",
      "patterns": ["äta svamp", "simma själv", "tända eld"], "severity": "block",
      "message": "Osäker aktivitet utan vuxenövervakning" },
    { "id": "CS-AGE-LANG", "scope": "text", "method": "vlm",
      "criterion": "Vuxenteman eller olämpligt språk?", "severity": "block" },
    { "id": "CS-CLAIMS",   "scope": "text", "method": "hybrid",
      "criterion": "Ogrundat utvecklings-/hälsopåstående?", "severity": "warn" },
    { "id": "CS-PII",      "scope": "text", "method": "deterministic",
      "criterion": "Ber om barns personuppgifter / länk till okänd domän?", "severity": "block" },
    { "id": "CS-IMG-STRANGER", "scope": "image", "method": "vlm",
      "criterion": "Främling/vuxen i osäker kontext, eller annan än Nova/Pling?", "severity": "warn" },
    { "id": "CS-IMG-UNSAFE", "scope": "image", "method": "vlm",
      "criterion": "Osäker aktivitet avbildad utan vuxen?", "severity": "block" }
  ]
}
```
**Output:** `{ verdict: pass|warn|block, findings: [{rule_id, severity, evidence}] }`. Kör parallellt med Brand QA; `block` stoppar oavsett Brand-resultat.

---

## 7. Prioriterad implementeringsplan (Fas 0, ingen kod ännu)

**Steg 0.1 — Beslut & konfliktlösning (människa).** Lås: (a) primära kanonbilder (förslag: `nova_clean`/`pling_clean`), (b) bokfärg gul vs blå (G5), (c) rätt roller (G4), (d) `theme-canon.json` som enda tema-sanning (G7), (e) juni `blocked` (G8). → *kort beslutslista, du + jag.*

**Steg 0.2 — Asset-import & dedup.** Importera primära PNG:er till Storage, verifiera mot Drive-dubbletter, checksumma, registrera i `character-reference.json`. (G1)

**Steg 0.3 — Sampling & mätning.** Sampla exakta hex ur primärbilderna, sätt ΔE-toleranser; mät proportioner/landmärken. (G2, G3)

**Steg 0.4 — Författa `character-reference.json`** enligt §4.1 (projektion av v2 + palett + bilder). (G6)

**Steg 0.5 — Författa `theme-canon.json`** — konsolidera 12 månader + fyll `activities[]` per månad; juni `blocked`. (G7–G9)

**Steg 0.6 — Författa `child-safety-rules.json`** enligt §6. (G10)

**Steg 0.7 — Governance.** `canon.meta.json` (version, checksums, ägarskap), JSON-schema för alla tre manifest, samt en kort prosa→JSON-synkrutin. (G12)

**Beroenden:** 0.1 före allt. 0.2→0.3→0.4 i ordning. 0.5/0.6 parallellt med 0.4. 0.7 sist. Inget av detta rör publicering eller bildgenerering — det fastställer enbart grunden.

---

## 8. Beslut jag behöver av dig (Steg 0.1)

1. **Primära kanonbilder:** godkänner du `nova_clean.png` + `pling_clean.png` som primär referens?
2. **Novas bok:** gul/orange (v2-text) eller blå (nuvarande bild) — vilken är kanon?
3. **Tema-sanning:** OK att `theme-canon.json` blir enda källan och att Familje-sajtens månadskonfig härleds/synkas från den?
4. **Juni:** bekräfta `blocked` tills temat beslutas — eller vill du fastställa juni-temat nu?
5. Vill du att jag, efter dina svar, författar de tre manifesten (schema + ifyllda värden) som nästa konkreta leverans?
