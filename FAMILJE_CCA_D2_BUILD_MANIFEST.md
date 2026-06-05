# CCA-D2 — Build Manifest (granskas innan kod)

**Datum:** 2026-06-05
**Scope:** Isolerad, testbar D2-modul. Mål: `Canon → D2 → Report` med enhetstester mot Nova/Pling-kanon.
**Uttryckligt ute:** ingen DB, ingen review-UI, ingen DINOv2, ingen VLM, ingen publicering, ingen runtime-inkoppling i appen.
**Låsta beslut:** signaturfärger (Nova: rosa_signatur+troja_turkos; Pling: kropp_bla_primar+hjarta_gult+antenn_rosa), proveniens = perceptuell match med snäv ε, `foreign_share_min=0.08`, `loosen_factor_generated=1.5`.

> Inget skrivs förrän du godkänt denna manifest.

---

## 1. Förutsättningar (upptäckt i repot)

- **Inget testramverk finns** (ingen vitest/jest, inga `*.test.ts`). Måste läggas till för enhetstester.
- **Canon-JSON läses inte av runtime idag.** `marketing-canon.ts` är en handskriven TS-projektion. D2 ska läsa `content/familje-stunden/canon/character-reference.json` **direkt** (single source of truth), via en egen loader.
- Konventioner att följa (från `guard.ts`): rena, sidoeffektfria funktioner; exporterade typer + en `evaluate…()`-funktion som returnerar ett typat resultat.
- `@/*`-alias pekar på `apps/web/`-roten.

---

## 2. Filer som SKAPAS

### 2a. D2-motor (projekt-agnostisk kod, instansieras per projekt)
Hemvist: `apps/web/lib/qa/cca/` — **noll projekt-specifika konstanter**; allt Familje-data resolvas via `project_id` + canon.

| Fil | Ansvar |
|---|---|
| `apps/web/lib/qa/cca/types.ts` | Typer: `TrustLevel` (`canonical\|mixed\|generated`), `D2Report`, `PaletteCheck`, `CountCheck`, `PerCharacterD2`, `Band` (`pass\|warn\|block\|deferred`). Speglar rapport-schemat i D2-specen. |
| `apps/web/lib/qa/cca/canon-loader.ts` | `loadCharacterReference(projectId)` + `loadCcaParams(projectId)` — läser `content/<projectId>/canon/*.json`, validerar mot schema, returnerar typat. **Kastar om `projectId` saknas.** Projekt-scopad; ingen global lista. |
| `apps/web/lib/qa/cca/color.ts` | Ren TS-färgmatte: sRGB→Lab, **ΔE2000**, k-means-palettextraktion ur råa pixlar. Inga beroenden. |
| `apps/web/lib/qa/cca/image.ts` | Avkoda bild → rå RGBA + alfamask + crop-hantering. Tunn wrapper kring `sharp`. |
| `apps/web/lib/qa/cca/provenance.ts` | Perceptuell match (nedskalning + normaliserad jämförelse, snäv ε) mot kanonasset. Ingen checksum. |
| `apps/web/lib/qa/cca/d2.ts` | Orkestratorn: `runD2(input, canon, params): D2Report`. Deterministisk, kortsluter på `block`. Implementerar palette / must-have / must-not / count enligt D2-specen. |
| `apps/web/lib/qa/cca/index.ts` | Publik yta: re-export `runD2` + typer. |

`runD2`-signatur (förslag):
```ts
runD2(input: {
  projectId: string;            // förstklassigt — krävs
  trustLevel: TrustLevel;
  crops: { characterId: string; pixels: RGBA; assetRefForProvenance?: string }[];
  expectedCharacters: string[];
  compositionCount: number;     // antal placerade figur-lager (v1 känt)
}, canon: CharacterReference, params: CcaParams): D2Report
```

### 2b. Projekt-scopad config (data, inte kod)
| Fil | Ansvar |
|---|---|
| `content/familje-stunden/canon/cca-params.json` | `signature_colors` per karaktär, `foreign_share_min=0.08`, `loosen_factor_generated=1.5`, `provenance_epsilon`, neutral-toleranser. **Bor i projektets canon**, inte i delad kod (isolering). |
| `content/familje-stunden/canon/schemas/cca-params.schema.json` | Schema för ovan. |

### 2c. Tester + fixtures (projekt-scopade)
| Fil | Ansvar |
|---|---|
| `apps/web/lib/qa/cca/__tests__/d2.test.ts` | Enhetstester mot Nova/Pling-kanon: positiva (kanonbilderna → `pass`), negativa (omfärgad signaturfärg → `block`, extra/främmande figur → `block`, saknad required → `warn`). |
| `apps/web/lib/qa/cca/__tests__/color.test.ts` | ΔE2000 + k-means determinism. |
| `apps/web/lib/qa/cca/__tests__/fixtures/nova-canonical.png` | Kopia av `familje-stunden-v2/public/images/nova_clean.png`. |
| `apps/web/lib/qa/cca/__tests__/fixtures/pling-canonical.png` | Kopia av `pling_clean.png`. |
| `apps/web/lib/qa/cca/__tests__/fixtures/neg-*.png` | Syntetiska negativ (omfärgade/extra figur) genererade i testförberedelse. |

---

## 3. Filer som MODIFIERAS

| Fil | Ändring | Varför |
|---|---|---|
| `apps/web/package.json` | + devDep `vitest`, + dep `sharp`; `"test"`-script | Inget testramverk/bilddekoder finns idag |
| `apps/web/vitest.config.ts` (ny) | Minimal vitest-config | Köra enhetstesterna |
| `content/familje-stunden/canon/canon.meta.json` | Lägg `cca-params.json` i `manifests`/gap-logg | Håll governance korrekt |

Inga andra befintliga filer rörs. **`guard.ts`, `review.ts`, `workflows/*`, `drafter.ts`, `planner.ts` är orörda.**

---

## 4. Tabeller, services, integrationer

- **Tabeller: inga.** D2 läser inget från och skriver inget till databasen. `D2Report` returneras som ett typat, serialiserbart objekt in-memory.
- **Services: inga.** Ingen API-route, ingen cron, ingen Vercel-funktion. D2 är ett rent bibliotek.
- **Integrationer: inga i denna fas.** D2 importeras inte från någon sida/route/agent ännu. Ingen koppling till review, publisher, tokens eller Meta.
- **Beroenden (nya):** `sharp` (bildavkodning, väletablerad) + `vitest` (test). Flaggas för godkännande. Färgmatte + proveniens skrivs i ren TS (inga extra beroenden).

**Framtida integrationer (EJ nu, listade för spårbarhet):** `post_assets`-tabell, `MarketingReviewClient.tsx`-panel, Aggregator/`overall_gate`. Tas i nästa fas (`Canon → D2 → Review → Approval`).

---

## 5. Project Isolation i bygget

- `runD2` och loadern **kräver `project_id`**; anrop utan det kastar. Ingen global vy.
- D2-motorn i `lib/qa/cca/` innehåller **noll Familje-konstanter** — signaturfärger, parametrar och canon kommer alltid från `content/<projectId>/canon/`. Samma motor kan instansieras för GainPilot/The Prompt med deras egen canon.
- Params/trösklar bor i **projektets** canon (`cca-params.json`), inte i delad kod. Inget delas mellan projekt.
- Testfixtures ligger under projekt-scopad testkatalog och representerar endast Familje.

---

## 6. Dataflöde (denna fas)

```
content/familje-stunden/canon/character-reference.json ─┐
content/familje-stunden/canon/cca-params.json ──────────┤
                                                        ▼
  bild + crops (testfixtures)  →  image.ts  →  runD2(projectId, …)  →  D2Report (JSON)
                                                        │
                                   color.ts / provenance.ts (rena TS)
                                                        ▼
                                          enhetstester asserterar band
```

Ingen punkt i flödet rör DB, nätverk, review eller publicering.

---

## 7. Acceptanskriterier (när D2 är "klar" i denna fas)

1. `runD2` ger `pass` för Nova- och Pling-kanonbilderna (rätt trust_level, alla signaturfärger funna).
2. `block` när en signaturfärg omfärgats, vid fel antal figurer, och vid främmande karaktär.
3. `warn` när en icke-signatur required-färg saknas.
4. Rapporten är fullt förklarbar (ΔE-värden, andelar, matchad asset).
5. Alla enhetstester gröna; modulen importerar inget app-/DB-/nätverksberoende.
6. `project_id` krävs överallt; ingen global åtkomst möjlig.

---

## 8. Vad jag behöver av dig innan kod

1. Godkänn **hemvist** `apps/web/lib/qa/cca/` (alternativt föreslå annan).
2. Godkänn **nya beroenden**: `sharp` + `vitest`.
3. Godkänn att **`cca-params.json`** läggs i projektets canon (inte i kod).
4. Klartecken att börja koda D2 enligt denna manifest (fortfarande inga commits förrän du säger till).
