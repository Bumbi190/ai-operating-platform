// CCA-D2 — deterministic gate orchestrator. Pure function: identical inputs ->
// identical D2Report. No DB, no network, no project constants.

import type {
  Band, CcaParams, CharacterReference, CountCheck, D2Input, D2Report,
  MustHaveCheck, MustNotCheck, PaletteCheck, PaletteColorCheck, PerCharacterD2,
} from "./types";
import { deltaE2000 as deltaE, extractPalette, hexToRgb, srgbToLab, type Cluster } from "./color";
import { opaqueSamples } from "./image";
import { perceptualMatch } from "./provenance";

const RANK: Record<Band, number> = { deferred: 0, pass: 1, warn: 2, block: 3 };
function worst(bands: Band[]): Band {
  let b: Band = "pass";
  for (const x of bands) if (RANK[x] > RANK[b]) b = x;
  return b;
}

function paletteCheck(
  charId: string,
  pixels: D2Input["crops"][number]["pixels"],
  canon: CharacterReference,
  params: CcaParams,
  trust: D2Input["trustLevel"],
): PaletteCheck {
  const character = canon.characters.find((c) => c.id === charId)!;
  const signatures = new Set(params.signature_colors[charId] ?? []);
  const tolFactor = trust === "generated" ? params.loosen_factor_generated : 1;
  const samples = opaqueSamples(pixels, params.kmeans.downsample_max_px);
  const sampleLabs = samples.map((s) => srgbToLab(s));
  const total = sampleLabs.length || 1;
  // k-means is used ONLY for foreign-dominant detection (high-share clusters).
  const clusters = extractPalette(samples, params.kmeans.k, params.kmeans.max_iter, params.kmeans.quantize_bits);

  const canonColors = character.palette.filter((p) => p.hex);
  // Presence is decided by direct sampling vs a presence floor — NOT by k-means
  // centroids, which would wash out small-but-required regions (e.g. Pling's
  // pink antenna / yellow heart).
  const colors: PaletteColorCheck[] = canonColors.map((p) => {
    const targetLab = srgbToLab(hexToRgb(p.hex!));
    const tol = p.delta_e_tol * tolFactor;
    let within = 0;
    let minDE = Infinity;
    for (const lab of sampleLabs) {
      const d = deltaE(lab, targetLab);
      if (d < minDE) minDE = d;
      if (d <= tol) within++;
    }
    const found = within / total >= params.presence_floor;
    const signature = signatures.has(p.name);
    return {
      name: p.name, required: p.required, signature, found,
      min_delta_e: minDE === Infinity ? -1 : Math.round(minDE * 1e4) / 1e4,
      band: found ? "pass" : (signature || p.required ? "block" : "warn"),
    };
  });

  const missing_required = colors.filter((c) => c.required && !c.found).map((c) => c.name);
  const missing_signature = colors.filter((c) => c.signature && !c.found).map((c) => c.name);

  // foreign dominant: a high-share cluster far from every canon color and not neutral
  const foreignDeltaThreshold = Math.max(...canonColors.map((p) => p.delta_e_tol)) * tolFactor;
  const canonLabs = canonColors.map((p) => srgbToLab(hexToRgb(p.hex!)));
  const foreign_dominant = clusters
    .filter((cl) => cl.share >= params.foreign_share_min && !isNeutral(cl, params))
    .map((cl) => ({ cl, minDE: minDEToLabs(cl, canonLabs) }))
    .filter((x) => x.minDE > foreignDeltaThreshold)
    .map((x) => ({ rgb: x.cl.rgb as [number, number, number], share: x.cl.share, min_delta_e: x.minDE }));

  let band: Band;
  if (missing_signature.length > 0 || missing_required.length >= 2) band = "block";
  else if (missing_required.length >= 1 || foreign_dominant.length > 0) band = "warn";
  else band = "pass";

  return { colors, missing_required, missing_signature, foreign_dominant, band };
}

// helpers for foreign-color distance (cluster color vs canon Lab set)
function minDEToLabs(cl: Cluster, canonLabs: ReturnType<typeof srgbToLab>[]): number {
  let min = Infinity;
  const lab = srgbToLab(cl.rgb);
  for (const c of canonLabs) {
    const d = deltaE(lab, c);
    if (d < min) min = d;
  }
  return min === Infinity ? Infinity : Math.round(min * 1e4) / 1e4;
}
function isNeutral(cl: Cluster, params: CcaParams): boolean {
  const [r, g, b] = cl.rgb;
  const w = params.neutral_tolerance.white_min, k = params.neutral_tolerance.black_max;
  return (r >= w && g >= w && b >= w) || (r <= k && g <= k && b <= k);
}

function mustHaveCheck(crop: D2Input["crops"][number], trust: D2Input["trustLevel"], epsilon: number): MustHaveCheck {
  if (trust === "generated") return { band: "deferred", via: "deferred", provenance_distance: null };
  if (!crop.provenanceRefPixels) {
    // canonical/mixed but no reference to prove provenance -> cannot confirm
    return { band: "block", via: "provenance", provenance_distance: null };
  }
  const r = perceptualMatch(crop.pixels, crop.provenanceRefPixels, epsilon);
  return { band: r.match ? "pass" : "block", via: "provenance", provenance_distance: r.distance };
}

function mustNotCheck(
  charId: string,
  canon: CharacterReference,
  palette: PaletteCheck,
  mustHave: MustHaveCheck,
): MustNotCheck {
  const character = canon.characters.find((c) => c.id === charId)!;
  const deterministic_hits: string[] = [];
  if (palette.missing_signature.length > 0) deterministic_hits.push("signature_color_changed");
  if (mustHave.band === "block") deterministic_hits.push("provenance_mismatch");
  return {
    deterministic_hits,
    deferred_semantic: character.must_not ?? [],
    band: deterministic_hits.length > 0 ? "block" : "pass",
  };
}

function countCheck(input: D2Input, canon: CharacterReference): CountCheck {
  const allowed = new Set([...canon.duo_rules.allowed_characters, ...canon.duo_rules.allowed_recurring_elements]);
  const ids = input.crops.map((c) => c.characterId);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const id of ids) { if (seen.has(id)) duplicates.push(id); else seen.add(id); }
  const foreign_characters = ids.filter((id) => !allowed.has(id));
  const detected = input.compositionCount;
  const expected = input.expectedCharacters.length;
  const band: Band =
    detected !== expected || duplicates.length > 0 || foreign_characters.length > 0 ||
    detected > canon.duo_rules.max_total_main_characters
      ? "block" : "pass";
  return { source: "composition_manifest", detected, expected, duplicates, foreign_characters, band };
}

export function runD2(input: D2Input, canon: CharacterReference, params: CcaParams): D2Report {
  if (!input.projectId) throw new Error("[CCA] runD2: projectId is mandatory.");
  if (params.project_id !== input.projectId) {
    throw new Error(`[CCA] params.project_id '${params.project_id}' != input.projectId '${input.projectId}' (isolation guard).`);
  }

  const count = countCheck(input, canon);

  const per_character: PerCharacterD2[] = input.expectedCharacters.map((id) => {
    const crop = input.crops.find((c) => c.characterId === id);
    if (!crop) {
      // expected character has no crop -> hard block on this character
      const palette: PaletteCheck = { colors: [], missing_required: [], missing_signature: [], foreign_dominant: [], band: "block" };
      const must_have: MustHaveCheck = { band: "block", via: "provenance", provenance_distance: null };
      const must_not: MustNotCheck = { deterministic_hits: ["missing_crop"], deferred_semantic: [], band: "block" };
      return { id, palette, must_have, must_not, d2_band: "block" };
    }
    const palette = paletteCheck(id, crop.pixels, canon, params, input.trustLevel);
    const must_have = mustHaveCheck(crop, input.trustLevel, params.provenance_epsilon);
    const must_not = mustNotCheck(id, canon, palette, must_have);
    const d2_band = worst([palette.band, must_have.band, must_not.band]);
    return { id, palette, must_have, must_not, d2_band };
  });

  const overallBand = worst([count.band, ...per_character.map((p) => p.d2_band)]);
  const short_circuited = overallBand === "block";
  const proceeds = input.trustLevel === "generated" && !short_circuited;

  return {
    version: "d2-v1",
    agent: "character_consistency",
    stage: "D2_deterministic",
    projectId: input.projectId,
    canon_version: canon.canon_version,
    trust_level: input.trustLevel,
    count,
    per_character,
    d2_overall: { band: overallBand, short_circuited },
    next_stages: { similarity_required: proceeds, vlm_required: proceeds },
  };
}
