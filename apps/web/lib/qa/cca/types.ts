// Character Consistency Agent — D2 (deterministic gate) types.
// Project-agnostic: NO Familje-Stunden constants live here. All thresholds and
// character-specific settings come from a project's canon files.

export type TrustLevel = "canonical" | "mixed" | "generated";
export type Band = "pass" | "warn" | "block" | "deferred";

/** Raw decoded image (RGBA, row-major). */
export interface RGBA {
  width: number;
  height: number;
  data: Uint8Array; // length = width*height*4
}

// ---- Canon shapes (subset we depend on) ----
export interface PaletteColor {
  name: string;
  hex: string | null;
  delta_e_tol: number;
  required: boolean;
}
export interface CanonCharacter {
  id: string;
  name: string;
  species: string;
  palette: PaletteColor[];
  must_have_features?: string[];
  must_not?: string[];
}
export interface CharacterReference {
  canon_version: string;
  characters: CanonCharacter[];
  duo_rules: {
    allowed_characters: string[];
    allowed_recurring_elements: string[];
    max_total_main_characters: number;
  };
}
export interface CcaParams {
  canon_version: string;
  project_id: string;
  signature_colors: Record<string, string[]>;
  foreign_share_min: number;
  loosen_factor_generated: number;
  provenance_epsilon: number;
  neutral_tolerance: { white_min: number; black_max: number };
  kmeans: { k: number; max_iter: number; quantize_bits: number; downsample_max_px: number };
}

// ---- D2 input ----
export interface D2Crop {
  characterId: string;
  pixels: RGBA;
  /** Required for must-have via provenance when trustLevel is canonical|mixed. */
  provenanceRefPixels?: RGBA;
}
export interface D2Input {
  projectId: string;
  trustLevel: TrustLevel;
  crops: D2Crop[];
  expectedCharacters: string[];
  compositionCount: number;
}

// ---- D2 report ----
export interface PaletteColorCheck {
  name: string;
  required: boolean;
  signature: boolean;
  found: boolean;
  min_delta_e: number;
  band: Band;
}
export interface PaletteCheck {
  colors: PaletteColorCheck[];
  missing_required: string[];
  missing_signature: string[];
  foreign_dominant: Array<{ rgb: [number, number, number]; share: number; min_delta_e: number }>;
  band: Band;
}
export interface MustHaveCheck {
  band: Band; // pass (provenance) | block (mismatch) | deferred (semantic/generated)
  via: "provenance" | "deferred";
  provenance_distance: number | null;
}
export interface MustNotCheck {
  deterministic_hits: string[];
  deferred_semantic: string[];
  band: Band;
}
export interface PerCharacterD2 {
  id: string;
  palette: PaletteCheck;
  must_have: MustHaveCheck;
  must_not: MustNotCheck;
  d2_band: Band;
}
export interface CountCheck {
  source: "composition_manifest";
  detected: number;
  expected: number;
  duplicates: string[];
  foreign_characters: string[];
  band: Band;
}
export interface D2Report {
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
