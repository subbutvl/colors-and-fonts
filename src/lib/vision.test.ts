import { describe, expect, it } from "vitest";
import { collisions, distinction, simulate, splitColors, VISIONS } from "./vision";

const HEX = /^#[0-9A-F]{6}$/;

describe("simulate", () => {
  it("leaves typical vision, black, white and grays alone for color blindness", () => {
    expect(simulate("#5B6CFF", "typical")).toBe("#5B6CFF");
    for (const id of ["protan", "deutan", "tritan", "achroma"] as const) {
      expect(simulate("#000000", id)).toBe("#000000");
      expect(simulate("#FFFFFF", id)).toBe("#FFFFFF");
      expect(simulate("#808080", id)).toBe("#808080");
    }
  });

  it("gives valid hex for every vision", () => {
    for (const v of VISIONS) for (const c of ["#E5484D", "#1F9D55", "#F2C94C", "#00FFFF"]) expect(simulate(c, v.id)).toMatch(HEX);
  });

  it("makes chart red and green look alike for deutans, not for typical vision", () => {
    const red = "#D62728";
    const green = "#2CA02C";
    expect(distinction(red, green).level).toBe("ok");
    expect(distinction(simulate(red, "deutan"), simulate(green, "deutan")).level).toBe("same");
  });

  it("darkens red for protans", () => {
    const l = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16);
    expect(l(simulate("#D62728", "protan"))).toBeLessThan(l(simulate("#D62728", "deutan")));
  });

  it("matches known Machado values for pure red", () => {
    // Protanopia sees sRGB red as a dark olive; deuteranopia as a brighter one.
    const p = simulate("#FF0000", "protan");
    const d = simulate("#FF0000", "deutan");
    expect(p).toMatch(/^#[0-9A-F]{2}[0-9A-F]{2}00$/);
    expect(parseInt(d.slice(1, 3), 16)).toBeGreaterThan(parseInt(p.slice(1, 3), 16));
  });

  it("severity 0 is typical and grows towards full", () => {
    expect(simulate("#E5484D", "deutan", 0)).toBe("#E5484D");
    const half = distinction("#E5484D", simulate("#E5484D", "deutan", 0.5)).deltaE;
    const full = distinction("#E5484D", simulate("#E5484D", "deutan", 1)).deltaE;
    expect(half).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(half);
  });

  it("grayscale print keeps only luminance", () => {
    const g = simulate("#5B6CFF", "print");
    expect(g.slice(1, 3)).toBe(g.slice(3, 5));
    expect(g.slice(3, 5)).toBe(g.slice(5, 7));
  });

  it("situations reduce contrast against white", () => {
    for (const id of ["dim", "glare"] as const) {
      const before = distinction("#111111", "#FFFFFF").deltaE;
      const after = distinction(simulate("#111111", id), simulate("#FFFFFF", id)).deltaE;
      expect(after).toBeLessThan(before);
    }
  });
});

describe("collisions", () => {
  it("lists only pairs that are hard to tell apart, closest first", () => {
    const list = collisions(["#FF0000", "#FE0101", "#0000FF", "#FF0505"]);
    expect(list.map((c) => [c.a, c.b])).toEqual([
      [0, 1],
      [0, 3],
      [1, 3],
    ]);
    expect(list[0].level).toBe("same");
  });
});

describe("splitColors", () => {
  it("splits on commas and spaces, keeping functions whole", () => {
    expect(splitColors("#f00, rgb(0, 0, 255) teal\n#123")).toEqual(["#f00", "rgb(0, 0, 255)", "teal", "#123"]);
    expect(splitColors("  ")).toEqual([]);
  });
});
