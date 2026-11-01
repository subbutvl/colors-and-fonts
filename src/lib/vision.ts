import { differenceCiede2000, formatHex, rgb, wcagContrast } from "culori";

/**
 * Color vision simulation. Dichromacy uses the Machado, Oliveira and
 * Fernandes (2009) matrices at full severity, applied in linear sRGB;
 * partial severity (anomalous trichromacy) blends the matrix with identity,
 * a close approximation of their per-severity tables. Situational cases are
 * simple, documented approximations.
 */
export type VisionId =
  | "typical"
  | "protan"
  | "deutan"
  | "tritan"
  | "achroma"
  | "dim"
  | "glare"
  | "night"
  | "print";

export interface Vision {
  id: VisionId;
  label: string;
  note: string;
  kind: "typical" | "cvd" | "situation";
  /** Whether the severity slider applies. */
  severity: boolean;
}

export const VISIONS: Vision[] = [
  { id: "typical", label: "Typical vision", note: "As designed.", kind: "typical", severity: false },
  { id: "deutan", label: "Deuteranopia / deuteranomaly", note: "Weak or missing green cones. The most common type: about 6% of men.", kind: "cvd", severity: true },
  { id: "protan", label: "Protanopia / protanomaly", note: "Weak or missing red cones; reds also look darker. About 2% of men.", kind: "cvd", severity: true },
  { id: "tritan", label: "Tritanopia / tritanomaly", note: "Weak or missing blue cones. Rare, and affects men and women alike.", kind: "cvd", severity: true },
  { id: "achroma", label: "Achromatopsia", note: "No color at all, only lightness. Very rare.", kind: "cvd", severity: false },
  { id: "dim", label: "Dim, low-contrast screen", note: "Brightness turned down or a cheap panel: contrast halves.", kind: "situation", severity: false },
  { id: "glare", label: "Sunlight glare", note: "Reflected light washes everything towards white.", kind: "situation", severity: false },
  { id: "night", label: "Night light filter", note: "Blue light cut, as with Windows Night light.", kind: "situation", severity: false },
  { id: "print", label: "Grayscale print", note: "Printed or photocopied in black and white.", kind: "situation", severity: false },
];

type Mat = [number, number, number, number, number, number, number, number, number];

const MACHADO: Record<"protan" | "deutan" | "tritan", Mat> = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type Lin = [number, number, number];

function linear(hex: string): Lin {
  const c = rgb(hex);
  if (!c) throw new Error(`Not a color: ${hex}`);
  return [toLinear(c.r), toLinear(c.g), toLinear(c.b)];
}

function fromLinear([r, g, b]: Lin): string {
  return formatHex({ mode: "rgb", r: toGamma(clamp01(r)), g: toGamma(clamp01(g)), b: toGamma(clamp01(b)) }).toUpperCase();
}

const luminance = ([r, g, b]: Lin) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function applyMatrix(m: Mat, [r, g, b]: Lin, severity: number): Lin {
  const s = clamp01(severity);
  const out: Lin = [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
  return [r + (out[0] - r) * s, g + (out[1] - g) * s, b + (out[2] - b) * s];
}

/** `hex` as seen with the given vision. `severity` (0 to 1) applies to protan, deutan and tritan. */
export function simulate(hex: string, id: VisionId, severity = 1): string {
  const lin = linear(hex);
  switch (id) {
    case "typical":
      return fromLinear(lin);
    case "protan":
    case "deutan":
    case "tritan":
      return fromLinear(applyMatrix(MACHADO[id], lin, severity));
    case "achroma":
    case "print": {
      const y = luminance(lin);
      return fromLinear([y, y, y]);
    }
    case "dim": {
      // Half the contrast around mid gray, in perceptual (gamma) space.
      const c = rgb(hex)!;
      const half = (v: number) => 0.5 + (v - 0.5) * 0.5;
      return formatHex({ mode: "rgb", r: half(c.r), g: half(c.g), b: half(c.b) }).toUpperCase();
    }
    case "glare":
      // A veil of reflected white light added on top.
      return fromLinear(lin.map((v) => v * 0.65 + 0.35) as Lin);
    case "night":
      // Roughly a 3400 K white point: blue cut most, green a little.
      return fromLinear([lin[0], lin[1] * 0.82, lin[2] * 0.45]);
  }
}

const deltaE = differenceCiede2000();

export type Distinction = "same" | "hard" | "ok";

/**
 * How easy two colors are to tell apart, by CIEDE2000: under 5 they look
 * the same, under 11 they are hard to tell apart (a common threshold for
 * categorical colors, e.g. chart series), otherwise distinct.
 */
export function distinction(a: string, b: string): { deltaE: number; level: Distinction } {
  const d = deltaE(a, b);
  return { deltaE: d, level: d < 5 ? "same" : d < 11 ? "hard" : "ok" };
}

export interface Collision {
  /** Indexes into the color list. */
  a: number;
  b: number;
  deltaE: number;
  level: Exclude<Distinction, "ok">;
}

/** Pairs of colors that are hard to tell apart once simulated. */
export function collisions(simulated: string[]): Collision[] {
  const out: Collision[] = [];
  for (let a = 0; a < simulated.length; a++) {
    for (let b = a + 1; b < simulated.length; b++) {
      const d = distinction(simulated[a], simulated[b]);
      if (d.level !== "ok") out.push({ a, b, deltaE: d.deltaE, level: d.level });
    }
  }
  return out.sort((x, y) => x.deltaE - y.deltaE);
}

export const contrastRatio = (fg: string, bg: string) => wcagContrast(fg, bg);

/** Split a typed list ("#f00, rgb(0 0 255) teal") into color strings; separators inside parentheses are kept. */
export function splitColors(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && /[\s,;]/.test(ch)) {
      if (cur) parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}
