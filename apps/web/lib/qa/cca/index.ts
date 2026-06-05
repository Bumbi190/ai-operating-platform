// Character Consistency Agent — D2 (deterministic gate). Public surface.
// Instantiated per project: every entry point requires a project_id and resolves
// canon/params from that project's canon files. No cross-project state.

export { runD2 } from "./d2";
export { loadCharacterReference, loadCcaParams } from "./canon-loader";
export type { LoaderOpts } from "./canon-loader";
export { decodePngToRGBA, makeRGBA, opaqueSamples } from "./image";

export type {
  TrustLevel, Band, RGBA,
  D2Input, D2Crop, D2Report, PerCharacterD2,
  PaletteCheck, PaletteColorCheck, MustHaveCheck, MustNotCheck, CountCheck,
  CharacterReference, CcaParams, CanonCharacter, PaletteColor,
} from "./types";
