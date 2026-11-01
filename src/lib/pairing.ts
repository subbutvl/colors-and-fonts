import { clampChroma, formatHex, hsl, oklch } from "culori";

/**
 * Color pairing: partners for one base color by hue relationship. The wheel
 * is OKLCH by default (partners keep the base's perceived lightness and
 * chroma) or classic HSL (the familiar "red's complement is cyan").
 */
export type Wheel = "oklch" | "hsl";

export type PairingId = "complementary" | "analogous" | "split" | "triadic" | "square" | "rectangle" | "monochromatic";

export interface Pairing {
  id: PairingId;
  label: string;
  blurb: string;
  /** Hue offsets in degrees, base first (monochromatic varies lightness instead). */
  offsets: number[];
}

export const PAIRINGS: Pairing[] = [
  { id: "complementary", label: "Complementary", blurb: "Opposite on the wheel: the strongest contrast of hue.", offsets: [0, 180] },
  { id: "analogous", label: "Analogous", blurb: "Neighbours on the wheel: calm and cohesive.", offsets: [-30, 0, 30] },
  { id: "split", label: "Split complementary", blurb: "The two neighbours of the complement: contrast with less tension.", offsets: [0, 150, 210] },
  { id: "triadic", label: "Triadic", blurb: "Three hues evenly spaced: lively and balanced.", offsets: [0, 120, 240] },
  { id: "square", label: "Square", blurb: "Four hues evenly spaced: rich, best with one dominant color.", offsets: [0, 90, 180, 270] },
  { id: "rectangle", label: "Rectangle", blurb: "Two complementary pairs: varied yet anchored.", offsets: [0, 60, 180, 240] },
  { id: "monochromatic", label: "Monochromatic", blurb: "One hue in several lightnesses: safe and elegant.", offsets: [0, 0, 0, 0, 0] },
];

/** Below this OKLCH chroma a color reads as gray and has no useful hue. */
export const GRAY_LIMIT = 0.02;

const wrap = (h: number) => ((h % 360) + 360) % 360;
const up = (s: string) => s.toUpperCase();

export interface Partner {
  hex: string;
  /** Hue on the chosen wheel, degrees (undefined for grays). */
  hue: number | undefined;
  base: boolean;
}

/** Monochromatic set: five lightnesses this far apart in total, within these bounds. */
const MONO_SPAN = 0.54;
const MONO_MIN = 0.15;
const MONO_MAX = 0.97;

/**
 * Five evenly spaced lightnesses around `l`, kept inside the bounds by
 * sliding the window (so near-black and near-white bases still get four
 * distinct partners, all on one side). The step nearest `l` is the base.
 */
export function monoLightness(l: number): { values: number[]; baseIndex: number } {
  let lo = Math.max(MONO_MIN, l - 0.3);
  let hi = lo + MONO_SPAN;
  if (hi > MONO_MAX) {
    hi = MONO_MAX;
    lo = hi - MONO_SPAN;
  }
  const values = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  let baseIndex = 0;
  values.forEach((v, i) => {
    if (Math.abs(v - l) < Math.abs(values[baseIndex] - l)) baseIndex = i;
  });
  values[baseIndex] = l;
  return { values, baseIndex };
}

export function isGray(hex: string): boolean {
  return (oklch(hex)?.c ?? 0) < GRAY_LIMIT;
}

/** Hue of `hex` on the given wheel. */
export function hueOf(hex: string, wheel: Wheel): number | undefined {
  return wheel === "hsl" ? hsl(hex)?.h : oklch(hex)?.h;
}

export function partners(hex: string, id: PairingId, wheel: Wheel = "oklch"): Partner[] {
  const pairing = PAIRINGS.find((p) => p.id === id)!;
  const baseHex = up(formatHex(hex)!);
  const o = oklch(baseHex)!;

  if (id === "monochromatic") {
    const { values, baseIndex } = monoLightness(o.l);
    return values.map((l, i) => {
      if (i === baseIndex) return { hex: baseHex, hue: hueOf(baseHex, wheel), base: true };
      // Lightnesses far from the base carry less chroma.
      const c = (o.c ?? 0) * (1 - Math.min(0.6, Math.abs(l - o.l) * 1.4));
      const out = up(formatHex(clampChroma({ mode: "oklch", l, c, h: o.h }, "oklch")));
      return { hex: out, hue: hueOf(out, wheel), base: false };
    });
  }

  return pairing.offsets.map((d) => {
    if (d === 0) return { hex: baseHex, hue: hueOf(baseHex, wheel), base: true };
    let out: string;
    if (wheel === "hsl") {
      const h = hsl(baseHex)!;
      out = up(formatHex({ ...h, h: wrap((h.h ?? 0) + d) }));
    } else {
      out = up(formatHex(clampChroma({ ...o, h: wrap((o.h ?? 0) + d) }, "oklch")));
    }
    return { hex: out, hue: hueOf(out, wheel), base: false };
  });
}
