import { clampChroma, formatHex, oklch } from "culori";

/**
 * Palette generation in OKLCH: perceptually even lightness and chroma, hue
 * relationships from classic color harmony. Pure and seedable for tests.
 */
export type Harmony =
  | "random"
  | "analogous"
  | "monochromatic"
  | "complementary"
  | "split"
  | "triadic"
  | "tetradic";

export const HARMONIES: { id: Harmony; label: string }[] = [
  { id: "random", label: "Random" },
  { id: "analogous", label: "Analogous" },
  { id: "monochromatic", label: "Monochromatic" },
  { id: "complementary", label: "Complementary" },
  { id: "split", label: "Split complementary" },
  { id: "triadic", label: "Triadic" },
  { id: "tetradic", label: "Tetradic" },
];

export const MIN_COLORS = 3;
export const MAX_COLORS = 8;

/** Returns numbers in [0, 1). */
export type Rand = () => number;

/** Small seedable generator (mulberry32) so tests are repeatable. */
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (h: number) => ((h % 360) + 360) % 360;
const between = (rand: Rand, lo: number, hi: number) => lo + rand() * (hi - lo);

function hex(l: number, c: number, h: number): string {
  return formatHex(clampChroma({ mode: "oklch", l, c, h: wrap(h) }, "oklch")).toUpperCase();
}

/** Hue offsets (degrees from the base hue) each harmony draws from. */
function hueOffsets(harmony: Harmony, count: number, rand: Rand): number[] {
  switch (harmony) {
    case "analogous": {
      const step = between(rand, 18, 32);
      return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step);
    }
    case "monochromatic":
      return Array.from({ length: count }, () => between(rand, -4, 4));
    case "complementary":
      return Array.from({ length: count }, (_, i) => (i % 2 ? 180 : 0) + between(rand, -8, 8));
    case "split":
      return Array.from({ length: count }, (_, i) => [0, 150, 210][i % 3] + between(rand, -6, 6));
    case "triadic":
      return Array.from({ length: count }, (_, i) => [0, 120, 240][i % 3] + between(rand, -6, 6));
    case "tetradic":
      return Array.from({ length: count }, (_, i) => [0, 90, 180, 270][i % 4] + between(rand, -6, 6));
    case "random": {
      // Golden-angle steps spread hues evenly without looking regular.
      const start = rand() * 360;
      return Array.from({ length: count }, (_, i) => start + i * 137.508 + between(rand, -10, 10));
    }
  }
}

export interface GenerateOptions {
  harmony: Harmony;
  count: number;
  /** Current palette; entries marked locked are kept as they are. */
  current?: { hex: string; locked: boolean }[];
  rand?: Rand;
}

/**
 * A new palette of `count` colors. Locked colors stay in place; the first
 * locked color (if any) sets the base hue and chroma so new colors fit it.
 */
export function generate({ harmony, count, current = [], rand = Math.random }: GenerateOptions): string[] {
  const n = Math.min(MAX_COLORS, Math.max(MIN_COLORS, Math.round(count)));
  const anchor = current.find((c) => c.locked);
  const a = anchor ? oklch(anchor.hex) : undefined;
  const baseH = a?.h ?? rand() * 360;
  const baseC = a && a.c > 0.02 ? a.c : between(rand, 0.09, 0.17);
  const offsets = hueOffsets(harmony, n, rand);

  // Lightness from dark to light across the palette, with some jitter, so a
  // palette always has usable contrast inside it.
  const lo = between(rand, 0.32, 0.45);
  const hi = between(rand, 0.82, 0.95);
  const order = harmony === "random" ? shuffle([...Array(n).keys()], rand) : [...Array(n).keys()];

  return Array.from({ length: n }, (_, i) => {
    const kept = current[i];
    if (kept?.locked) return kept.hex.toUpperCase();
    const t = n === 1 ? 0.5 : order[i] / (n - 1);
    const l = lo + (hi - lo) * t + between(rand, -0.03, 0.03);
    // Very light and very dark colors look best with less chroma.
    const c = baseC * (1 - 0.5 * Math.abs(t - 0.45)) * between(rand, 0.85, 1.15);
    return hex(l, c, baseH + offsets[i]);
  });
}

function shuffle<T>(list: T[], rand: Rand): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/* Export */

export type ExportFormat = "css" | "json" | "list";

export function exportPalette(colors: string[], format: ExportFormat, name = "palette"): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "palette";
  switch (format) {
    case "css":
      return `:root {\n${colors.map((c, i) => `  --${slug}-${i + 1}: ${c};`).join("\n")}\n}`;
    case "json":
      return JSON.stringify(colors);
    case "list":
      return colors.join(", ");
  }
}
