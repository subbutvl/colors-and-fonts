import { describe, expect, it } from "vitest";
import { oklch } from "culori";
import { isGray, PAIRINGS, partners } from "./pairing";

const HEX = /^#[0-9A-F]{6}$/;
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

describe("partners", () => {
  it.each(PAIRINGS.map((p) => p.id))("%s gives valid colors with the base exactly once", (id) => {
    for (const wheel of ["oklch", "hsl"] as const) {
      const list = partners("#5B6CFF", id, wheel);
      expect(list).toHaveLength(PAIRINGS.find((p) => p.id === id)!.offsets.length);
      expect(list.every((p) => HEX.test(p.hex))).toBe(true);
      expect(list.filter((p) => p.base).map((p) => p.hex)).toEqual(["#5B6CFF"]);
    }
  });

  it("classic HSL wheel: red's complement is cyan, triad is green and blue", () => {
    expect(partners("#FF0000", "complementary", "hsl").map((p) => p.hex)).toEqual(["#FF0000", "#00FFFF"]);
    expect(partners("#FF0000", "triadic", "hsl").map((p) => p.hex)).toEqual(["#FF0000", "#00FF00", "#0000FF"]);
  });

  it("OKLCH complement is about 180 degrees away and keeps lightness", () => {
    const [base, comp] = partners("#2E8B57", "complementary", "oklch");
    const a = oklch(base.hex)!;
    const b = oklch(comp.hex)!;
    expect(hueGap(a.h!, b.h!)).toBeGreaterThan(170);
    expect(Math.abs(a.l - b.l)).toBeLessThan(0.02);
  });

  it("monochromatic keeps the hue and runs dark to light", () => {
    const list = partners("#E5484D", "monochromatic");
    const ls = list.map((p) => oklch(p.hex)!.l);
    for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeGreaterThan(ls[i - 1]);
    const h = oklch("#E5484D")!.h!;
    for (const p of list) expect(hueGap(oklch(p.hex)!.h!, h)).toBeLessThan(8);
  });

  it("knows grays", () => {
    expect(isGray("#808080")).toBe(true);
    expect(isGray("#5B6CFF")).toBe(false);
  });
});
