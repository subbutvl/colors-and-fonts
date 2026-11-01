import {
  clampChroma,
  colorsNamed,
  differenceCiede2000,
  displayable,
  formatHex,
  formatHex8,
  hsl,
  hsv,
  hwb,
  lab,
  lch,
  nearest,
  oklab,
  oklch,
  p3,
  parse,
  rgb,
  wcagContrast,
  type Color,
} from "culori";
import { emit, listen } from "@tauri-apps/api/event";
import { isTauri } from "./env";
import { getRawSettings, setRawSetting } from "./settings";

/**
 * Color formatting, naming and contrast for picked colors (culori).
 * Also the engine behind the Converter and HTML color names pages.
 */
export type ColorFormat = "hex" | "rgb" | "hsl" | "oklch";
export const FORMATS: ColorFormat[] = ["hex", "rgb", "hsl", "oklch"];
export const FORMAT_LABELS: Record<ColorFormat, string> = { hex: "HEX", rgb: "RGB", hsl: "HSL", oklch: "OKLCH" };

const round = (v: number, digits = 0) => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

/** `#5B6CFF` in the given format, as you would paste it into CSS. */
export function formatColor(hex: string, format: ColorFormat): string {
  switch (format) {
    case "hex":
      return hex.toUpperCase();
    case "rgb": {
      const c = rgb(hex);
      if (!c) return hex;
      return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
    }
    case "hsl": {
      const c = hsl(hex);
      if (!c) return hex;
      return `hsl(${round(c.h ?? 0)}, ${round(c.s * 100)}%, ${round(c.l * 100)}%)`;
    }
    case "oklch": {
      const c = oklch(hex);
      if (!c) return hex;
      return `oklch(${round(c.l * 100, 1)}% ${round(c.c, 3)} ${round(c.h ?? 0, 1)})`;
    }
  }
}

const NAMED = Object.keys(colorsNamed) as (keyof typeof colorsNamed)[];
const namedHex = (name: keyof typeof colorsNamed) => "#" + colorsNamed[name].toString(16).padStart(6, "0");
const deltaE = differenceCiede2000();
const nearestNamed = nearest(NAMED, deltaE, namedHex);

export interface NearestName {
  /** CSS / HTML color keyword, e.g. `royalblue`. */
  name: string;
  hex: string;
  /** CIEDE2000 distance; under 1 is not noticeable. */
  deltaE: number;
}

/** Closest of the 148 CSS named colors. */
export function nearestName(hex: string): NearestName {
  const [name] = nearestNamed(hex, 1);
  const named = namedHex(name);
  return { name, hex: named.toUpperCase(), deltaE: deltaE(hex, named) };
}

export interface Contrast {
  ratio: number;
  /** WCAG 2.2: AA needs 4.5 for body text, 3 for large text. */
  level: "AAA" | "AA" | "AA large" | "Fail";
}

export function contrast(fg: string, bg: string): Contrast {
  const ratio = wcagContrast(fg, bg);
  const level = ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "Fail";
  return { ratio, level };
}

/* The copy format: chosen on the toolbar, used for every copy and the tray. */

const FORMAT_KEY = "picker.format";
/** Broadcast when the copy format changes (payload: format). */
export const FORMAT_EVENT = "huetype://format-changed";

export async function getCopyFormat(): Promise<ColorFormat> {
  try {
    const raw = (await getRawSettings(FORMAT_KEY))[FORMAT_KEY];
    return FORMATS.includes(raw as ColorFormat) ? (raw as ColorFormat) : "hex";
  } catch {
    return "hex";
  }
}

export async function setCopyFormat(format: ColorFormat): Promise<void> {
  await setRawSetting(FORMAT_KEY, format);
  if (isTauri()) await emit(FORMAT_EVENT, format);
}

export function onCopyFormat(handler: (format: ColorFormat) => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let cancelled = false;
  listen<ColorFormat>(FORMAT_EVENT, (e) => handler(e.payload)).then((fn) => (cancelled ? fn() : (unlisten = fn)));
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** Copy text to the clipboard (works from unfocused windows too). */
export async function copyText(text: string): Promise<void> {
  if (isTauri()) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
  } else {
    await navigator.clipboard.writeText(text);
  }
}

/* Converter: read any color, write every format. */

/** Accepts anything CSS does, plus bare hex (`5b6cff`) and RGB triplets (`91, 108, 255`). */
export function parseColor(input: string): Color | undefined {
  const text = input.trim();
  if (!text) return undefined;
  const triplet = /^(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})$/.exec(text);
  if (triplet) {
    const [r, g, b] = triplet.slice(1).map(Number);
    if ([r, g, b].every((v) => v <= 255)) return { mode: "rgb", r: r / 255, g: g / 255, b: b / 255 };
  }
  return parse(text) ?? undefined;
}

export interface FormatRow {
  id: string;
  label: string;
  value: string;
  /** False for notations CSS cannot read (HSV, CMYK). */
  css: boolean;
}

export interface Conversion {
  /** sRGB hex of the color (gamut-mapped when outside sRGB). */
  hex: string;
  alpha: number;
  /** True when the input is outside sRGB; sRGB-based rows are gamut-mapped. */
  outOfGamut: boolean;
  rows: FormatRow[];
}

const pct = (v: number, digits = 1) => `${round(v * 100, digits)}%`;
const num = (v: number | undefined, digits: number) => String(round(v ?? 0, digits));

export function convert(color: Color): Conversion {
  const alpha = color.alpha ?? 1;
  const outOfGamut = !displayable(color);
  // sRGB formats use the color mapped into sRGB by reducing chroma (keeps hue and lightness).
  const srgb = rgb(outOfGamut ? clampChroma(color, "oklch") : color);
  const solid = { ...srgb, alpha: undefined };
  const a = alpha < 1 ? ` / ${round(alpha, 3)}` : "";
  const r255 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const [r, g, b] = [r255(srgb.r), r255(srgb.g), r255(srgb.b)];
  const h = hsl(solid);
  const w = hwb(solid);
  const v = hsv(solid);
  const L = lab(color);
  const C = lch(color);
  const ok = oklab(color);
  const okc = oklch(color);
  const P = p3(color);
  const k = 1 - Math.max(r, g, b) / 255;
  const cmy = (c: number) => (k >= 1 ? 0 : (1 - c / 255 - k) / (1 - k));

  const rows: FormatRow[] = [
    { id: "hex", label: "HEX", value: (alpha < 1 ? formatHex8(srgb) : formatHex(srgb)).toUpperCase(), css: true },
    {
      id: "rgb",
      label: "RGB",
      value: alpha < 1 ? `rgb(${r} ${g} ${b}${a})` : `rgb(${r}, ${g}, ${b})`,
      css: true,
    },
    {
      id: "hsl",
      label: "HSL",
      value:
        alpha < 1
          ? `hsl(${num(h.h, 1)} ${pct(h.s)} ${pct(h.l)}${a})`
          : `hsl(${num(h.h, 1)}, ${pct(h.s)}, ${pct(h.l)})`,
      css: true,
    },
    { id: "hwb", label: "HWB", value: `hwb(${num(w.h, 1)} ${pct(w.w)} ${pct(w.b)}${a})`, css: true },
    { id: "lab", label: "Lab", value: `lab(${num(L.l, 2)} ${num(L.a, 2)} ${num(L.b, 2)}${a})`, css: true },
    { id: "lch", label: "LCH", value: `lch(${num(C.l, 2)} ${num(C.c, 2)} ${num(C.h, 1)}${a})`, css: true },
    { id: "oklab", label: "OKLab", value: `oklab(${pct(ok.l)} ${num(ok.a, 4)} ${num(ok.b, 4)}${a})`, css: true },
    { id: "oklch", label: "OKLCH", value: `oklch(${pct(okc.l)} ${num(okc.c, 4)} ${num(okc.h, 1)}${a})`, css: true },
    {
      id: "p3",
      label: "Display P3",
      value: `color(display-p3 ${num(P.r, 4)} ${num(P.g, 4)} ${num(P.b, 4)}${a})`,
      css: true,
    },
    { id: "hsv", label: "HSV", value: `hsv(${num(v.h, 1)}, ${pct(v.s)}, ${pct(v.v)})`, css: false },
    {
      id: "cmyk",
      label: "CMYK",
      value: `cmyk(${pct(cmy(r), 0)}, ${pct(cmy(g), 0)}, ${pct(cmy(b), 0)}, ${pct(k, 0)})`,
      css: false,
    },
  ];
  return { hex: formatHex(srgb).toUpperCase(), alpha, outOfGamut, rows };
}

/* HTML / CSS named colors. */

export interface NamedColor {
  name: string;
  hex: string;
  /** OKLCH, for sorting. */
  l: number;
  c: number;
  h: number;
}

export const NAMED_COLORS: NamedColor[] = NAMED.map((name) => {
  const hex = namedHex(name).toUpperCase();
  const o = oklch(hex)!;
  return { name, hex, l: o.l, c: o.c, h: o.h ?? 0 };
});

/** Chroma below this reads as gray: hue sorting puts these last, light to dark. */
export const GRAY_CHROMA = 0.02;
