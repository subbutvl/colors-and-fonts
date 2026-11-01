import { clampChroma, formatHex, lch, oklch, wcagContrast } from "culori";
import { formatColor } from "./colors";
import { makeScale, slug, type ScaleStep } from "./scale";

/**
 * CSS generator: a few named brand colors in, a small design system out.
 * Each color gets a 50 to 950 scale (see scale.ts); the first color is the
 * primary and drives the semantic roles for light and dark themes. A
 * neutral gray, lightly tinted with the primary hue, can be added.
 */
export interface BrandColor {
  name: string;
  hex: string;
}

export type GenFormat = "css" | "tw4" | "tw3" | "scss" | "tokens" | "material";
export type GenValue = "hex" | "oklch";

export const GEN_FORMATS: { id: GenFormat; label: string; file: string }[] = [
  { id: "css", label: "CSS variables", file: "colors.css" },
  { id: "tw4", label: "Tailwind v4", file: "theme.css" },
  { id: "tw3", label: "Tailwind v3", file: "tailwind.config.js" },
  { id: "scss", label: "SCSS", file: "_colors.scss" },
  { id: "tokens", label: "Design tokens (JSON)", file: "tokens.json" },
  { id: "material", label: "Material 3 roles", file: "material.css" },
];

export const MAX_BRAND = 6;

export interface NamedScale {
  name: string;
  steps: ScaleStep[];
}

/** A gray carrying a hint of the primary's hue (as Tailwind's slate and zinc do). */
export function tintedNeutral(primary: string): string {
  const o = oklch(primary);
  return formatHex(clampChroma({ mode: "oklch", l: 0.55, c: Math.min(0.012, o?.c ?? 0), h: o?.h ?? 0 }, "oklch")).toUpperCase();
}

/** Scales for every brand color (unique slugs), plus the neutral when asked. */
export function buildScales(colors: BrandColor[], neutral: boolean): NamedScale[] {
  const used = new Set<string>();
  const unique = (name: string) => {
    let s = slug(name);
    for (let i = 2; used.has(s); i++) s = `${slug(name)}-${i}`;
    used.add(s);
    return s;
  };
  const out = colors.slice(0, MAX_BRAND).map((c) => ({ name: unique(c.name), steps: makeScale(c.hex) }));
  if (neutral && colors.length) out.push({ name: unique("neutral"), steps: makeScale(tintedNeutral(colors[0].hex)) });
  return out;
}

const at = (s: NamedScale, step: number) => s.steps.find((x) => x.step === step)!.hex;
const onColor = (hex: string) => (wcagContrast("#FFFFFF", hex) >= wcagContrast("#000000", hex) ? "#FFFFFF" : "#000000");

export interface Role {
  name: string;
  light: string;
  dark: string;
}

/** shadcn-style semantic roles from the primary and the neutral (or the primary, if no neutral). */
export function roles(scales: NamedScale[], neutral: boolean): Role[] {
  if (!scales.length) return [];
  const p = scales[0];
  const n = neutral ? scales[scales.length - 1] : p;
  const accent = scales.length > (neutral ? 2 : 1) ? scales[1] : p;
  const primaryLight = at(p, 600);
  const primaryDark = at(p, 400);
  return [
    { name: "background", light: "#FFFFFF", dark: at(n, 950) },
    { name: "foreground", light: at(n, 950), dark: at(n, 50) },
    { name: "primary", light: primaryLight, dark: primaryDark },
    { name: "primary-foreground", light: onColor(primaryLight), dark: onColor(primaryDark) },
    { name: "secondary", light: at(n, 100), dark: at(n, 800) },
    { name: "secondary-foreground", light: at(n, 900), dark: at(n, 50) },
    { name: "accent", light: at(accent, 100), dark: at(accent, 800) },
    { name: "accent-foreground", light: at(accent, 900), dark: at(accent, 50) },
    { name: "muted", light: at(n, 100), dark: at(n, 800) },
    { name: "muted-foreground", light: at(n, 500), dark: at(n, 400) },
    { name: "border", light: at(n, 200), dark: at(n, 800) },
    { name: "ring", light: at(p, 500), dark: at(p, 400) },
  ];
}

/*
 * Material 3 style tonal palettes. Material's HCT "tone" is CIELAB L*, so
 * tones here are exact L*; hue and chroma come from CIELCh instead of CAM16,
 * a close stand-in.
 */

export const TONES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100];

export function tone(hex: string, t: number, chroma?: number): string {
  if (t <= 0) return "#000000";
  if (t >= 100) return "#FFFFFF";
  const base = lch(hex)!;
  const c = chroma ?? base.c ?? 0;
  return formatHex(clampChroma({ mode: "lch", l: t, c, h: base.h ?? 0 }, "lch")).toUpperCase();
}

export function materialRoles(colors: BrandColor[]): Role[] {
  if (!colors.length) return [];
  const p = colors[0].hex;
  const s = colors[1]?.hex;
  const t = colors[2]?.hex;
  const pc = lch(p)?.c ?? 0;
  // Without a given secondary, Material derives it from the primary with less chroma.
  const sec = (tn: number) => (s ? tone(s, tn) : tone(p, tn, pc / 3));
  // Without a given tertiary, Material rotates the primary hue by 60 degrees.
  const ter = (tn: number) => {
    if (t) return tone(t, tn);
    const o = lch(p)!;
    return tone(formatHex({ mode: "lch", l: 60, c: pc, h: ((o.h ?? 0) + 60) % 360 }), tn);
  };
  // Material's neutral and neutral-variant palettes: chroma 4 and 8 in HCT.
  const neu = (tn: number) => tone(p, tn, Math.min(4, pc));
  const neuV = (tn: number) => tone(p, tn, Math.min(8, pc));
  const pri = (tn: number) => tone(p, tn);
  const err = (tn: number) => tone("#B3261E", tn);
  const set = (name: string, f: (tn: number) => string, l: number, d: number): Role => ({ name, light: f(l), dark: f(d) });
  return [
    set("primary", pri, 40, 80),
    set("on-primary", pri, 100, 20),
    set("primary-container", pri, 90, 30),
    set("on-primary-container", pri, 10, 90),
    set("secondary", sec, 40, 80),
    set("on-secondary", sec, 100, 20),
    set("secondary-container", sec, 90, 30),
    set("on-secondary-container", sec, 10, 90),
    set("tertiary", ter, 40, 80),
    set("on-tertiary", ter, 100, 20),
    set("tertiary-container", ter, 90, 30),
    set("on-tertiary-container", ter, 10, 90),
    set("error", err, 40, 80),
    set("on-error", err, 100, 20),
    set("error-container", err, 90, 30),
    set("on-error-container", err, 10, 90),
    set("surface", neu, 98, 6),
    set("on-surface", neu, 10, 90),
    set("surface-variant", neuV, 90, 30),
    set("on-surface-variant", neuV, 30, 80),
    set("outline", neuV, 50, 60),
    set("outline-variant", neuV, 80, 30),
  ];
}

/* Output */

function block(selector: string, lines: string[], indent = ""): string {
  return `${indent}${selector} {\n${lines.map((l) => `${indent}  ${l}`).join("\n")}\n${indent}}`;
}

function themed(prefix: string, list: Role[], v: (hex: string) => string): string {
  const light = list.map((r) => `--${prefix}${r.name}: ${v(r.light)};`);
  const dark = list.map((r) => `--${prefix}${r.name}: ${v(r.dark)};`);
  return [
    block(":root", light),
    "",
    "@media (prefers-color-scheme: dark) {",
    block(":root:not(.light)", dark, "  "),
    "}",
    "",
    block(".dark", dark),
  ].join("\n");
}

export interface GenOptions {
  colors: BrandColor[];
  neutral: boolean;
  format: GenFormat;
  value: GenValue;
}

export function generateCss({ colors, neutral, format, value }: GenOptions): string {
  const v = (hex: string) => formatColor(hex, value);
  const scales = buildScales(colors, neutral);
  if (!scales.length) return "";
  const rs = roles(scales, neutral);
  const scaleLines = (pre: string) => scales.flatMap((s) => s.steps.map((st) => `--${pre}${s.name}-${st.step}: ${v(st.hex)};`));

  switch (format) {
    case "css":
      return [block(":root", scaleLines("")), "", "/* Semantic roles (light, then dark) */", themed("", rs, v)].join("\n");
    case "tw4":
      return [
        '@import "tailwindcss";',
        "",
        block("@theme", [...scaleLines("color-"), ...rs.map((r) => `--color-${r.name}: var(--${r.name});`)]),
        "",
        themed("", rs, v),
      ].join("\n");
    case "tw3": {
      const key = (s: string) => (/^[a-z_$][a-z0-9_$]*$/i.test(s) ? s : `'${s}'`);
      // A role named like a scale (e.g. "accent") becomes that scale's DEFAULT, so keys never repeat.
      const roleNames = new Set(rs.map((r) => r.name));
      const scaleObjs = scales.map((s) => {
        const def = roleNames.has(s.name) ? [`          DEFAULT: 'var(--${s.name})',`] : [];
        const lines = [...def, ...s.steps.map((st) => `          ${st.step}: '${v(st.hex)}',`)];
        return `        ${key(s.name)}: {\n${lines.join("\n")}\n        },`;
      });
      const scaleNames = new Set(scales.map((s) => s.name));
      const roleObjs = rs.filter((r) => !scaleNames.has(r.name)).map((r) => `        ${key(r.name)}: 'var(--${r.name})',`);
      return [
        "/** @type {import('tailwindcss').Config} */",
        "module.exports = {",
        "  darkMode: 'class',",
        "  theme: {",
        "    extend: {",
        "      colors: {",
        ...scaleObjs,
        ...roleObjs,
        "      },",
        "    },",
        "  },",
        "};",
        "",
        "/* Add to your CSS for the role variables: */",
        "/*",
        themed("", rs, v),
        "*/",
      ].join("\n");
    }
    case "scss": {
      const vars = scales.flatMap((s) => s.steps.map((st) => `$${s.name}-${st.step}: ${v(st.hex)};`));
      const maps = scales.map(
        (s) => `  "${s.name}": (\n${s.steps.map((st) => `    ${st.step}: $${s.name}-${st.step},`).join("\n")}\n  ),`,
      );
      const light = rs.map((r) => `$${r.name}: ${v(r.light)};`);
      const dark = rs.map((r) => `$${r.name}-dark: ${v(r.dark)};`);
      return [...vars, "", "$colors: (", ...maps, ");", "", "// Semantic roles", ...light, "", ...dark].join("\n");
    }
    case "tokens": {
      // W3C Design Tokens (DTCG) format.
      const tok = (hex: string) => ({ $type: "color", $value: v(hex) });
      const color = Object.fromEntries(scales.map((s) => [s.name, Object.fromEntries(s.steps.map((st) => [String(st.step), tok(st.hex)]))]));
      const ref = (role: Role, mode: "light" | "dark") => tok(role[mode]);
      const semantic = {
        light: Object.fromEntries(rs.map((r) => [r.name, ref(r, "light")])),
        dark: Object.fromEntries(rs.map((r) => [r.name, ref(r, "dark")])),
      };
      return JSON.stringify({ color, semantic }, null, 2);
    }
    case "material": {
      const mr = materialRoles(colors);
      const palettes = [
        ...TONES.map((t) => `--md-ref-palette-primary${t}: ${v(tone(colors[0].hex, t))};`),
      ];
      return [
        "/* Material 3 style color roles. Tones are CIELAB L* (as in HCT); hue and chroma use CIELCh as a stand-in for CAM16. */",
        block(":root", palettes),
        "",
        themed("md-sys-color-", mr, v),
      ].join("\n");
    }
  }
}
