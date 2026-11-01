import { colorsNamed, differenceCiede2000, hsl, nearest, oklch, rgb, wcagContrast } from "culori";
import { emit, listen } from "@tauri-apps/api/event";
import { isTauri } from "./env";
import { getRawSettings, setRawSetting } from "./settings";

/**
 * Color formatting, naming and contrast for picked colors (culori).
 * Step 1.4 builds the full converter on top of this.
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
