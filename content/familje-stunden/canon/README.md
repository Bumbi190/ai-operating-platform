# Familje-Stunden — Canon Foundation

Maskinläsbar, versionerad sanningskälla för Nova, Pling, brand, månadsteman, aktivitetskanon och barnsäkerhet. Konsumeras av alla agenter (Story, Activity, Marketing, framtida QA-agenter).

## Filer

| Fil | Roll | Schema |
|---|---|---|
| `character-reference.json` | Nova/Pling visuell + beteende-kanon (palett, features, proportioner, similarity) | `schemas/character-reference.schema.json` |
| `theme-canon.json` | 12 månader + aktivitetskanon + valideringsregler. **Enda sanningskällan för teman.** | `schemas/theme-canon.schema.json` |
| `child-safety-rules.json` | Barnsäkerhets-vetogrind (text + bild) | `schemas/child-safety-rules.schema.json` |
| `canon.meta.json` | Version, ägarskap, checksums, beslutslogg, öppna gap | — |

## Principer (governance)

1. **Prosa är människo-sanning, JSON är projektion.** `characters/*.md` och `themes/*.md` författas av människa. JSON-manifesten *härleds* från prosan (se `canon.meta.json.manifests[].derived_from`). Ändra aldrig JSON utan att prosan stämmer — eller uppdatera båda i samma PR.
2. **En sanningskälla per fakta.** `theme-canon.json` är källan för månadsnamn/teman/aktiviteter. `familje-stunden-v2/src/config/months/*` och `marketing-canon.ts` ska härledas/synkas härifrån (åtgärdas i senare fas). Idag finns namnkrockar (t.ex. "Vinterexpedition" vs "Vintermånaden") som ska lösas mot denna fil.
3. **Versionering.** `canon_version` (semver) höjs vid varje kanonändring. Agenter loggar vilken version de använde. Binära assets checksummas i `canon.meta.json`.
4. **`[LUCKA]` är förstklassig.** Saknade fält sätts till `null` + `status` som börjar på `gap_` (t.ex. `gap_measure`). En agent får aldrig hitta på dem. En grind som beror på ett gap-fält ska vara `enabled:false` med `blocked_by`.
5. **Säkerhet vetorätt.** `child-safety-rules.json` med `veto:true` — `block` kan aldrig auto-godkännas.

## Character Consistency — fyra kompletterande grindar

Definierade i `character-reference.json.consistency_gates`:

1. **palette_presence** (deterministisk) — alla `required:true`-färger måste finnas inom `delta_e_tol`; inga främmande dominanta färger. *Aktiv.*
2. **rule_features** (deterministisk/VLM) — `must_have_features`, `must_not`, `count_rule`. *Aktiv.*
3. **proportions** (landmärken) — head:body + nyckelmått. *Blockerad tills `proportions.status` ≠ `gap_measure`.*
4. **reference_similarity** (modell) — perceptuell likhet (image-embedding cosine) mot primär kanonreferens, beskuren per karaktär. Trösklar i manifestet. *Blockerad tills embedding-modell valts (Fas 2/3).*

Hex-värden i paletterna är **samplade ur de primära kanonbilderna** (`nova_clean.png`, `pling_clean.png`) med k-means på ogenomskinliga pixlar (2026-06-05).

## Synk-rutin (prosa → JSON), förslag

1. Uppdatera relevant `*.md` (människa).
2. Uppdatera motsvarande JSON-manifest + höj `canon_version`.
3. Validera mot schema (`schemas/*.schema.json`).
4. Uppdatera `canon.meta.json` (checksum, beslutslogg, gap).
5. Granskning + commit.

## Status

Version `0.1.0` (draft). Öppna gap listas i `canon.meta.json.open_gaps`. Inget av detta aktiverar publicering eller automation — det fastställer enbart den kanoniska grunden.
