import { describe, expect, it } from "vitest";
import { oklch, wcagContrast } from "culori";
import { buildScales, GEN_FORMATS, generateCss, materialRoles, roles, tintedNeutral, tone } from "./cssgen";

const brand = [
  { name: "Brand", hex: "#5B6CFF" },
  { name: "Accent", hex: "#F2C94C" },
];

describe("scales and roles", () => {
  it("makes unique names and adds a neutral", () => {
    const s = buildScales([{ name: "Blue", hex: "#3B82F6" }, { name: "blue", hex: "#1D4ED8" }], true);
    expect(s.map((x) => x.name)).toEqual(["blue", "blue-2", "neutral"]);
    expect(s.every((x) => x.steps.length === 11)).toBe(true);
  });

  it("tints the neutral only slightly", () => {
    const n = oklch(tintedNeutral("#5B6CFF"))!;
    expect(n.c).toBeLessThan(0.015);
  });

  it("gives readable foregrounds on primary in both themes", () => {
    const rs = roles(buildScales(brand, true), true);
    const get = (n: string) => rs.find((r) => r.name === n)!;
    for (const mode of ["light", "dark"] as const) {
      expect(wcagContrast(get("primary-foreground")[mode], get("primary")[mode])).toBeGreaterThanOrEqual(3);
      expect(wcagContrast(get("foreground")[mode], get("background")[mode])).toBeGreaterThanOrEqual(7);
    }
  });

  it("material tones run from black to white and on-colors contrast", () => {
    expect(tone("#5B6CFF", 0)).toBe("#000000");
    expect(tone("#5B6CFF", 100)).toBe("#FFFFFF");
    const mr = materialRoles(brand);
    const get = (n: string) => mr.find((r) => r.name === n)!;
    for (const mode of ["light", "dark"] as const) {
      expect(wcagContrast(get("on-primary")[mode], get("primary")[mode])).toBeGreaterThanOrEqual(4.5);
      expect(wcagContrast(get("on-surface")[mode], get("surface")[mode])).toBeGreaterThanOrEqual(7);
    }
  });
});

describe("generateCss", () => {
  it.each(GEN_FORMATS.map((f) => f.id))("%s has every scale and role", (format) => {
    const out = generateCss({ colors: brand, neutral: true, format, value: "hex" });
    expect(out.length).toBeGreaterThan(200);
    if (format !== "material") {
      expect(out).toMatch(/brand/);
      expect(out).toMatch(/accent/);
      expect(out).toMatch(/neutral/);
      expect(out).toContain("primary-foreground");
    } else {
      expect(out).toContain("--md-sys-color-on-primary-container");
    }
  });

  it("CSS variables include light and dark roles", () => {
    const out = generateCss({ colors: brand, neutral: true, format: "css", value: "hex" });
    expect(out).toContain("--brand-500:");
    expect(out).toContain("@media (prefers-color-scheme: dark)");
    expect(out).toContain(".dark {");
  });

  it("design tokens are valid DTCG JSON", () => {
    const json = JSON.parse(generateCss({ colors: brand, neutral: false, format: "tokens", value: "oklch" }));
    expect(json.color.brand["500"].$type).toBe("color");
    expect(json.color.brand["500"].$value).toMatch(/^oklch\(/);
    expect(json.semantic.dark.primary.$type).toBe("color");
  });

  it("Tailwind v4 maps roles into the theme", () => {
    const out = generateCss({ colors: brand, neutral: true, format: "tw4", value: "hex" });
    expect(out).toContain("@theme {");
    expect(out).toContain("--color-primary: var(--primary);");
    expect(out).toContain("--color-accent-50:");
  });

  it("Tailwind v3 never repeats a key when a color is named like a role", () => {
    const out = generateCss({ colors: brand, neutral: true, format: "tw3", value: "hex" });
    const config = out.slice(0, out.indexOf("/* Add to your CSS"));
    const keys = [...config.matchAll(/^ {8}'?([a-z0-9-]+)'?:/gm)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(config).toContain("DEFAULT: 'var(--accent)'");
    // The config part is valid JavaScript.
    expect(() => new Function("module", config)({})).not.toThrow();
  });

  it("is empty without colors", () => {
    expect(generateCss({ colors: [], neutral: true, format: "css", value: "hex" })).toBe("");
  });
});

describe("material tones", () => {
  it("tone is CIELAB L*", async () => {
    const { lab } = await import("culori");
    for (const t of [10, 40, 80, 95]) expect(Math.abs(lab(tone("#5B6CFF", t))!.l - t)).toBeLessThan(1);
  });
});
