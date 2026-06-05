# CCA-D2 — Slutgiltig implementationsplan (väntar på godkännande)

**Datum:** 2026-06-05
**Scope:** Isolerad, deterministisk D2-modul. `Canon → D2 → Report` + enhetstester. Ingen kod skrivs förrän denna plan godkänts.
**Bekräftade constraints:** inga commits/pushes, ingen runtime-integration, ingen DB, inga API-routes, ingen review-UI, ingen workflow-integration, inga ändringar utanför godkänd manifest.

---

## 1. Determinismgaranti (genomgående)

- **Ingen `Math.random` någonstans.** K-means använder **deterministisk init utan RNG**: pixlar kvantiseras till ett fast grid, de `k` vanligaste kvantiserade färgerna blir startcentroider (stabil sortering, tie-break på lägsta färgindex).
- **Lloyd-iterationer:** fast `max_iter`, deterministisk tilldelning (tie-break = lägsta centroid-index), stopp vid no-change. Centroider sorteras sist på fallande pixelandel (stabil sort, tie-break på Lab-värde).
- **Bilddekodning:** `sharp` med fast nedskalning (fast storlek + fast kernel) → identiska råpixlar för identisk indatafil.
- **Pixelordning:** radvis (row-major), explicit.
- **Numerik i rapporten avrundas** (ΔE och andelar till 4 decimaler) som extra skyddsbälte mot float-jitter, så `D2Report` blir bit-identisk mellan körningar.
- **Fast seed-konstant** dokumenteras även om RNG inte används (om k-means++ någon gång väljs senare: `seed = 0xD2`).
- Följd: **identisk indata → identisk `D2Report`** (bevisas av determinism-testet).

---

## 2. Exakta filer som SKAPAS

### D2-motor — `apps/web/lib/qa/cca/` (projekt-agnostisk, noll Familje-konstanter)
| Fil | Innehåll |
|---|---|
| `types.ts` | `TrustLevel`, `Band`, `RGBA`, `PaletteColorCheck`, `PaletteCheck`, `RulesCheck`, `MustHaveCheck`, `CountCheck`, `PerCharacterD2`, `D2Report`, `D2Input`, `CharacterReference`, `CcaParams` |
| `canon-loader.ts` | `loadCharacterReference(projectId)`, `loadCcaParams(projectId)` — läser `content/<projectId>/canon/*.json`, **kastar om `projectId` saknas/tomt**, validerar mot schema |
| `color.ts` | `srgbToLab()`, `deltaE2000()`, `extractPalette(pixels,k)` (deterministisk), `nearestDeltaE()` |
| `image.ts` | `decodeToRGBA(input)`, `opaquePixels(rgba)`, `cropRegion(rgba,box)` (sharp-wrapper, fast nedskalning) |
| `provenance.ts` | `perceptualMatch(cropPixels, refPixels, epsilon)` → `{ match, distance }` (nedskalning + normaliserad jämförelse, snäv ε; ingen checksum) |
| `d2.ts` | `runD2(input, canon, params): D2Report` — orkestrator, kortsluter på `block`, sätter `version:"d2-v1"` |
| `index.ts` | Publik yta (se §4) |

### Projekt-scopad config — `content/familje-stunden/canon/`
| Fil | Innehåll |
|---|---|
| `cca-params.json` | `signature_colors` (Nova: `rosa_signatur`,`troja_turkos`; Pling: `kropp_bla_primar`,`hjarta_gult`,`antenn_rosa`), `foreign_share_min:0.08`, `loosen_factor_generated:1.5`, `provenance_epsilon`, neutral-toleranser, `kmeans:{k,max_iter,quantize_bits}` |
| `schemas/cca-params.schema.json` | Schema för ovan |

### Tester + fixtures — `apps/web/lib/qa/cca/__tests__/`
| Fil | Innehåll |
|---|---|
| `d2.test.ts` | Alla 7 testfall (§5) |
| `color.test.ts` | ΔE2000 kända värden + `extractPalette`-determinism |
| `fixtures/nova-canonical.png` | Kopia av `familje-stunden-v2/public/images/nova_clean.png` |
| `fixtures/pling-canonical.png` | Kopia av `pling_clean.png` |
| `fixtures/_prep.ts` | Deterministisk generering av negativa varianter (omfärgad signaturfärg, ändrad icke-signaturfärg) från kanonbilderna via sharp — inga RNG |

> Antal/främmande-karaktär testas via **indatastrukturen** (`crops`, `compositionCount`, `expectedCharacters`) — kräver inga 3-figurs-bildfixturer.

---

## 3. Exakta filer som MODIFIERAS

| Fil | Ändring |
|---|---|
| `apps/web/package.json` | + devDep `vitest`, + dep `sharp`, + `"test": "vitest run"` |
| `apps/web/vitest.config.ts` *(ny)* | Minimal config (node-miljö, include `lib/qa/cca/**`) |
| `content/familje-stunden/canon/canon.meta.json` | Lägg `cca-params.json` i `manifests` + uppdatera gap-logg |

Inget annat rörs. `guard.ts`, `review.ts`, `workflows/*`, `drafter.ts`, `planner.ts`, alla sidor/routes: **orörda**.

---

## 4. Publik API-yta (`index.ts`)

```ts
// Funktioner
export function runD2(input: D2Input, canon: CharacterReference, params: CcaParams): D2Report;
export function loadCharacterReference(projectId: string): CharacterReference; // kastar om !projectId
export function loadCcaParams(projectId: string): CcaParams;                   // kastar om !projectId

// Typer
export type { TrustLevel, Band, RGBA, D2Input, D2Report, PerCharacterD2,
              PaletteCheck, PaletteColorCheck, RulesCheck, MustHaveCheck, CountCheck,
              CharacterReference, CcaParams };
```

`D2Input` (förstklassigt `projectId`):
```ts
interface D2Input {
  projectId: string;                 // krävs
  trustLevel: TrustLevel;
  crops: { characterId: string; pixels: RGBA; provenanceRefPixels?: RGBA }[];
  expectedCharacters: string[];
  compositionCount: number;
}
```

`D2Report` (med version):
```ts
interface D2Report {
  version: "d2-v1";
  agent: "character_consistency";
  stage: "D2_deterministic";
  projectId: string;
  canon_version: string;
  trust_level: TrustLevel;
  count: CountCheck;
  per_character: PerCharacterD2[];
  d2_overall: { band: Band; short_circuited: boolean };
  next_stages: { similarity_required: boolean; vlm_required: boolean };
}
```

Internmoduler (`color`, `image`, `provenance`, `canon-loader`, `d2`) exporterar sina funktioner för test, men den avsedda ytan utåt är `index.ts`.

---

## 5. Test coverage matrix

| # | Test | Indata | trust_level | Förväntat overall | Utlöses av | Assert |
|---|---|---|---|---|---|---|
| 1 | Nova canonical → pass | `nova-canonical.png` som enda crop, expected=[nova] | canonical | `pass` | palett alla required found, count ok, proveniens match | `d2_overall.band==="pass"` |
| 2 | Pling canonical → pass | `pling-canonical.png`, expected=[pling] | canonical | `pass` | dito | `==="pass"` |
| 3 | Signaturfärg ändrad → block | Nova med `rosa_signatur` omfärgad | canonical | `block` | palett: signaturfärg saknas | `block` + `palette.band==="block"` |
| 4 | Främmande karaktär → block | crops innehåller `characterId:"xyz"` (ej i allowed) | canonical | `block` | count: foreign_characters | `count.band==="block"` |
| 5 | Fel antal → block | `compositionCount=1`, expected=[nova,pling] | canonical | `block` | count: detected≠expected | `count.band==="block"` |
| 6 | Saknad icke-signatur required → warn | Nova med `har_brunt` ändrad, signaturer intakta | canonical | `warn` | palett: required saknas (ej signatur) | `warn` + `missing_required` innehåller `har_brunt` |
| 7 | Determinism → pass | Kör testfall 1 indata N=5 gånger | canonical | identisk | — | `deepEqual(report_i, report_0)` för alla i |
| 8 | ΔE2000 kända värden | Lab-par med kända ΔE | — | — | `color.ts` | inom tolerans mot referensvärden |
| 9 | extractPalette determinism | samma pixelbuffer ×N | — | — | `color.ts` | identiska centroider/andelar |

---

## 6. Beroendeförändringar

- **+ `sharp`** (dependencies) — bildavkodning till råpixlar. Väletablerad, deterministisk vid fast storlek/kernel.
- **+ `vitest`** (devDependencies) — testkörare. Nytt; inget testramverk finns idag.
- Inget annat. Färgmatte (Lab, ΔE2000, k-means) och proveniens skrivs i ren TS utan beroenden.

---

## 7. Bekräftelse mot dina krav

- ✅ Determinism: fast init utan RNG, avrundad numerik, identisk in → identisk ut.
- ✅ `version:"d2-v1"` i `D2Report`.
- ✅ Determinism-test (N körningar, deep-equal) = testfall 7.
- ✅ `project_id` obligatoriskt; loader kastar om det saknas.
- ✅ Inga Familje-konstanter i motorn; alla trösklar/signaturfärger ur canon (`cca-params.json`).
- ✅ Alla 7 begärda testfall i matrisen.
- ✅ Inga commits/pushes/DB/API/review-UI/workflow; endast filer i godkänd scope.

---

## 8. Väntar på godkännande

Säg **"godkänt, bygg"** så implementerar jag exakt enligt denna plan (motor + config + tester), kör testsviten lokalt i sandboxen tills allt är grönt, och rapporterar resultatet — fortfarande utan commit/push tills du beslutar.
