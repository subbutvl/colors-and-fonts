import { describe, expect, it } from "vitest";
import { oklch } from "culori";
import { exportScale, hueFamily, makeScale, nearestStep, STEPS } from "./scale";

const HEX = /^#[0-9A-F]{6}$/;

describe("makeScale", () => {
  const bases = ["#5B6CFF", "#E5484D", "#F2C94C", "#1F9D55", "#111111", "#FAFAFA", "#808080", "#00FFFF", "#3B0764"];

  it.each(bases)("keeps %s exactly and gives 11 valid steps", (hex) => {
    const scale = makeScale(hex);
    expect(scale.map((s) => s.step)).toEqual([...STEPS]);
    expect(scale.every((s) => HEX.test(s.hex))).toBe(true);
    const base = scale.filter((s) => s.base);
    expect(base).toHaveLength(1);
    expect(base[0].hex).toBe(hex);
  });

  it.each(bases)("gets darker at every step for %s", (hex) => {
    const ls = makeScale(hex).map((s) => s.l);
    for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeLessThan(ls[i - 1]);
  });

  it("puts a mid blue near 500", () => {
    const scale = makeScale("#3B82F6");
    expect(scale.find((s) => s.base)?.step).toBe(500);
  });

  it("keeps the hue", () => {
    const h = oklch("#E5484D")!.h!;
    for (const s of makeScale("#E5484D")) {
      if (s.c > 0.03) expect(Math.abs(oklch(s.hex)!.h! - h)).toBeLessThan(6);
    }
  });

  it("keeps grays gray", () => {
    for (const s of makeScale("#808080")) expect(s.c).toBeLessThan(0.01);
  });
});

describe("helpers", () => {
  it("nearestStep", () => {
    expect(nearestStep(1)).toBe(0);
    expect(nearestStep(0.64)).toBe(5);
    expect(nearestStep(0)).toBe(10);
  });

  it("hueFamily", () => {
    expect(hueFamily("#3B82F6")).toBe("blue");
    expect(hueFamily("#EF4444")).toBe("red");
    expect(hueFamily("#22C55E")).toBe("green");
    expect(hueFamily("#777777")).toBe("gray");
  });
});

describe("exportScale", () => {
  const scale = makeScale("#3B82F6");

  it("CSS variables", () => {
    const css = exportScale(scale, "css", "Brand Blue");
    expect(css).toMatch(/^:root \{\n  --brand-blue-50: #[0-9A-F]{6};/);
    expect(css).toContain("--brand-blue-500: #3B82F6;");
    expect(css.split("\n")).toHaveLength(13);
  });

  it("Tailwind v4 with OKLCH values", () => {
    const tw = exportScale(scale, "tw4", "blue", "oklch");
    expect(tw).toMatch(/^@theme \{\n  --color-blue-50: oklch\(/);
  });

  it("Tailwind v3 quotes names that are not identifiers", () => {
    expect(exportScale(scale, "tw3", "brand blue")).toMatch(/^'brand-blue': \{\n  50: '#/);
    expect(exportScale(scale, "tw3", "blue")).toMatch(/^blue: \{/);
  });

  it("JSON", () => {
    const parsed = JSON.parse(exportScale(scale, "json", "blue"));
    expect(Object.keys(parsed.blue)).toHaveLength(11);
    expect(parsed.blue["500"]).toBe("#3B82F6");
  });
});

describe("yellow", () => {
  it("leans darker steps towards orange instead of olive", () => {
    const scale = makeScale("#F2C94C");
    const baseH = oklch("#F2C94C")!.h!;
    expect(oklch(scale[9].hex)!.h!).toBeLessThan(baseH - 10);
  });
});
