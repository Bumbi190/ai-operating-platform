# Character Consistency Agent — Design

**Datum:** 2026-06-05
**Bygger på:** Canon Foundation v0.1.0 (`content/familje-stunden/canon/`)
**Syfte:** Avgöra om en genererad/komponerad bild följer Familje-Stundens kanon för Nova & Pling **innan** publicering. Ingen implementation — detta låser designen.
**Princip:** Deterministiskt först (billigt, förklarbart), modellbaserat sist. QA-lagret byggs före automatisk publicering.

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

**Tillämpning här:** Character Consistency Agent är **inte** en global agent som tar `project_id` som filter — den **instansieras per projekt** och binds till det projektets canon (`canon(project_id)`). Embedding-cache (`canonical_embeddings`), kalibreringsmängd och trösklar (`cca_thresholds`) är **projekt-lokala** och delas aldrig mellan projekt. Familjes DINOv2-referensvektorer och VLM-kriterier är Familjes; GainPilot/The Prompt har sina egna. `project_id` ingår i `post_assets`, `qa_runs`, `canonical_embeddings` och `cca_thresholds`. Korsprojekt-behov går via Omnira-orkestrering, aldrig via delat agentminne.

---

## 1. Arkitektur

Character Consistency Agent (CCA) är **en** av flera QA-agenter i pipen, parallell med Image QA, och med Brand QA + Child Safety QA. Den läser kanon från manifesten och pinnar `canon_version`.

```
Marketing Engine → Bildgenerator
        │
        ▼
   [Segmentering]  → beskär Nova-crop + Pling-crop ur posten
        │
        ▼
 Character Consistency Agent (CCA)
   per karaktär:  (1) similarity  (2) palette  (3) rules/count  (4) VLM-verify  (5) proportions*
        │  → character_report {verdict, per-char sub-scores, evidens-crops}
        ▼
   Aggregator  ←  Image QA-report
                ←  Brand QA-report (+ activity validation)
                ←  Child Safety-report (VETO)
        │
        ▼
   overall_gate = pass | warn | block   → Review Queue → (människa) → Publisher
```

**Viktig förutsättning — segmentering.** Similarity, palett och proportioner måste mätas **per karaktär-crop**, inte på hela posten (bakgrund + 2 figurer). Två fall:
- **Komposition (v1):** vi placerade figurerna själva → croppar är kända (trivialt, exakt).
- **Generativ bild (senare):** kräver detektion/segmentering (VLM-bounding-box, eller Grounding-DINO/SAM). Markeras som beroende; v1 undviker det via komposition.

**Indata:** post-bild, `expected_characters` (ur draft), `canon_version`.
**Utdata:** `character_report` (se §4), skrivs till `post_assets.character_report`. CCA *publicerar aldrig* — den sätter bara status.

---

## 2. Modelljämförelse (reference image similarity)

Frågan CCA besvarar med similarity: *"Är figuren på croppen samma karaktär som den kanoniska referensbilden?"* — pose-/bakgrunds-tolerant, men känslig för fel färg/form. Figurerna är **icke-fotografiska** (tecknad flicka + robot), vilket utesluter ansiktsigenkänning (ArcFace m.fl. — tränade på riktiga ansikten, fungerar inte på robot/serie).

| Modell | Typ | Körs | Kostnad | Precision (samma figur) | Drift-robusthet | Determinism | Latens |
|---|---|---|---|---|---|---|---|
| **DINOv2 (ViT-B/14)** | Self-sup. bild-embedding | Lokalt (CPU/GPU) | Gratis (vikter) | **Hög** för instans/objekt-likhet på illustration | Bra mot pose/bakgrund; fångar form+färg | Deterministisk | ~10–50 ms (GPU) |
| CLIP (ViT-L/14) | Text-aligned bild-embedding | Lokalt/API | Gratis lokalt | Medel — semantiskt grovt ("tecknad flicka" ≈ "tecknad flicka") | Hög mot pose, men **för** generös (missar identitetsdrift) | Deterministisk | ~20–60 ms |
| SigLIP | Förbättrad CLIP | Lokalt/API | Gratis lokalt | Medel–hög (bättre retrieval än CLIP) | Som CLIP | Deterministisk | ~20–60 ms |
| LPIPS | Perceptuell patch-likhet | Lokalt | Gratis | Hög endast för **nära-dubbletter** | **Låg** — straffar pose/bakgrundsbyte hårt | Deterministisk | ~10–30 ms |
| pHash / SSIM | Struktur-hash | Lokalt | ~0 | Endast nära-dubblett | Mycket låg | Deterministisk | <5 ms |
| **VLM-judge** (Claude vision) | Modell-domare | API | ~några cent/bild | **Hög + förklarbar** ("rätt karaktär? fel färg? extra figur?") | Hög | Lätt icke-deterministisk | ~1–3 s |

**Rekommendation:**
- **Primär similarity-backbone: DINOv2-embedding (cosine).** Bäst balans av instans-precision, pose-tolerans, noll rörlig kostnad och full determinism. Self-supervised features generaliserar till illustration bättre än CLIP:s textsemantik.
- **Semantisk verifierare: VLM-judge** (deliverable 4) — körs efter, ger förklarbart utlåtande mot `vlm_criteria` och fångar defekter embeddings missar.
- **pHash som billig regressions-/nära-dubblettvakt** (valfritt): flagga om en ny post är identisk med en tidigare publicerad.
- **Uteslut:** ArcFace (fel domän), LPIPS/SSIM som identitetsmått (pose-känsligt) — LPIPS kan dock användas snävt för "är detta exakt den kanoniska PNG:en" i komposition.

> Trösklarna i `character-reference.json` (pass 0.92 / warn 0.85) är CLIP-aktiga platshållare och **måste omkalibreras för DINOv2** (se §5 kalibrering).

---

## 3. De fem kontrollerna (mappade mot canon)

1. **Reference similarity** — DINOv2-cosine mellan karaktär-crop och förberäknad embedding av `canonical_images[primary_front]`. Per karaktär.
2. **Palette validation** — för varje `palette[].required=true`: finns färgen i croppen inom `delta_e_tol` (ΔE2000 i Lab)? Flagga främmande dominanta färger. Deterministiskt, ingen modell.
3. **Must-have / must-not + count** — `must_have_features`, `must_not`, `count_rule` (exakt 1 Nova + 1 Pling), `duo_rules.max_total_main_characters=2`, inga icke-kanoniska karaktärer. Hård regel: `must_not`-träff eller fel antal = **block**.
4. **VLM character verification** — vision-modell bedömer mot `vlm_criteria` per karaktär ("rätt frisyr/färg/blå bok?", "robot inte människa?", "samma karaktär?") + defekt-flaggor som överlappar Image QA (fingrar/ansikte) men ur *karaktärs*-vinkel. Strukturerad output.
5. **Proportion validation (lägre prio)** — head:body + landmärken. **Blockerad** tills `proportions.status` ≠ `gap_measure` i manifestet. Byggs sist.

---

## 4. Datamodell

CCA-rapporten lagras i `post_assets.character_report` (tabellen föreslagen i Meta Automation-planen). Förslag på struktur:

```jsonc
{
  "agent": "character_consistency",
  "canon_version": "0.1.0",
  "model": { "similarity": "dinov2-vitb14", "vlm": "claude-vision" },
  "expected_characters": ["nova", "pling"],
  "detected_character_count": 2,
  "per_character": [
    {
      "id": "nova",
      "crop_ref": "post_assets/<id>/crops/nova.png",
      "similarity": { "score": 0.94, "band": "pass" },
      "palette":    { "required_found": ["rosa_signatur","trojo_turkos","har_brunt"],
                      "missing": [], "foreign_dominant": [], "band": "pass" },
      "rules":      { "must_have_ok": true, "must_not_hits": [], "band": "pass" },
      "vlm":        { "match": true, "issues": [], "band": "pass",
                      "notes": "rätt frisyr, rosa+turkos, blå bok" },
      "proportions":{ "band": "skipped", "reason": "gap_measure" },
      "character_score": 96,
      "verdict": "pass"
    }
    /* … pling … */
  ],
  "count_rule_ok": true,
  "foreign_characters": [],
  "overall": { "verdict": "pass", "score": 95 },
  "evidence": ["post_assets/<id>/crops/nova.png", "…/pling.png"]
}
```

**Stödtabeller/config:**
- `canonical_embeddings` (cache): per karaktär + `canon_version` → förberäknad DINOv2-vektor (slipp räkna om referensen varje gång; invalideras vid ny canon_version/checksum).
- `cca_thresholds` (config, kan bo i canon eller separat): per modell de kalibrerade trösklarna (§5).
- `qa_runs` (audit): en rad per körning med alla agentrapporter, `overall_gate`, `canon_version`, modellversioner — för spårbarhet och senare omkalibrering.

---

## 5. Score-modell & trösklar

**Per delkontroll → band (`pass`/`warn`/`block`) + delpoäng 0–100.**

- **Similarity:** `cos ≥ τ_pass → pass`, `τ_warn ≤ cos < τ_pass → warn`, `cos < τ_warn → block`. τ kalibreras (nedan).
- **Palette:** alla required inom tol → pass; en saknas/främmande dominant → warn; ≥2 saknas eller signaturfärg fel → block.
- **Rules/count:** `must_not`-träff, fel antal figurer, eller främmande karaktär → **block** (hård). Saknad `must_have` → warn.
- **VLM:** `match=true, issues=[]` → pass; mindre issue → warn; "fel karaktär/art/färg" → block.
- **Proportions:** skipped (v1).

**Karaktärs-poäng** (viktad, endast i warn-bandet — hårda block överrider allt):
```
character_score = 0.40*similarity + 0.25*palette + 0.20*vlm + 0.15*rules     (0–100)
```
(Vikt 0 för proportions tills aktiv; omfördelas dit senare.)

**Aggregering till `overall` för CCA:**
- Vilken som helst delkontroll = `block` → `verdict=block`.
- Annars någon = `warn` → `verdict=warn`.
- Annars `pass`. `score = min(per_character.character_score)`.

**Kalibrering av τ (obligatoriskt steg innan similarity aktiveras):**
1. Bygg **positiv mängd** (kanoniska + godkända varianter/scener) och **negativ mängd** (off-model-genereringar, andra serietecknade figurer, fel färgschema).
2. Räkna DINOv2-cosine mot referensen för båda.
3. Välj `τ_pass` vid hög precision (få falska godkännanden) och `τ_warn` vid hög recall (fånga allt tveksamt till review). Dokumentera precision/recall.
4. Skriv in i `cca_thresholds` + uppdatera placeholders i `character-reference.json`.

---

## 6. Integration med Brand QA & Child Safety QA

Fyra **oberoende** agenter, körs parallellt, var och en skriver sin rapport. En central **Aggregator** sätter `overall_gate`:

| Agent | Frågar | Hård block? |
|---|---|---|
| **Child Safety QA** | Är det tryggt för barn? | **VETO** — `block` överrider allt, kan aldrig auto-godkännas |
| **Character Consistency** | Är det rätt Nova & Pling? | Ja vid `must_not`/fel antal/fel art |
| **Brand QA** (+ activity validation) | Känns det som oss, rätt tema/aktivitet/CTA? | Ja vid The Prompt-kontaminering, odefinierad månad (juni), fel CTA |
| **Image QA** | Är bilden teknisk OK (upplösning, fingrar, text)? | Ja vid trasig bild |

**Gating-logik (Aggregator):**
```
om Child Safety = block            → overall = block   (veto, oavsett övriga)
annars om någon agent = block      → overall = block
annars om någon agent = warn       → overall = warn
annars                             → overall = pass
```
- `block`/`warn` → status `qa_failed`/`ready_for_review`, **aldrig** auto-publik.
- `pass` → `ready_for_review`. I v1 godkänner ändå alltid en människa.
- Alla rapporter visas sida vid sida i Review Queue (utbyggnad av `MarketingReviewClient.tsx`).
- Activity validation (`theme-canon.json`): juni `publishable=false` → Brand QA block; aktivitet som inte finns i månadens `activities[]` (och `activity_canon_complete=true`) → block.

---

## 7. Implementation roadmap (design klar → bygg senare)

**CCA-D1 — Segmenterings-/crop-beslut.** Lås v1 = komposition (kända croppar); generativ segmentering (VLM-bbox/SAM) skjuts till senare. Definiera crop-kontrakt.

**CCA-D2 — Deterministiska grindar först.** Palette (ΔE2000) + rules/count. Billigast, ingen modell, störst andel uppenbara fel fångas. Förberäkna `canonical_embeddings` (referensvektorer).

**CCA-D3 — Similarity (DINOv2) + kalibrering.** Bygg positiv/negativ-mängd, kalibrera τ_pass/τ_warn, skriv `cca_thresholds`, uppdatera manifest-placeholders.

**CCA-D4 — VLM character verification.** Prompta mot `vlm_criteria`, strukturerad output, sammanväg band.

**CCA-D5 — Aggregator + rapport + review-integration.** `character_report` → `post_assets`; visa i Review Queue; koppla in i `overall_gate` tillsammans med Brand + Child Safety + Image QA.

**CCA-D6 — Proportions (sist).** Kräver landmärkesmätning (stänger `gap_measure` i manifestet). Aktivera grinden + omfördela vikt i score.

*Beroenden:* D2 kan börja direkt (kanon klar). D3 kräver kalibreringsdata. D6 kräver att Fas 0-gapet G3 stängs. Inget i denna roadmap aktiverar publicering — CCA är en grind, inte en publicerare.

---

## 8. Beslut jag behöver av dig

1. **Similarity-backbone:** godkänner du **DINOv2** som primär + **VLM-judge** som semantisk verifierare?
2. **Körning:** ska similarity köras **lokalt** (DINOv2-vikter, ingen rörlig kostnad) eller via hostad inferens? (Påverkar drift/kostnad.)
3. **v1-omfång:** bekräfta att v1 är **kompositions-baserad** (kända croppar, ingen generativ segmentering ännu).
4. **Kalibreringsdata:** har vi en samling off-model/godkända bilder att kalibrera τ mot, eller ska det tas fram som ett eget litet steg?
5. Vill du att nästa leverans blir en **detaljerad spec för CCA-D2** (deterministiska palette/rules-grindarna) eftersom den kan byggas direkt mot befintlig kanon?
