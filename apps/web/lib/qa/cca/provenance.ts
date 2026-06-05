// Perceptual provenance match (deterministic). Downscales both images to a fixed
// grid by block-averaging, then compares normalized RGB. Tolerates rescaling /
// compression but rejects different artwork. No checksum.

import type { RGBA } from "./types";

const GRID = 16;

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Block-average to GRID x GRID, normalized 0..1, length GRID*GRID*3. */
function toGrid(img: RGBA): Float64Array {
  const out = new Float64Array(GRID * GRID * 3);
  const cellW = img.width / GRID;
  const cellH = img.height / GRID;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let sr = 0, sg = 0, sb = 0, n = 0;
      const x0 = Math.floor(gx * cellW), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * cellW));
      const y0 = Math.floor(gy * cellH), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * cellH));
      for (let y = y0; y < y1 && y < img.height; y++) {
        for (let x = x0; x < x1 && x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          const a = img.data[i + 3] / 255;
          sr += img.data[i] * a; sg += img.data[i + 1] * a; sb += img.data[i + 2] * a; n += a;
        }
      }
      const idx = (gy * GRID + gx) * 3;
      if (n > 0) { out[idx] = sr / n / 255; out[idx + 1] = sg / n / 255; out[idx + 2] = sb / n / 255; }
    }
  }
  return out;
}

export interface ProvenanceResult { match: boolean; distance: number; }

export function perceptualMatch(crop: RGBA, ref: RGBA, epsilon: number): ProvenanceResult {
  const a = toGrid(crop);
  const b = toGrid(ref);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  const distance = r6(sum / a.length); // mean abs diff, normalized 0..1
  return { match: distance <= epsilon, distance };
}
