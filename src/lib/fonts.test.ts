import { describe, expect, it } from "vitest";
import {
  bundledCatalog,
  cssUrl,
  filterFonts,
  fontFamilyCss,
  fromApi,
  hasWeight,
  previewWeight,
  sortFonts,
  subsetLabel,
  subsetsByUse,
  type FontFamily,
} from "./fonts";

const catalog = bundledCatalog();
const byName = (name: string) => catalog.families.find((f) => f.family === name)!;

describe("bundled catalog", () => {
  it("has the Google Fonts families, sorted, without icon fonts", () => {
    expect(catalog.families.length).toBeGreaterThan(1500);
    expect(catalog.families.some((f) => f.family.startsWith("Material Symbols"))).toBe(false);
    const names = catalog.families.map((f) => f.family);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    for (const f of catalog.families) {
      expect(["sans-serif", "serif", "display", "handwriting", "monospace"]).toContain(f.category);
      expect(f.weights.length).toBeGreaterThan(0);
    }
  });

  it("knows variable axes", () => {
    const inter = byName("Inter");
    expect(inter.axes.find((a) => a.tag === "wght")).toEqual({ tag: "wght", min: 100, max: 900 });
    expect(inter.italic).toBe(true);
    expect(byName("Abel").axes).toEqual([]);
  });
});

describe("filter and sort", () => {
  it("filters by name, category, variable, script and weight", () => {
    const list = catalog.families;
    expect(filterFonts(list, { query: "roboto" }).every((f) => f.family.toLowerCase().includes("roboto"))).toBe(true);
    expect(filterFonts(list, { categories: ["monospace"] }).every((f) => f.category === "monospace")).toBe(true);
    expect(filterFonts(list, { variableOnly: true }).every((f) => f.axes.length > 0)).toBe(true);
    const cyr = filterFonts(list, { subset: "cyrillic" });
    expect(cyr.length).toBeGreaterThan(100);
    expect(cyr.every((f) => f.subsets.includes("cyrillic"))).toBe(true);
    // A variable font has every weight inside its wght range.
    expect(hasWeight(byName("Inter"), 350)).toBe(true);
    expect(hasWeight(byName("Abel"), 700)).toBe(false);
    expect(filterFonts(list, { weight: 100 }).every((f) => hasWeight(f, 100))).toBe(true);
  });

  it("sorts by popularity rank, newest and style count", () => {
    const a = { ...byName("Inter"), rank: 2 };
    const b = { ...byName("Lora"), rank: 1 };
    const c = byName("Abel");
    expect(sortFonts([a, c, b], "popular").map((f) => f.family)).toEqual(["Lora", "Inter", "Abel"]);
    const newest = sortFonts(catalog.families, "newest");
    expect(newest[0].modified >= newest[newest.length - 1].modified).toBe(true);
  });

  it("lists scripts by use with readable names", () => {
    const subs = subsetsByUse(catalog.families);
    expect(subs[0].id).toBe("latin");
    expect(subsetLabel("cyrillic-ext")).toBe("Cyrillic Extended");
    expect(subsetLabel("chinese-simplified")).toBe("Chinese Simplified");
  });
});

describe("CSS", () => {
  it("builds css2 URLs for variable and static families", () => {
    expect(cssUrl(byName("Inter"))).toBe("https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,100..900;1,100..900&display=swap");
    expect(cssUrl(byName("Inter"), { weights: [600], italic: false })).toBe("https://fonts.googleapis.com/css2?family=Inter:wght@600&display=swap");
    expect(cssUrl(byName("Abel"))).toBe("https://fonts.googleapis.com/css2?family=Abel&display=swap");
    const lora: FontFamily = { ...byName("Lora"), axes: [], weights: [400, 700], italic: false };
    expect(cssUrl(lora)).toBe("https://fonts.googleapis.com/css2?family=Lora:wght@400;700&display=swap");
    expect(cssUrl(byName("Abel"), { text: "Hi!" })).toContain("&text=Hi!");
    expect(cssUrl(byName("Open Sans"))).toContain("family=Open+Sans:");
  });

  it("uses a category fallback in font-family", () => {
    expect(fontFamilyCss(byName("Lora"))).toBe('font-family: "Lora", serif;');
    expect(fontFamilyCss(byName("Caveat"))).toBe('font-family: "Caveat", cursive;');
  });

  it("previews at the nearest available weight", () => {
    expect(previewWeight(byName("Abel"), 700)).toBe(400);
    expect(previewWeight(byName("Inter"), 650)).toBe(650);
  });
});

describe("API items", () => {
  it("map variants, italics and axes", () => {
    const f = fromApi(
      { family: "Test Sans", category: "sans-serif", variants: ["regular", "italic", "700", "700italic"], subsets: ["latin"], lastModified: "2025-01-02", axes: [{ tag: "wght", start: 300, end: 800 }] },
      3,
    );
    expect(f).toEqual({ family: "Test Sans", category: "sans-serif", weights: [400, 700], italic: true, subsets: ["latin"], axes: [{ tag: "wght", min: 300, max: 800 }], modified: "2025-01-02", rank: 3 });
  });
});
