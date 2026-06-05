# CCA-D2 — Deterministisk grind (palette · must-have · must-not · count)

**Datum:** 2026-06-05
**Bygger på:** Canon Foundation v0.1.0, Character Consistency Agent Design (DINOv2 + VLM, v1 kompositionsbaserad)
**Låsta beslut:** DINOv2 primär (lokalt), v1 strikt komposition med kända croppar, kalibrering 20–30 pos/neg, `trust_level` ∈ {canonical, mixed, generated}.
**Syfte:** Specificera den **billigaste, helt förklarbara** grinden som körs **först** och kortsluter på `block` innan dyrare lager (similarity/VLM). Ingen implementation — detta låser D2-specen.

---

## Project Isolation (officiell arkitekturprincip)

Project Isolation är en **officiell arkitekturprincip** i Omnira — på samma nivå som *Canon is the source of truth*, *Child Safety has veto* och *Human approval before publishing*.

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

**Tillämpning här:** D2-grinden körs som en **per-projekt-instans** mot det projektets `character-reference.json`. `trust_level`, alla D2-parametrar (`foreign_share_min`, `loosen_factor_generated`, signaturfärgs-listan, proveniens-ε) och alla rapporter bär `project_id`. En D2-fråga utan `project_id` ska vara **omöjlig** — inte bara obekväm. Inget D2-resultat, ingen config och inget minne delas mellan projekt.

---

## 1. trust_level — styr kontrollnivån

`trust_level` sätts av bildgeneratorn och avgör vilka kontroller som är meningsfulla/krävs.

| trust_level | Hur bilden skapades | must_have/must_not på karaktär | Palett | Count | Similarity/VLM (senare lager) |
|---|---|---|---|---|---|
| **canonical** | Helt av godkända kanonassets (figurer + ev. mall-bakgrund) | **Via proveniens** (croppen = registrerad kanonasset) | Sanity (ska stämma exakt) | Från kompositionsmanifest | Ej nödvändigt |
| **mixed** | Kanon-figurassets ovanpå generativ/annan bakgrund | **Via proveniens** på figur-croppar | Krävs (figur) + bakgrund till Image/Child Safety QA | Från manifest | Ej nödvändigt för figur; bakgrund granskas |
| **generated** | Figurer genererade från grunden | **Kan ej deterministiskt** → skjuts till VLM (D4) | Krävs (lösare tol) | Via detektion/segmentering (ej v1) | **Krävs** (D3 similarity + D4 VLM) |

**Konsekvens för v1:** v1 är strikt `canonical`/`mixed`. `generated` är out-of-scope för v1 men `trust_level`-fältet finns med så framtida flöden kan höja kontrollnivån utan schemaändring. D2 ensam räcker **aldrig** för `generated`.

**Princip:** D2 verifierar deterministiskt det som *går* — palett, antal, proveniens/integritet. Semantiska drag verifieras via proveniens (canonical/mixed) eller VLM (generated), aldrig via gissande pixelheuristik.

---

## 2. De fyra kontrollerna

### 2.1 Palette validation (deterministisk)

**Indata:** karaktär-crop (RGBA; alpha maskar transparenta kompositioner — för mixed/generated används segmenteringsmask).
**Algoritm:**
1. Samla ogenomskinliga pixlar i croppen; k-means (k≈8) → dominanta färger + andel.
2. För varje `palette[]`-färg i `character-reference.json`: konvertera till Lab, beräkna **ΔE2000** mot närmaste dominanta kluster.
3. `found = minΔE ≤ delta_e_tol`.
4. **Required-regel:** alla `required:true` måste vara `found`.
5. **Främmande dominant färg:** kluster med andel ≥ `foreign_share_min` (förslag 8 %) vars ΔE > tol mot *alla* kanonfärger **och** ej neutral (vit/svart/hud-tolerans) → flagga.

**trust_level-modulering:** `canonical` → tol används rakt av (förväntas exakt). `generated` → tol × `loosen_factor` (förslag 1.5) eftersom generering driver färg.

**Band:**
- `pass` = alla required found, inga främmande dominanta.
- `warn` = en required saknas **eller** en främmande dominant färg.
- `block` = ≥2 required saknas **eller** en **signaturfärg** saknas (Nova: `rosa_signatur`/`trojo_turkos`; Pling: `kropp_bla_primar`/`hjarta_gult`/`antenn_rosa`).

**Output per färg:** `{ name, found, min_delta_e, share, band }`.

### 2.2 Must-have validation

- **canonical/mixed:** verifieras via **proveniens** — figur-croppen matchar en registrerad kanonasset (checksum-match, eller tight perceptuell match LPIPS/embedding ≤ ε). Matchar den → alla `must_have_features` anses uppfyllda (croppen *är* kanonbilden). `band=pass`. Matchar den inte → `band=block` (oväntad/manipulerad asset).
- **generated:** `must_have_features` är semantiska → **deferred till D4 (VLM)**. D2 returnerar `band=deferred`, `reason="semantic_requires_vlm"`.

### 2.3 Must-not validation

Delas i två klasser:
- **Deterministiskt täckbara** (D2 avgör):
  - "byta kroppsfärg/färgschema" → fångas av palette-grinden (signaturfärg saknas → block).
  - "nya huvudkaraktärer / fler än kanon" → fångas av count-regeln (§2.4).
  - "icke-kanonisk asset" (canonical/mixed) → proveniens-miss → block.
- **Semantiska** ("robot-/maskindrag på Nova", "människa istället för robot", "skrämmande uttryck") → **deferred till D4 (VLM)**; för canonical/mixed är de uteslutna via proveniens.

**Band:** deterministisk `must_not`-träff → **block** (hård). Inga träffar i den deterministiska klassen → `pass` (med ev. `deferred` på semantiska).

### 2.4 Count rules

**Källa för antal:**
- `canonical`/`mixed` (v1): antal från **kompositionsmanifestet** (antal placerade figur-lager) — deterministiskt och exakt.
- `generated`: kräver detektion/segmentering → **ej v1**.

**Regler (ur `character-reference.json`):**
- `expected_characters` (ur draft, normalt `[nova, pling]`).
- Per karaktär `count_rule` = "exakt 1".
- `duo_rules.max_total_main_characters = 2`; `allowed_characters = [nova, pling]`.
- Inga `foreign_characters` (figurer utanför `allowed_characters` + `allowed_recurring_elements`).

**Band:** detekterat antal ≠ förväntat, dubblett av en karaktär, eller främmande karaktär → **block**. Annars `pass`.

---

## 3. Exekveringsordning (kostnadsstyrd)

D2 körs **före** D3/D4 och kortsluter:
```
count → palette → must_not(deterministisk) → must_have(proveniens|deferred)
   └─ vid 'block' i något steg: stoppa, returnera, hoppa över similarity/VLM (spar kostnad)
```
`canonical`/`mixed` som passerar D2 kan i v1 gå vidare till Aggregator utan D3/D4 (proveniens räcker). `generated` måste alltid fortsätta till D3+D4.

---

## 4. Datamodell

D2-resultatet är en delmängd av `character_report` (skrivs till `post_assets.character_report`). Tillägg: `trust_level` på toppnivå och `d2`-block per karaktär.

```jsonc
{
  "agent": "character_consistency",
  "stage": "D2_deterministic",
  "canon_version": "0.1.0",
  "trust_level": "canonical",
  "expected_characters": ["nova", "pling"],
  "count": {
    "source": "composition_manifest",
    "detected": 2, "expected": 2,
    "foreign_characters": [],
    "band": "pass"
  },
  "per_character": [
    {
      "id": "nova",
      "crop_ref": "post_assets/<id>/crops/nova.png",
      "provenance": { "matched_asset": "characters/nova/canonical-front.png",
                      "method": "checksum", "match": true },
      "palette": {
        "colors": [
          { "name": "rosa_signatur", "found": true, "min_delta_e": 1.8, "share": 0.16, "band": "pass" },
          { "name": "trojo_turkos",  "found": true, "min_delta_e": 2.1, "share": 0.10, "band": "pass" },
          { "name": "har_brunt",     "found": true, "min_delta_e": 3.0, "share": 0.21, "band": "pass" }
        ],
        "missing_required": [], "foreign_dominant": [], "band": "pass"
      },
      "must_have": { "band": "pass", "via": "provenance" },
      "must_not":  { "deterministic_hits": [], "band": "pass",
                     "deferred_semantic": ["robot-/maskindrag"] },
      "d2_band": "pass"
    }
    /* … pling … */
  ],
  "d2_overall": { "band": "pass", "short_circuited": false },
  "next_stages": { "similarity_required": false, "vlm_required": false },
  "evidence": ["post_assets/<id>/crops/nova.png", "…/pling.png"]
}
```

**Config som D2 läser:**
- `character-reference.json` (palette, must_have/must_not, count, duo_rules) — redan låst.
- D2-parametrar (förslag, kan bo i `cca_thresholds`): `foreign_share_min=0.08`, `loosen_factor_generated=1.5`, provenance `epsilon`, signaturfärgs-lista per karaktär.

---

## 5. Rapportformat (band-modell)

- Varje kontroll → `pass | warn | block | deferred`.
- `d2_band` per karaktär = värsta av kontrollerna (block > warn > pass; `deferred` påverkar inte bandet men flaggar att senare lager krävs).
- `d2_overall.band` = värsta per_character + count.
- **Hårda block** (deterministiska): signaturfärg saknas, fel antal, främmande karaktär, proveniens-miss (canonical/mixed). Dessa är högkonfidenta → motiverar kortslutning.
- `deferred`-fält gör tydligt för Aggregatorn vad D4/VLM fortfarande måste avgöra (relevant för `generated`).

Allt är **förklarbart**: varje fynd bär `min_delta_e`/`share`/`matched_asset` så en människa direkt ser *varför* något flaggades.

---

## 6. Integration med Review Queue

- D2 körs som **första grind**; dess rapport visas i en kompakt panel i `MarketingReviewClient.tsx`:
  - **trust_level-badge** (canonical/mixed/generated).
  - **Palett-chips** per required-färg: grön/gul/röd + ΔE-värde + provkartruta.
  - **Count-status**: "2/2 förväntade, inga främmande".
  - **Proveniens-badge** (canonical/mixed): "✔ matchar kanonasset".
  - **Deferred-notis**: vad VLM/similarity ännu ska avgöra (för generated).
- `d2_overall.band = block` → posten hamnar i `qa_failed`, **aldrig** auto-publik; människan ser exakt orsak.
- `pass`/`warn` → vidare i kedjan; sammanvägs av Aggregatorn med Image QA + Brand QA + **Child Safety (veto)**.
- D2 är billig och deterministisk → kan köras även som snabb **pre-commit-check** i bildgeneratorn (innan posten ens skapas), inte bara i review.
- Påminnelse om gating-precedens (oförändrad): `Child Safety block` > någon `block` > någon `warn` > `pass`. D2-block räknas som "någon block".

---

## 7. Implementation roadmap (D2, bygg senare)

**D2-1** Definiera kompositions-kontrakt: hur croppar + antal + `trust_level` exponeras från bildgeneratorn (kända lager i v1).
**D2-2** Palette-validator (k-means + ΔE2000 + required/foreign-regler + trust-modulering).
**D2-3** Proveniens-/integritetskontroll (checksum + tight perceptuell match) för must_have/must_not (canonical/mixed).
**D2-4** Count-validator mot `duo_rules`.
**D2-5** Sätt ihop `d2`-rapporten + kortslutningslogik; skriv `post_assets.character_report`.
**D2-6** Review Queue-panel (chips/badges) + koppling till Aggregatorns `overall_gate`.

*Beroenden:* allt mot redan låst kanon (v0.1.0). Inget aktiverar publicering. Signaturfärgs-listan och D2-parametrarna bör bekräftas i D2-1.

---

## 8. Beslut jag behöver av dig

1. **Signaturfärger** (block om de saknas): Nova = `rosa_signatur` + `trojo_turkos`; Pling = `kropp_bla_primar` + `hjarta_gult` + `antenn_rosa`. OK, eller justera?
2. **Proveniens-metod** för must_have (canonical/mixed): strikt **checksum** (kräver oförändrad asset) eller tolerant **perceptuell match** (tål omskalning/komprimering)? Förslag: perceptuell med snäv ε.
3. **D2-parametrar:** `foreign_share_min=0.08`, `loosen_factor_generated=1.5` — godkänns som startvärden (kalibreras senare)?
4. Vill du att nästa leverans blir **CCA-D3** (DINOv2 similarity + kalibreringsharness med dina 20–30 pos/neg), eller en **JSON-schemauppdatering** som lägger till `trust_level` + `d2`-blocket i `character-reference`/`post_assets`-modellen först?
