// Image decoding + deterministic sampling. Uses pngjs (pure JS) — raw RGBA bytes,
// no resampling on decode, so identical files yield identical pixels.

import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import type { RGBA } from "./types";
import type { Rgb } from "./color";

export function decodePngToRGBA(input: string | Buffer): RGBA {
  const buf = typeof input === "string" ? readFileSync(input) : input;
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

/** Construct an RGBA image from raw values (used by tests for synthetic crops). */
export function makeRGBA(width: number, height: number, data: Uint8Array): RGBA {
  return { width, height, data };
}

/**
 * Deterministic opaque RGB samples. Strides pixels so the sampled grid never
 * exceeds maxPx in either dimension; includes only pixels with alpha > 200.
 */
export function opaqueSamples(img: RGBA, maxPx: number): Rgb[] {
  const strideX = Math.max(1, Math.ceil(img.width / maxPx));
  const strideY = Math.max(1, Math.ceil(img.height / maxPx));
  const out: Rgb[] = [];
  for (let y = 0; y < img.height; y += strideY) {
    for (let x = 0; x < img.width; x += strideX) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] > 200) out.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
    }
  }
  return out;
}
