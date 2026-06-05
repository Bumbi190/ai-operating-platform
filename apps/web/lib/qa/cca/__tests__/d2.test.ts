import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runD2 } from "../d2";
import { loadCharacterReference, loadCcaParams } from "../canon-loader";
import { decodePngToRGBA } from "../image";
import { srgbToLab, deltaE2000, hexToRgb } from "../color";
import type { RGBA, CharacterReference, CcaParams } from "../types";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => join(here, "fixtures", n);

/** Find the repo's content/ dir by walking up from the test file (works in repo + scratch). */
function findContentRoot(): string {
  let dir = here;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "content", "familje-stunden", "canon"))) return join(dir, "content");
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("content/ not found from test dir");
}
const CANON_ROOT = findContentRoot();
const PROJECT = "familje-stunden";

/** Deterministic recolor: replace pixels within `threshold` ΔE of `targetHex`. */
function recolor(img: RGBA, targetHex: string, replace: [number, number, number], threshold: number): RGBA {
  const targetLab = srgbToLab(hexToRgb(targetHex));
  const data = new Uint8Array(img.data);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= 200) continue;
    const dE = deltaE2000(srgbToLab([data[i], data[i + 1], data[i + 2]]), targetLab);
    if (dE <= threshold) { data[i] = replace[0]; data[i + 1] = replace[1]; data[i + 2] = replace[2]; }
  }
  return { width: img.width, height: img.height, data };
}

let canon: CharacterReference;
let params: CcaParams;
let nova: RGBA;
let pling: RGBA;

beforeAll(() => {
  canon = loadCharacterReference(PROJECT, { canonRoot: CANON_ROOT });
  params = loadCcaParams(PROJECT, { canonRoot: CANON_ROOT });
  nova = decodePngToRGBA(fx("nova-canonical.png"));
  pling = decodePngToRGBA(fx("pling-canonical.png"));
});

describe("CCA-D2 — canon → gate → report", () => {
  it("project_id is mandatory (loader throws without it)", () => {
    expect(() => loadCharacterReference("", { canonRoot: CANON_ROOT })).toThrow();
    expect(() => loadCcaParams("", { canonRoot: CANON_ROOT })).toThrow();
  });

  it("1. Nova canonical → pass", () => {
    const r = runD2({
      projectId: PROJECT, trustLevel: "canonical",
      crops: [{ characterId: "nova", pixels: nova, provenanceRefPixels: nova }],
      expectedCharacters: ["nova"], compositionCount: 1,
    }, canon, params);
    expect(r.version).toBe("d2-v1");
    expect(r.d2_overall.band).toBe("pass");
  });

  it("2. Pling canonical → pass", () => {
    const r = runD2({
      projectId: PROJECT, trustLevel: "canonical",
      crops: [{ characterId: "pling", pixels: pling, provenanceRefPixels: pling }],
      expectedCharacters: ["pling"], compositionCount: 1,
    }, canon, params);
    expect(r.d2_overall.band).toBe("pass");
  });

  it("3. Signature color changed → block", () => {
    const novaSig = recolor(nova, "#ee5172", [40, 200, 80], 14); // rosa_signatur -> green
    const r = runD2({
      projectId: PROJECT, trustLevel: "canonical",
      crops: [{ characterId: "nova", pixels: novaSig, provenanceRefPixels: novaSig }],
      expectedCharacters: ["nova"], compositionCount: 1,
    }, canon, params);
    expect(r.d2_overall.band).toBe("block");
    expect(r.per_character[0].palette.band).toBe("block");
    expect(r.per_character[0].palette.missing_signature).toContain("rosa_signatur");
  });

  it("4. Foreign character present → block", () => {
    const r = runD2({
      projectId: PROJECT, trustLevel: "canonical",
      crops: [
        { characterId: "nova", pixels: nova, provenanceRefPixels: nova },
        { characterId: "pling", pixels: pling, provenanceRefPixels: pling },
        { characterId: "xyz", pixels: nova, provenanceRefPixels: nova },
      ],
      expectedCharacters: ["nova", "pling"], compositionCount: 3,
    }, canon, params);
    expect(r.d2_overall.band).toBe("block");
    expect(r.count.band).toBe("block");
    expect(r.count.foreign_characters).toContain("xyz");
  });

  it("5. Wrong character count → block", () => {
    const r = runD2({
      projectId: PROJECT, trustLevel: "canonical",
      crops: [
        { characterId: "nova", pixels: nova, provenanceRefPixels: nova },
        { characterId: "pling", pixels: pling, provenanceRefPixels: pling },
      ],
      expectedCharacters: ["nova", "pling"], compositionCount: 1,
    }, canon, params);
    expect(r.d2_overall.band).toBe("block");
    expect(r.count.band).toBe("block");
  });

  it("6. Missing non-signature required color → warn", () => {
    const novaBrown = recolor(nova, "#73371a", [128, 128, 128], 16); // har_brunt -> gray
    const r = runD2({
      projectId: PROJECT, trustLevel: "canonical",
      crops: [{ characterId: "nova", pixels: novaBrown, provenanceRefPixels: novaBrown }],
      expectedCharacters: ["nova"], compositionCount: 1,
    }, canon, params);
    expect(r.d2_overall.band).toBe("warn");
    expect(r.per_character[0].palette.missing_required).toContain("har_brunt");
    expect(r.per_character[0].palette.missing_signature).toEqual([]);
  });

  it("7. Deterministic output (5 runs → deep equal)", () => {
    const input = {
      projectId: PROJECT, trustLevel: "canonical" as const,
      crops: [{ characterId: "nova", pixels: nova, provenanceRefPixels: nova }],
      expectedCharacters: ["nova"], compositionCount: 1,
    };
    const first = runD2(input, canon, params);
    for (let i = 0; i < 4; i++) expect(runD2(input, canon, params)).toEqual(first);
  });

  it("Golden Master — D2Report matches stored fixture (regression guard)", () => {
    const report = runD2({
      projectId: PROJECT, trustLevel: "canonical",
      crops: [
        { characterId: "nova", pixels: nova, provenanceRefPixels: nova },
        { characterId: "pling", pixels: pling, provenanceRefPixels: pling },
      ],
      expectedCharacters: ["nova", "pling"], compositionCount: 2,
    }, canon, params);

    const goldenDir = join(here, "golden");
    const goldenFile = join(goldenDir, "nova-pling.d2.json");
    if (!existsSync(goldenFile)) {
      mkdirSync(goldenDir, { recursive: true });
      writeFileSync(goldenFile, JSON.stringify(report, null, 2) + "\n");
      console.warn("[golden] bootstrapped:", goldenFile);
    }
    const golden = JSON.parse(readFileSync(goldenFile, "utf8"));
    expect(report).toEqual(golden);
  });
});
