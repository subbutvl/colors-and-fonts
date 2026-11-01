import { clampChroma, formatHex, oklch, rgb, wcagContrast, type Color, type Oklch } from "culori";

/**
 * Text/background contrast: WCAG 2.2 ratio and APCA (the candidate method
 * for WCAG 3), plus "nearest passing color" suggestions.
 */

/**
 * `top` composited over the opaque `bottom` in sRGB, the way browsers draw a
 * translucent color. Contrast is only defined between opaque colors.
 */
export function flatten(top: Color | string, bottom: Color | string): string {
  const t = rgb(top);
  const b = rgb(bottom);
  if (!t || !b) return "#000000";
  const a = t.alpha ?? 1;
  const mix = (x: number, y: number) => x * a + y * (1 - a);
  return formatHex({ mode: "rgb", r: mix(t.r, b.r), g: mix(t.g, b.g), b: mix(t.b, b.b) }).toUpperCase();
}

/* WCAG 2.2 */

export interface WcagResult {
  ratio: number;
  /** 4.5:1 normal text, 3:1 large text (24px, or 18.66px bold) and UI. */
  aa: boolean;
  aaLarge: boolean;
  /** 7:1 normal text, 4.5:1 large text. */
  aaa: boolean;
  aaaLarge: boolean;
}

export function wcag(text: string, background: string): WcagResult {
  const ratio = wcagContrast(text, background);
  return { ratio, aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7, aaaLarge: ratio >= 4.5 };
}

/* APCA-W3 0.0.98G-4g (https://github.com/Myndex/apca-w3), text on background. */

const APCA = {
  mainTRC: 2.4,
  sRco: 0.2126729,
  sGco: 0.7151522,
  sBco: 0.072175,
  normBG: 0.56,
  normTXT: 0.57,
  revTXT: 0.62,
  revBG: 0.65,
  blkThrs: 0.022,
  blkClmp: 1.414,
  scaleBoW: 1.14,
  scaleWoB: 1.14,
  loBoWoffset: 0.027,
  loWoBoffset: 0.027,
  deltaYmin: 0.0005,
  loClip: 0.1,
};

/** Screen luminance Y as APCA defines it (simple 2.4 exponent, no linear toe). */
function apcaY(color: string): number {
  const c = rgb(color);
  if (!c) return 0;
  const ch = (v: number) => Math.min(1, Math.max(0, v)) ** APCA.mainTRC;
  return APCA.sRco * ch(c.r) + APCA.sGco * ch(c.g) + APCA.sBco * ch(c.b);
}

/** Lightness contrast Lc: about 0 to 106 for dark text on light, 0 to -108 for light on dark. */
export function apcaLc(text: string, background: string): number {
  const clamp = (y: number) => (y > APCA.blkThrs ? y : y + (APCA.blkThrs - y) ** APCA.blkClmp);
  const txtY = clamp(apcaY(text));
  const bgY = clamp(apcaY(background));
  if (Math.abs(bgY - txtY) < APCA.deltaYmin) return 0;
  if (bgY > txtY) {
    const sapc = (bgY ** APCA.normBG - txtY ** APCA.normTXT) * APCA.scaleBoW;
    return sapc < APCA.loClip ? 0 : (sapc - APCA.loBoWoffset) * 100;
  }
  const sapc = (bgY ** APCA.revBG - txtY ** APCA.revTXT) * APCA.scaleWoB;
  return sapc > -APCA.loClip ? 0 : (sapc + APCA.loWoBoffset) * 100;
}

/** What an |Lc| is good for (APCA "bronze" simple mode). */
export function apcaUse(lc: number): string {
  const v = Math.abs(lc);
  if (v >= 90) return "Preferred for body text";
  if (v >= 75) return "Body text (minimum)";
  if (v >= 60) return "Content text, not body columns";
  if (v >= 45) return "Large text and headlines";
  if (v >= 30) return "Placeholder, disabled text, spot text";
  if (v >= 15) return "Non-text only (dividers, outlines)";
  return "Not readable";
}

/* Suggestions */

export type Target =
  | { kind: "wcag"; ratio: number; label: string }
  | { kind: "apca"; lc: number; label: string };

export const TARGETS: Target[] = [
  { kind: "wcag", ratio: 4.5, label: "WCAG AA (4.5:1)" },
  { kind: "wcag", ratio: 7, label: "WCAG AAA (7:1)" },
  { kind: "wcag", ratio: 3, label: "WCAG AA large (3:1)" },
  { kind: "apca", lc: 75, label: "APCA Lc 75 (body)" },
  { kind: "apca", lc: 60, label: "APCA Lc 60 (content)" },
];

export function passes(text: string, background: string, target: Target): boolean {
  return target.kind === "wcag"
    ? wcagContrast(text, background) >= target.ratio
    : Math.abs(apcaLc(text, background)) >= target.lc;
}

export interface Suggestion {
  /** Which color was changed. */
  side: "text" | "background";
  /** Lighter or darker than the original. */
  direction: "lighter" | "darker";
  hex: string;
  /** OKLCH lightness change, in percentage points. */
  deltaL: number;
}

/** `color` with OKLCH lightness `l`, hue kept, chroma reduced only as needed to stay in sRGB. */
function withLightness(base: Oklch, l: number): string {
  return formatHex(clampChroma({ ...base, l }, "oklch")).toUpperCase();
}

/**
 * The closest colors that reach `target`, found by moving one color's OKLCH
 * lightness (keeping its hue) up or down. Returns up to two per side,
 * nearest first; none when the pair already passes.
 */
export function suggest(text: string, background: string, target: Target): Suggestion[] {
  if (passes(text, background, target)) return [];
  const out: Suggestion[] = [];
  for (const side of ["text", "background"] as const) {
    const moving = oklch(side === "text" ? text : background);
    if (!moving) continue;
    const fixed = side === "text" ? background : text;
    const test = (hex: string) => (side === "text" ? passes(hex, fixed, target) : passes(fixed, hex, target));
    for (const direction of ["lighter", "darker"] as const) {
      const end = direction === "lighter" ? 1 : 0;
      if (!test(withLightness(moving, end))) continue; // even white/black is not enough
      // Binary search the smallest lightness change that passes.
      let lo = moving.l;
      let hi = end;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (test(withLightness(moving, mid))) hi = mid;
        else lo = mid;
      }
      const hex = withLightness(moving, hi);
      out.push({ side, direction, hex, deltaL: Math.abs(hi - moving.l) * 100 });
    }
  }
  return out.sort((a, b) => a.deltaL - b.deltaL);
}
