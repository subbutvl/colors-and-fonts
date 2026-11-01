import { formatHex, interpolate, parse } from "culori";

/**
 * Gradient model and CSS output for the Gradients section. Pure: no DOM, no
 * storage. Stops are hex colors at 0 to 100 percent. Colors are mixed in
 * the chosen space with CSS Color 4 `in <space>` syntax; the copied CSS also
 * gets an sRGB fallback line sampled from the same mix, so older engines
 * draw the same gradient.
 */
export type GradientType = "linear" | "radial" | "conic";
export type Interpolation = "srgb" | "oklab" | "oklch";
export type RadialShape = "circle" | "ellipse";

export interface Stop {
  color: string;
  /** Percent, 0 to 100. */
  pos: number;
}

export interface Gradient {
  type: GradientType;
  /** Linear: direction. Conic: start angle. Degrees, 0 to 359. */
  angle: number;
  /** Radial only. */
  shape: RadialShape;
  /** Radial and conic center, percent. */
  x: number;
  y: number;
  space: Interpolation;
  stops: Stop[];
}

export const GRADIENT_TYPES: { id: GradientType; label: string }[] = [
  { id: "linear", label: "Linear" },
  { id: "radial", label: "Radial" },
  { id: "conic", label: "Conic" },
];

export const SPACES: { id: Interpolation; label: string; hint: string }[] = [
  { id: "oklab", label: "OKLab", hint: "Even, no gray dip in the middle" },
  { id: "oklch", label: "OKLCH", hint: "Keeps colors saturated, goes around the hue wheel" },
  { id: "srgb", label: "sRGB", hint: "Classic CSS mix, can look muddy between opposites" },
];

export const MIN_STOPS = 2;
export const MAX_STOPS = 10;

export const DEFAULT_GRADIENT: Gradient = {
  type: "linear",
  angle: 135,
  shape: "circle",
  x: 50,
  y: 50,
  space: "oklab",
  stops: [
    { color: "#6366F1", pos: 0 },
    { color: "#EC4899", pos: 100 },
  ],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const normAngle = (a: number) => ((Math.round(a) % 360) + 360) % 360;

function normHex(c: string): string | null {
  const p = parse(c);
  return p ? formatHex(p).toUpperCase() : null;
}

/** A clean copy: stops sorted, positions and angles clamped, colors as hex, 2 to 10 stops. */
export function normalize(g: Gradient): Gradient {
  const stops = g.stops
    .map((s) => ({ color: normHex(s.color) ?? "#000000", pos: round(clamp(s.pos, 0, 100)) }))
    .sort((a, b) => a.pos - b.pos)
    .slice(0, MAX_STOPS);
  while (stops.length < MIN_STOPS) stops.push({ color: stops[stops.length - 1]?.color ?? "#000000", pos: 100 });
  return {
    type: g.type,
    angle: normAngle(g.angle),
    shape: g.shape === "ellipse" ? "ellipse" : "circle",
    x: round(clamp(g.x, 0, 100)),
    y: round(clamp(g.y, 0, 100)),
    space: g.space,
    stops,
  };
}

/** The color the gradient shows at `pos` percent, mixed in its space. */
export function colorAt(g: Gradient, pos: number): string {
  const stops = [...g.stops].sort((a, b) => a.pos - b.pos);
  if (pos <= stops[0].pos) return normHex(stops[0].color)!;
  const last = stops[stops.length - 1];
  if (pos >= last.pos) return normHex(last.color)!;
  const i = stops.findIndex((s) => s.pos >= pos);
  const a = stops[i - 1];
  const b = stops[i];
  const t = b.pos === a.pos ? 0 : (pos - a.pos) / (b.pos - a.pos);
  const mode = g.space === "srgb" ? "rgb" : g.space;
  const mix = interpolate([a.color, b.color], mode);
  return formatHex(mix(t))!.toUpperCase();
}

/**
 * A new stop in the middle of the widest gap, colored as the gradient is
 * there, so adding a stop does not change how it looks.
 */
export function addStop(g: Gradient, pos?: number): Gradient {
  if (g.stops.length >= MAX_STOPS) return g;
  const stops = [...g.stops].sort((a, b) => a.pos - b.pos);
  let at = pos;
  if (at === undefined) {
    let best = 0;
    at = 50;
    for (let i = 1; i < stops.length; i++) {
      const gap = stops[i].pos - stops[i - 1].pos;
      if (gap > best) {
        best = gap;
        at = (stops[i].pos + stops[i - 1].pos) / 2;
      }
    }
  }
  at = round(clamp(at, 0, 100));
  return { ...g, stops: [...stops, { color: colorAt(g, at), pos: at }].sort((a, b) => a.pos - b.pos) };
}

export function removeStop(g: Gradient, index: number): Gradient {
  if (g.stops.length <= MIN_STOPS) return g;
  return { ...g, stops: g.stops.filter((_, i) => i !== index) };
}

/** Mirror the stops: the first color becomes the last. */
export function reverse(g: Gradient): Gradient {
  return { ...g, stops: g.stops.map((s) => ({ ...s, pos: round(100 - s.pos) })).sort((a, b) => a.pos - b.pos) };
}

/** Spread the stops evenly from 0 to 100, keeping their order. */
export function distribute(g: Gradient): Gradient {
  const stops = [...g.stops].sort((a, b) => a.pos - b.pos);
  const n = stops.length - 1;
  return { ...g, stops: stops.map((s, i) => ({ ...s, pos: round((i / n) * 100) })) };
}

/** Same gradient with evenly spaced colors: a quick way to start from a palette. */
export function fromColors(colors: string[], base: Gradient = DEFAULT_GRADIENT): Gradient {
  const list = colors.map(normHex).filter((c): c is string => !!c).slice(0, MAX_STOPS);
  if (list.length === 0) return base;
  if (list.length === 1) list.push(list[0]);
  return distribute({ ...base, stops: list.map((color) => ({ color, pos: 0 })) });
}

function prefix(g: Gradient, withSpace: boolean): string {
  const space = withSpace && g.space !== "srgb" ? `in ${g.space}` : "";
  const parts: string[] = [];
  if (g.type === "linear") {
    parts.push([space, `${g.angle}deg`].filter(Boolean).join(" "));
  } else if (g.type === "radial") {
    parts.push([g.shape, `at ${g.x}% ${g.y}%`, space].filter(Boolean).join(" "));
  } else {
    parts.push([`from ${g.angle}deg`, `at ${g.x}% ${g.y}%`, space].filter(Boolean).join(" "));
  }
  return parts.join("");
}

function fn(g: Gradient) {
  return `${g.type}-gradient`;
}

const stopList = (stops: Stop[]) => stops.map((s) => `${s.color.toUpperCase()} ${round(s.pos)}%`).join(", ");

/** The gradient as a CSS `<image>` value, mixing in its own space. */
export function gradientCss(input: Gradient): string {
  const g = normalize(input);
  return `${fn(g)}(${prefix(g, true)}, ${stopList(g.stops)})`;
}

/**
 * The same gradient in plain sRGB, for engines without `in <space>`:
 * extra stops are sampled from the mix so it looks the same. Equal to
 * `gradientCss` for sRGB gradients.
 */
export function fallbackCss(input: Gradient, samplesPerGap = 4): string {
  const g = normalize(input);
  if (g.space === "srgb") return gradientCss(g);
  const out: Stop[] = [];
  g.stops.forEach((s, i) => {
    if (i > 0) {
      const a = g.stops[i - 1];
      for (let k = 1; k < samplesPerGap; k++) {
        const pos = a.pos + ((s.pos - a.pos) * k) / samplesPerGap;
        if (s.pos > a.pos) out.push({ color: colorAt(g, pos), pos: round(pos) });
      }
    }
    out.push(s);
  });
  return `${fn(g)}(${prefix(g, false)}, ${stopList(out)})`;
}

export type GradientExport = "css" | "tailwind" | "json";

export const GRADIENT_EXPORTS: { id: GradientExport; label: string }[] = [
  { id: "css", label: "CSS background" },
  { id: "tailwind", label: "Tailwind class" },
  { id: "json", label: "JSON" },
];

export function exportGradient(input: Gradient, format: GradientExport): string {
  const g = normalize(input);
  if (format === "tailwind") return `bg-[${gradientCss(g).replace(/, /g, ",").replace(/ /g, "_")}]`;
  if (format === "json") return JSON.stringify(g, null, 2);
  const css = gradientCss(g);
  const fb = fallbackCss(g);
  return fb === css ? `background: ${css};` : `background: ${fb};\nbackground: ${css};`;
}

/** Read a saved or curated gradient; anything missing gets the default. */
export function parseGradient(value: unknown): Gradient | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<Gradient>;
  if (!Array.isArray(v.stops)) return null;
  const stops = v.stops
    .filter((s): s is Stop => !!s && typeof s.color === "string" && typeof s.pos === "number" && !!normHex(s.color));
  if (stops.length < MIN_STOPS) return null;
  const d = DEFAULT_GRADIENT;
  return normalize({
    type: v.type === "radial" || v.type === "conic" ? v.type : "linear",
    angle: typeof v.angle === "number" ? v.angle : d.angle,
    shape: v.shape === "ellipse" ? "ellipse" : "circle",
    x: typeof v.x === "number" ? v.x : d.x,
    y: typeof v.y === "number" ? v.y : d.y,
    space: v.space === "srgb" || v.space === "oklch" ? v.space : "oklab",
    stops,
  });
}
