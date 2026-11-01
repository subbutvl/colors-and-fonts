import { describe, expect, it } from "vitest";
import {
  addStop,
  colorAt,
  DEFAULT_GRADIENT,
  distribute,
  exportGradient,
  fallbackCss,
  fromColors,
  gradientCss,
  MAX_STOPS,
  normalize,
  parseGradient,
  removeStop,
  reverse,
  type Gradient,
} from "./gradient";

const bw: Gradient = { ...DEFAULT_GRADIENT, space: "srgb", stops: [{ color: "#000000", pos: 0 }, { color: "#ffffff", pos: 100 }] };

describe("gradientCss", () => {
  it("writes linear, radial and conic with the mixing space", () => {
    expect(gradientCss({ ...DEFAULT_GRADIENT, angle: 90 })).toBe("linear-gradient(in oklab 90deg, #6366F1 0%, #EC4899 100%)");
    expect(gradientCss({ ...DEFAULT_GRADIENT, type: "radial", shape: "ellipse", x: 20, y: 30 })).toBe(
      "radial-gradient(ellipse at 20% 30% in oklab, #6366F1 0%, #EC4899 100%)",
    );
    expect(gradientCss({ ...DEFAULT_GRADIENT, type: "conic", angle: 45, space: "oklch" })).toBe(
      "conic-gradient(from 45deg at 50% 50% in oklch, #6366F1 0%, #EC4899 100%)",
    );
    expect(gradientCss({ ...bw, angle: 180 })).toBe("linear-gradient(180deg, #000000 0%, #FFFFFF 100%)");
  });

  it("normalizes angles, order and colors", () => {
    const g = normalize({ ...bw, angle: -90, stops: [{ color: "white", pos: 120 }, { color: "rgb(0 0 0)", pos: -5 }] });
    expect(g.angle).toBe(270);
    expect(g.stops).toEqual([{ color: "#000000", pos: 0 }, { color: "#FFFFFF", pos: 100 }]);
  });
});

describe("colorAt and stops", () => {
  it("mixes in the chosen space", () => {
    expect(colorAt(bw, 50)).toBe("#808080");
    // Halfway in OKLab is L 0.5, a darker gray than the sRGB average.
    expect(colorAt({ ...bw, space: "oklab" }, 50)).toBe("#636363");
    expect(colorAt(bw, -10)).toBe("#000000");
    expect(colorAt(bw, 200)).toBe("#FFFFFF");
  });

  it("adds a stop in the widest gap without changing the look", () => {
    const g = addStop(bw);
    expect(g.stops).toHaveLength(3);
    expect(g.stops[1]).toEqual({ color: "#808080", pos: 50 });
    const h = addStop(g);
    expect(h.stops.map((s) => s.pos)).toEqual([0, 25, 50, 100]);
  });

  it("keeps between 2 and 10 stops", () => {
    expect(removeStop(bw, 0).stops).toHaveLength(2);
    let g = bw;
    for (let i = 0; i < 20; i++) g = addStop(g);
    expect(g.stops).toHaveLength(MAX_STOPS);
  });

  it("reverses and distributes", () => {
    const g: Gradient = { ...bw, stops: [{ color: "#FF0000", pos: 0 }, { color: "#00FF00", pos: 10 }, { color: "#0000FF", pos: 100 }] };
    expect(reverse(g).stops.map((s) => `${s.color} ${s.pos}`)).toEqual(["#0000FF 0", "#00FF00 90", "#FF0000 100"]);
    expect(distribute(g).stops.map((s) => s.pos)).toEqual([0, 50, 100]);
    expect(fromColors(["red", "lime", "blue", "nope"]).stops.map((s) => s.color)).toEqual(["#FF0000", "#00FF00", "#0000FF"]);
  });
});

describe("export", () => {
  it("adds an sRGB fallback only when the space is not sRGB", () => {
    expect(exportGradient(bw, "css")).toBe("background: linear-gradient(135deg, #000000 0%, #FFFFFF 100%);");
    const css = exportGradient(DEFAULT_GRADIENT, "css").split("\n");
    expect(css).toHaveLength(2);
    expect(css[1]).toBe(`background: ${gradientCss(DEFAULT_GRADIENT)};`);
    expect(css[0]).not.toContain(" in ");
    expect(fallbackCss(DEFAULT_GRADIENT).match(/%/g)).toHaveLength(5);
  });

  it("writes a Tailwind arbitrary value without spaces", () => {
    expect(exportGradient(bw, "tailwind")).toBe("bg-[linear-gradient(135deg,#000000_0%,#FFFFFF_100%)]");
  });

  it("round-trips through JSON", () => {
    const g = normalize({ ...DEFAULT_GRADIENT, type: "conic", angle: 30 });
    expect(parseGradient(JSON.parse(exportGradient(g, "json")))).toEqual(g);
    expect(parseGradient({ stops: [{ color: "#fff", pos: 0 }] })).toBeNull();
    expect(parseGradient(null)).toBeNull();
  });
});

describe("curated gradients", async () => {
  const { CURATED_GRADIENTS, GRADIENT_GROUPS } = await import("./gradientSets");
  it("all parse, with unique names", () => {
    expect(CURATED_GRADIENTS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(CURATED_GRADIENTS.map((g) => g.name)).size).toBe(CURATED_GRADIENTS.length);
    expect(GRADIENT_GROUPS).toEqual(["Soft", "Vivid", "Nature", "Dark"]);
    const spectrum = CURATED_GRADIENTS.find((g) => g.name === "Spectrum")!;
    expect(gradientCss(spectrum.gradient)).toMatch(/^conic-gradient\(from 0deg at 50% 50% in oklch, #EF4444 0%/);
  });
});
