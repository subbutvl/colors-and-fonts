import { describe, expect, it } from "vitest";
import { BRAND_CATEGORIES, brandCss, BRANDS, COLOR_COLLECTIONS, searchBrands, searchPalettes } from "./colorSets";

const HEX = /^#[0-9A-F]{6}$/;

describe("curated colors data", () => {
  it("has the collections the spec names, with five valid colors per palette", () => {
    const ids = COLOR_COLLECTIONS.map((c) => c.id);
    for (const id of ["earthy", "pastel", "neon", "corporate", "dark-ui"]) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COLOR_COLLECTIONS) {
      expect(c.palettes.length).toBeGreaterThanOrEqual(4);
      for (const p of c.palettes) {
        expect(p.colors).toHaveLength(5);
        for (const h of p.colors) expect(h).toMatch(HEX);
        // Palettes are saved as palettes; 8 is the Palettes maximum.
        expect(new Set(p.colors).size).toBe(5);
      }
    }
    const names = COLOR_COLLECTIONS.flatMap((c) => c.palettes.map((p) => p.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it("searches palettes by name, collection and hex", () => {
    expect(searchPalettes("").length).toBe(COLOR_COLLECTIONS.reduce((n, c) => n + c.palettes.length, 0));
    expect(searchPalettes("lagoon").map((r) => r.palette.name)).toEqual(["Lagoon"]);
    expect(searchPalettes("", "neon").every((r) => r.collection.id === "neon")).toBe(true);
    expect(searchPalettes("#0d1117").map((r) => r.palette.name)).toEqual(["Midnight"]);
    expect(searchPalettes("pastel").length).toBeGreaterThan(0);
  });
});

describe("brand colors data", () => {
  it("is sorted, unique and well formed", () => {
    const names = BRANDS.map((b) => b.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(new Set(names).size).toBe(names.length);
    for (const b of BRANDS) {
      expect(b.colors.length).toBeGreaterThan(0);
      for (const c of b.colors) expect(c.hex).toMatch(HEX);
      const link = b.guide ?? b.site;
      expect(link).toMatch(/^https:\/\//);
      expect(BRAND_CATEGORIES).toContain(b.category);
    }
  });

  it("searches by brand, color name, hex and category", () => {
    expect(searchBrands("spot").map((b) => b.name)).toEqual(["Spotify"]);
    expect(searchBrands("aubergine").map((b) => b.name).sort()).toEqual(["Slack", "Ubuntu"]);
    expect(searchBrands("#ff4500").map((b) => b.name)).toEqual(["Reddit"]);
    expect(searchBrands("FF4500").map((b) => b.name)).toEqual(["Reddit"]);
    expect(searchBrands("", "Finance").every((b) => b.category === "Finance")).toBe(true);
    expect(searchBrands("google", "Finance")).toEqual([]);
  });

  it("exports CSS variables", () => {
    expect(brandCss(BRANDS.find((b) => b.name === "McDonald's")!)).toBe("--mcdonalds-yellow: #FFC72C;\n--mcdonalds-red: #DA291C;");
  });
});
