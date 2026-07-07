import { describe, it, expect } from "vitest";
import { deltaE2000, extractPalette, srgbToLab, type Rgb } from "../color";

describe("color math (deterministic)", () => {
  it("deltaE2000 of identical colors is 0", () => {
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 2.6772, -79.7751])).toBe(0);
  });

  it("deltaE2000 matches a known CIEDE2000 reference pair", () => {
    // Sharma et al. test data: expected ~2.0425
    const dE = deltaE2000([50.0, 2.6772, -79.7751], [50.0, 0.0, -82.7485]);
    expect(Math.abs(dE - 2.0425)).toBeLessThan(0.01);
  });

  it("srgbToLab is deterministic", () => {
    const a = srgbToLab([238, 81, 114]);
    const b = srgbToLab([238, 81, 114]);
    expect(a).toEqual(b);
  });

  it("extractPalette is deterministic for identical input", () => {
    const samples: Rgb[] = [];
    for (let i = 0; i < 500; i++) samples.push([(i * 7) % 256, (i * 13) % 256, (i * 31) % 256]);
    const p1 = extractPalette(samples, 6, 25, 4);
    const p2 = extractPalette(samples, 6, 25, 4);
    expect(p1).toEqual(p2);
  });
});
