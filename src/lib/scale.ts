import { clampChroma, formatHex, oklch } from "culori";
import { formatColor } from "./colors";

/**
 * Tints and shades from 50 to 950 in OKLCH. Lightness and relative chroma
 * per step follow the shape of Tailwind's palettes, so scales made here sit
 * well next to theirs. The base color is kept exactly at the step whose
 * lightness is closest; the steps around it are eased towards it.
 */
export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Step = (typeof STEPS)[number];

/** Target OKLCH lightness per step. */
const LIGHTNESS = [0.971, 0.936, 0.885, 0.808, 0.704, 0.637, 0.577, 0.505, 0.444, 0.396, 0.258];
/** Chroma per step relative to the most colorful step (600). */
const CHROMA = [0.05, 0.13, 0.26, 0.47, 0.78, 0.97, 1, 0.87, 0.72, 0.58, 0.38];
/** No sRGB color has more OKLCH chroma than about this; caps pale bases. */
const MAX_PEAK = 0.32;

export interface ScaleStep {
  step: Step;
  hex: string;
  l: number;
  c: number;
  h: number;
  /** The step that holds the base color, unchanged. */
  base: boolean;
}

const LAST = STEPS.length - 1;

/** Index of the step whose target lightness is nearest `l`. */
export function nearestStep(l: number): number {
  let best = 0;
  LIGHTNESS.forEach((t, i) => {
    if (Math.abs(t - l) < Math.abs(LIGHTNESS[best] - l)) best = i;
  });
  return best;
}

/** The 11-step scale around `hex` (any sRGB hex). */
export function makeScale(hex: string): ScaleStep[] {
  const base = oklch(hex);
  if (!base) throw new Error(`Not a color: ${hex}`);
  const bl = base.l;
  const bc = base.c ?? 0;
  const h = base.h ?? 0;
  const k = nearestStep(bl);
  const delta = bl - LIGHTNESS[k];
  const peak = Math.min(MAX_PEAK, bc / CHROMA[k]);

  return STEPS.map((step, i) => {
    if (i === k) return { step, hex: formatHex(base).toUpperCase(), l: bl, c: bc, h, base: true };
    // Shift lightness by the base's offset, fading out towards both ends.
    const w = i < k ? i / k : (LAST - i) / (LAST - k);
    const l = LIGHTNESS[i] + delta * w;
    const mapped = clampChroma({ mode: "oklch", l, c: peak * CHROMA[i], h: h + hueDrift(h, i, k) }, "oklch");
    const out = formatHex(mapped).toUpperCase();
    const back = oklch(out)!;
    return { step, hex: out, l: back.l, c: back.c ?? 0, h: back.h ?? h, base: false };
  });
}

/**
 * Yellows turn olive when darkened at a fixed hue, so (as Tailwind's yellow
 * and amber do) darker steps lean towards orange and lighter ones towards
 * lemon. Other hues keep theirs.
 */
function hueDrift(h: number, i: number, k: number): number {
  if (h < 50 || h > 115) return 0;
  // Full strength in the middle of the yellow band, fading at its edges.
  const strength = 1 - Math.abs(h - 85) / 35;
  const away = i > k ? -(i - k) / (LAST - k) * 22 : ((k - i) / k) * 6;
  return Math.max(0, strength) * away;
}

/** Tailwind-style hue family for a color, used as the default scale name. */
const FAMILIES: [string, number][] = [
  ["red", 25],
  ["orange", 47],
  ["amber", 70],
  ["yellow", 86],
  ["lime", 131],
  ["green", 150],
  ["emerald", 163],
  ["teal", 182],
  ["cyan", 215],
  ["sky", 237],
  ["blue", 260],
  ["indigo", 277],
  ["violet", 293],
  ["purple", 304],
  ["fuchsia", 322],
  ["pink", 354],
  ["rose", 12],
];

export function hueFamily(hex: string): string {
  const c = oklch(hex);
  if (!c || (c.c ?? 0) < 0.03 || c.h === undefined) return "gray";
  const h = c.h;
  const dist = (a: number) => Math.min(Math.abs(a - h), 360 - Math.abs(a - h));
  return FAMILIES.reduce((best, f) => (dist(f[1]) < dist(best[1]) ? f : best))[0];
}

/* Export */

export type ScaleExport = "css" | "tw4" | "tw3" | "json";
export type ScaleValue = "hex" | "oklch";

export const SCALE_EXPORTS: { id: ScaleExport; label: string }[] = [
  { id: "css", label: "CSS variables" },
  { id: "tw4", label: "Tailwind v4 (@theme)" },
  { id: "tw3", label: "Tailwind v3 (config)" },
  { id: "json", label: "JSON" },
];

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "color";
}

export function exportScale(scale: ScaleStep[], format: ScaleExport, name: string, value: ScaleValue = "hex"): string {
  const s = slug(name);
  const v = (st: ScaleStep) => formatColor(st.hex, value);
  switch (format) {
    case "css":
      return `:root {\n${scale.map((st) => `  --${s}-${st.step}: ${v(st)};`).join("\n")}\n}`;
    case "tw4":
      return `@theme {\n${scale.map((st) => `  --color-${s}-${st.step}: ${v(st)};`).join("\n")}\n}`;
    case "tw3": {
      const key = /^[a-z_$][a-z0-9_$]*$/i.test(s) ? s : `'${s}'`;
      return `${key}: {\n${scale.map((st) => `  ${st.step}: '${v(st)}',`).join("\n")}\n},`;
    }
    case "json":
      return JSON.stringify({ [s]: Object.fromEntries(scale.map((st) => [st.step, v(st)])) }, null, 2);
  }
}
