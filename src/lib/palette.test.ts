import { describe, expect, it } from "vitest";
import { oklch } from "culori";
import { exportPalette, generate, HARMONIES, MAX_COLORS, seeded } from "./palette";

const HEX = /^#[0-9A-F]{6}$/;
const hueOf = (hex: string) => oklch(hex)!.h ?? 0;
const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe("generate", () => {
  it("makes valid sRGB hex colors for every harmony and size", () => {
    for (const { id } of HARMONIES) {
      for (let n = 3; n <= MAX_COLORS; n++) {
        const colors = generate({ harmony: id, count: n, rand: seeded(n * 31) });
        expect(colors).toHaveLength(n);
        colors.forEach((c) => expect(c).toMatch(HEX));
      }
    }
  });

  it("is repeatable with a seed", () => {
    const a = generate({ harmony: "triadic", count: 5, rand: seeded(7) });
    const b = generate({ harmony: "triadic", count: 5, rand: seeded(7) });
    expect(a).toEqual(b);
  });

  it("keeps locked colors in place and builds around the first one", () => {
    const current = [
      { hex: "#AAAAAA", locked: false },
      { hex: "#2F6FDB", locked: true },
      { hex: "#BBBBBB", locked: false },
      { hex: "#CCCCCC", locked: false },
    ];
    const out = generate({ harmony: "monochromatic", count: 4, current, rand: seeded(3) });
    expect(out[1]).toBe("#2F6FDB");
    // Monochromatic: every new color within a few degrees of the locked hue.
    for (const c of [out[0], out[2], out[3]]) expect(hueDistance(hueOf(c), hueOf("#2F6FDB"))).toBeLessThan(12);
  });

  it("puts complementary colors on opposite hues", () => {
    const [a, b] = generate({ harmony: "complementary", count: 4, rand: seeded(11) });
    expect(hueDistance(hueOf(a), hueOf(b))).toBeGreaterThan(150);
  });

  it("clamps the size", () => {
    expect(generate({ harmony: "random", count: 50, rand: seeded(1) })).toHaveLength(MAX_COLORS);
    expect(generate({ harmony: "random", count: 1, rand: seeded(1) })).toHaveLength(3);
  });
});

describe("exportPalette", () => {
  it("writes CSS variables, JSON and a list", () => {
    const colors = ["#111111", "#EEEEEE"];
    expect(exportPalette(colors, "css", "Ocean Breeze")).toBe(
      ":root {\n  --ocean-breeze-1: #111111;\n  --ocean-breeze-2: #EEEEEE;\n}",
    );
    expect(exportPalette(colors, "json")).toBe('["#111111","#EEEEEE"]');
    expect(exportPalette(colors, "list")).toBe("#111111, #EEEEEE");
  });
});
