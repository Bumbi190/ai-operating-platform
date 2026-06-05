// Deterministic color math: sRGB->Lab, CIEDE2000, and a fully deterministic
// k-means palette extractor (no RNG, stable tie-breaks). Pure TS, no deps.

export type Lab = [number, number, number];
export type Rgb = [number, number, number];

const round = (n: number, d = 6): number => {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
};

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function srgbToLab(rgb: Rgb): Lab {
  // sRGB -> linear
  const lin = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  // linear RGB -> XYZ (D65)
  const x = lin[0] * 0.4124564 + lin[1] * 0.3575761 + lin[2] * 0.1804375;
  const y = lin[0] * 0.2126729 + lin[1] * 0.7151522 + lin[2] * 0.072175;
  const z = lin[0] * 0.0193339 + lin[1] * 0.119192 + lin[2] * 0.9503041;
  // XYZ -> Lab (D65 reference white)
  const xr = x / 0.95047, yr = y / 1.0, zr = z / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(xr), fy = f(yr), fz = f(zr);
  return [round(116 * fy - 16), round(500 * (fx - fy)), round(200 * (fy - fz))];
}

/** CIEDE2000 color difference. */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const avgLp = (L1 + L2) / 2;
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);
  const avgCp = (C1p + C2p) / 2;
  const h1p = hp(b1, a1p);
  const h2p = hp(b2, a2p);
  let deltahp = 0;
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) deltahp = diff;
    else deltahp = diff > 180 ? diff - 360 : diff + 360;
  }
  const deltaLp = L2 - L1;
  const deltaCp = C2p - C1p;
  const deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(deltahp) / 2);
  let avghp = 0;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) avghp = (h1p + h2p) / 2;
    else avghp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  } else avghp = h1p + h2p;
  const T = 1 - 0.17 * Math.cos(rad(avghp - 30)) + 0.24 * Math.cos(rad(2 * avghp)) +
    0.32 * Math.cos(rad(3 * avghp + 6)) - 0.2 * Math.cos(rad(4 * avghp - 63));
  const deltaTheta = 30 * Math.exp(-Math.pow((avghp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2));
  const Sc = 1 + 0.045 * avgCp;
  const Sh = 1 + 0.015 * avgCp * T;
  const Rt = -Math.sin(rad(2 * deltaTheta)) * Rc;
  const dE = Math.sqrt(
    Math.pow(deltaLp / Sl, 2) + Math.pow(deltaCp / Sc, 2) + Math.pow(deltaHp / Sh, 2) +
    Rt * (deltaCp / Sc) * (deltaHp / Sh)
  );
  return round(dE, 4);
}
const rad = (deg: number) => (deg * Math.PI) / 180;
function hp(b: number, ap: number): number {
  if (b === 0 && ap === 0) return 0;
  let h = (Math.atan2(b, ap) * 180) / Math.PI;
  if (h < 0) h += 360;
  return h;
}

export interface Cluster { rgb: Rgb; share: number; }

/**
 * Deterministic k-means on opaque RGB samples.
 * Init: quantize to a grid, take the k most frequent buckets (stable). No RNG.
 */
export function extractPalette(samples: Rgb[], k: number, maxIter: number, quantizeBits: number): Cluster[] {
  if (samples.length === 0) return [];
  const shift = 8 - quantizeBits;
  // bucket frequency
  const freq = new Map<number, number>();
  for (const [r, g, b] of samples) {
    const key = ((r >> shift) << (2 * quantizeBits)) | ((g >> shift) << quantizeBits) | (b >> shift);
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  // sort buckets: count desc, then key asc (stable, deterministic)
  const buckets = [...freq.entries()].sort((x, y) => (y[1] - x[1]) || (x[0] - y[0]));
  const kk = Math.min(k, buckets.length);
  const centers: Rgb[] = [];
  for (let i = 0; i < kk; i++) {
    const key = buckets[i][0];
    const r = ((key >> (2 * quantizeBits)) & ((1 << quantizeBits) - 1)) << shift;
    const g = ((key >> quantizeBits) & ((1 << quantizeBits) - 1)) << shift;
    const b = (key & ((1 << quantizeBits) - 1)) << shift;
    centers.push([r + (1 << (shift - 1) || 0), g + (1 << (shift - 1) || 0), b + (1 << (shift - 1) || 0)]);
  }
  let assign = new Int32Array(samples.length).fill(-1);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    // assignment (tie-break: lowest center index)
    for (let i = 0; i < samples.length; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = sqDist(samples[i], centers[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (assign[i] !== best) { assign[i] = best; changed = true; }
    }
    // update centers = mean of assigned (empty -> keep previous)
    const sum = centers.map(() => [0, 0, 0]);
    const cnt = new Array(centers.length).fill(0);
    for (let i = 0; i < samples.length; i++) {
      const c = assign[i];
      sum[c][0] += samples[i][0]; sum[c][1] += samples[i][1]; sum[c][2] += samples[i][2]; cnt[c]++;
    }
    for (let c = 0; c < centers.length; c++) {
      if (cnt[c] > 0) centers[c] = [Math.round(sum[c][0] / cnt[c]), Math.round(sum[c][1] / cnt[c]), Math.round(sum[c][2] / cnt[c])];
    }
    if (!changed) break;
  }
  // final shares
  const cnt = new Array(centers.length).fill(0);
  for (let i = 0; i < samples.length; i++) cnt[assign[i]]++;
  const total = samples.length;
  const clusters: Cluster[] = centers.map((rgb, c) => ({ rgb, share: round(cnt[c] / total, 6) }));
  // sort by share desc, tie-break by rgb asc (deterministic)
  clusters.sort((x, y) => (y.share - x.share) || (x.rgb[0] - y.rgb[0]) || (x.rgb[1] - y.rgb[1]) || (x.rgb[2] - y.rgb[2]));
  return clusters.filter((c) => c.share > 0);
}

function sqDist(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/** Minimum CIEDE2000 between a target color and a set of cluster colors. */
export function nearestDeltaE(targetLab: Lab, clusters: Cluster[]): number {
  let min = Infinity;
  for (const cl of clusters) {
    const d = deltaE2000(targetLab, srgbToLab(cl.rgb));
    if (d < min) min = d;
  }
  return min === Infinity ? Infinity : round(min, 4);
}
