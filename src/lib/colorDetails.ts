import { formatHex, hsl, hsv, interpolate, oklch, rgb } from "culori";
import { contrast, nearestName } from "./colors";
import { partners, type PairingId } from "./pairing";

/**
 * Everything the color details page, the toolbar card and the pick session
 * bar show about one color: its values in every common notation, a short
 * description, tints, shades and harmonies. Pure, so it is tested directly.
 */
export interface ValueRow {
  label: string;
  value: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
const deg = (h: number | undefined) => Math.round(h ?? 0) % 360;

export function normalizeHex(hex: string): string {
  return (formatHex(hex) ?? "#000000").toUpperCase();
}

/** Naive device-independent CMYK (same formula as the Converter), whole percents. */
export function cmyk(hex: string): [number, number, number, number] {
  const c = rgb(hex);
  if (!c) return [0, 0, 0, 100];
  const k = 1 - Math.max(c.r, c.g, c.b);
  if (k >= 1) return [0, 0, 0, 100];
  const f = (v: number) => Math.round(((1 - v - k) / (1 - k)) * 100);
  return [f(c.r), f(c.g), f(c.b), Math.round(k * 100)];
}

export type ValueSet = "quick" | "full";

/**
 * Values for copying. "quick" is the hover card (HEX, RGB, RGBA, HSL, HSB);
 * "full" adds CMYK and OKLCH for the details page.
 */
export function valueRows(hex: string, set: ValueSet = "quick"): ValueRow[] {
  const h = normalizeHex(hex);
  const c = rgb(h)!;
  const r = byte(c.r);
  const g = byte(c.g);
  const b = byte(c.b);
  const l = hsl(h)!;
  const v = hsv(h)!;
  const rows: ValueRow[] = [
    { label: "HEX", value: h },
    { label: "RGB", value: `rgb(${r}, ${g}, ${b})` },
    { label: "RGBA", value: `rgba(${r}, ${g}, ${b}, 1)` },
    { label: "HSL", value: `hsl(${deg(l.h)}, ${pct(l.s)}, ${pct(l.l)})` },
    { label: "HSB", value: `hsb(${deg(v.h)}, ${pct(v.s)}, ${pct(v.v)})` },
  ];
  if (set === "full") {
    const [cc, mm, yy, kk] = cmyk(h);
    const o = oklch(h)!;
    rows.push(
      { label: "CMYK", value: `cmyk(${cc}%, ${mm}%, ${yy}%, ${kk}%)` },
      { label: "OKLCH", value: `oklch(${(o.l * 100).toFixed(1)}% ${o.c.toFixed(3)} ${(o.h ?? 0).toFixed(1)})` },
    );
  }
  return rows;
}

export interface ColorDescription {
  /** Nearest CSS color name, "≈" when it is not exact. */
  name: string;
  exact: boolean;
  hue: string;
  tone: "Light" | "Mid" | "Dark";
  vividness: "Neutral" | "Muted" | "Vivid";
  /** Black or white, whichever text reads better on the color. */
  bestText: "Black" | "White";
  bestRatio: number;
  bestLevel: string;
  about: string;
}

/** Plain hue names by OKLCH hue angle (centers), for the tags and the description. */
const HUES: [string, number][] = [
  ["Red", 25],
  ["Orange", 55],
  ["Yellow", 100],
  ["Green", 145],
  ["Teal", 185],
  ["Cyan", 215],
  ["Blue", 265],
  ["Purple", 310],
  ["Pink", 350],
];

export function hueName(h: number): string {
  const dist = (a: number) => Math.min(Math.abs(a - h), 360 - Math.abs(a - h));
  return HUES.reduce((best, x) => (dist(x[1]) < dist(best[1]) ? x : best))[0];
}

export function describe(hex: string): ColorDescription {
  const h = normalizeHex(hex);
  const o = oklch(h)!;
  const tone = o.l >= 0.8 ? "Light" : o.l < 0.45 ? "Dark" : "Mid";
  // sRGB has little room for chroma near white and black, so the limits
  // shrink there (a pale blue like #F0F6FC is still blue, not gray).
  const room = Math.max(0.15, Math.min(1, 4 * Math.min(o.l, 1 - o.l)));
  const vividness = o.c < 0.02 * room ? "Neutral" : o.c < 0.08 * room ? "Muted" : "Vivid";
  const hue = vividness === "Neutral" || o.h === undefined ? "Gray" : hueName(o.h);
  const nn = nearestName(h);
  const exact = nn.deltaE < 1;
  const onWhite = contrast("#000000", h);
  const onBlack = contrast("#FFFFFF", h);
  const black = onWhite.ratio >= onBlack.ratio;
  const best = black ? onWhite : onBlack;
  const rows = valueRows(h);
  const rgbText = rows[1].value.replace(/^rgb\(|\)$/g, "");
  const hslText = rows[3].value.replace(/^hsl\(|\)$/g, "");
  const kind = [tone === "Mid" ? "" : tone.toLowerCase(), vividness === "Neutral" ? "neutral" : vividness.toLowerCase(), vividness === "Neutral" ? "gray" : hue.toLowerCase()]
    .filter(Boolean)
    .join(" ");
  const about =
    `${h} is a ${kind}${exact ? `, the CSS color ${nn.name}` : `, close to the CSS color ${nn.name}`}. ` +
    `Its RGB value is ${rgbText} and its HSL value is ${hslText}. ` +
    `${black ? "Black" : "White"} text reads best on it, at a contrast ratio of ${best.ratio.toFixed(2)}:1 (WCAG ${best.level}).`;
  return {
    name: nn.name,
    exact,
    hue,
    tone,
    vividness,
    bestText: black ? "Black" : "White",
    bestRatio: best.ratio,
    bestLevel: best.level,
    about,
  };
}

/**
 * `count` steps from the color towards white (tints) or black (shades),
 * mixed in OKLab so the hue holds. The color itself is the first step.
 */
export function mixSteps(hex: string, towards: "white" | "black", count = 10): string[] {
  const h = normalizeHex(hex);
  const mix = interpolate([h, towards === "white" ? "#FFFFFF" : "#000000"], "oklab");
  // Stop short of pure white or black, which every color would share.
  const end = towards === "white" ? 0.92 : 0.88;
  return Array.from({ length: count }, (_, i) => normalizeHex(formatHex(mix((i / (count - 1)) * end))!));
}

export interface Harmony {
  id: PairingId;
  label: string;
  colors: string[];
}

const HARMONY_IDS: { id: PairingId; label: string }[] = [
  { id: "complementary", label: "Complementary" },
  { id: "analogous", label: "Analogous" },
  { id: "triadic", label: "Triadic" },
  { id: "split", label: "Split complementary" },
];

/** Partners on the OKLCH wheel (Color pairing's default); the base color comes first. */
export function harmonies(hex: string): Harmony[] {
  const h = normalizeHex(hex);
  return HARMONY_IDS.map(({ id, label }) => ({
    id,
    label,
    colors: [h, ...partners(h, id, "oklch").filter((p) => !p.base).map((p) => p.hex.toUpperCase())],
  }));
}

// ---------------------------------------------------------------- handoffs

/** `#/color/5B6CFF`: the hash route of the details page for a color. */
export function colorRoute(hex: string): string {
  return `color/${normalizeHex(hex).slice(1)}`;
}

/** The color in a `color/<hex>` route argument, or null. */
export function colorFromRoute(arg: string | undefined): string | null {
  return arg && /^[0-9a-f]{6}$/i.test(arg) ? `#${arg.toUpperCase()}` : null;
}

const set = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

/** Pages that remember their last input start from this color next time they open. */
export function seedScales(hex: string): void {
  set("huetype.scales.last", normalizeHex(hex));
}

export function seedPairing(hex: string): void {
  set("huetype.pairing.last", normalizeHex(hex));
}

/** Contrast page: the color as background with its best text color. */
export function seedContrast(hex: string): void {
  const h = normalizeHex(hex);
  set("huetype.contrast", JSON.stringify({ text: describe(h).bestText === "Black" ? "#000000" : "#FFFFFF", background: h }));
}

const PALETTE_SEED = "huetype.palettes.seed";

/** Palettes: start a new palette with this color locked (read once). */
export function seedPalette(hex: string): void {
  set(PALETTE_SEED, normalizeHex(hex));
}

export function takePaletteSeed(): string | null {
  try {
    const v = localStorage.getItem(PALETTE_SEED);
    localStorage.removeItem(PALETTE_SEED);
    return v && /^#[0-9A-F]{6}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
