import { afterEach, describe as group, expect, it, vi } from "vitest";
import { cmyk, colorFromRoute, colorRoute, describe, harmonies, mixSteps, normalizeHex, valueRows } from "./colorDetails";

group("valueRows", () => {
  it("gives the hover card values", () => {
    expect(valueRows("#f0f6fc")).toEqual([
      { label: "HEX", value: "#F0F6FC" },
      { label: "RGB", value: "rgb(240, 246, 252)" },
      { label: "RGBA", value: "rgba(240, 246, 252, 1)" },
      { label: "HSL", value: "hsl(210, 67%, 96%)" },
      { label: "HSB", value: "hsb(210, 5%, 99%)" },
    ]);
  });

  it("adds CMYK and OKLCH for the details page", () => {
    const rows = valueRows("#FF0000", "full");
    expect(rows.map((r) => r.label)).toEqual(["HEX", "RGB", "RGBA", "HSL", "HSB", "CMYK", "OKLCH"]);
    expect(rows[5].value).toBe("cmyk(0%, 100%, 100%, 0%)");
    expect(rows[6].value).toMatch(/^oklch\(62\.8% 0\.25\d 29\.2\)$/);
  });

  it("keeps black and white sane", () => {
    expect(cmyk("#000000")).toEqual([0, 0, 0, 100]);
    expect(valueRows("#FFFFFF")[4].value).toBe("hsb(0, 0%, 100%)");
  });
});

group("describe", () => {
  it("tags a light vivid blue and picks black text", () => {
    const d = describe("#F0F6FC");
    expect(d.tone).toBe("Light");
    expect(d.hue).toBe("Blue");
    expect(d.vividness).not.toBe("Neutral");
    expect(d.bestText).toBe("Black");
    expect(d.bestRatio).toBeGreaterThan(18);
    expect(d.about).toContain("Black text reads best on it");
    expect(d.about).toContain("240, 246, 252");
  });

  it("calls exact CSS colors by name and grays gray", () => {
    const red = describe("#FF0000");
    expect(red.exact).toBe(true);
    expect(red.name).toBe("red");
    expect(red.vividness).toBe("Vivid");
    expect(describe("#777777").hue).toBe("Gray");
    expect(describe("#111111").bestText).toBe("White");
  });
});

group("tints, shades and harmonies", () => {
  it("starts at the color and moves towards white or black", () => {
    const tints = mixSteps("#5B6CFF", "white");
    const shades = mixSteps("#5B6CFF", "black");
    expect(tints).toHaveLength(10);
    expect(tints[0]).toBe("#5B6CFF");
    expect(shades[0]).toBe("#5B6CFF");
    expect(tints[9]).not.toBe("#FFFFFF");
    expect(shades[9]).not.toBe("#000000");
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    for (let i = 1; i < 10; i++) {
      expect(lum(tints[i])).toBeGreaterThanOrEqual(lum(tints[i - 1]));
      expect(lum(shades[i])).toBeLessThanOrEqual(lum(shades[i - 1]));
    }
  });

  it("puts the base color first in every harmony", () => {
    const list = harmonies("#5b6cff");
    expect(list.map((h) => h.id)).toEqual(["complementary", "analogous", "triadic", "split"]);
    for (const h of list) expect(h.colors[0]).toBe("#5B6CFF");
    expect(list[0].colors).toHaveLength(2);
    expect(list[2].colors).toHaveLength(3);
  });
});

group("routes and handoffs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips the details route", () => {
    expect(colorRoute("#5b6cff")).toBe("color/5B6CFF");
    expect(colorFromRoute("5b6cff")).toBe("#5B6CFF");
    expect(colorFromRoute("nope")).toBeNull();
    expect(colorFromRoute(undefined)).toBeNull();
    expect(normalizeHex("#abc")).toBe("#AABBCC");
  });

  it("hands a seed color to Palettes once", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    const { seedPalette, takePaletteSeed, seedContrast } = await import("./colorDetails");
    seedPalette("#5b6cff");
    expect(takePaletteSeed()).toBe("#5B6CFF");
    expect(takePaletteSeed()).toBeNull();
    seedContrast("#111111");
    expect(JSON.parse(store.get("huetype.contrast")!)).toEqual({ text: "#FFFFFF", background: "#111111" });
  });
});
