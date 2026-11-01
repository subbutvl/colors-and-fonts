import { describe, expect, it, vi } from "vitest";
import { bundledCatalog, isStale, type Catalog } from "./fonts";
import { BODY_FONTS, COLLECTIONS, KNOWN_ALTERNATIVES, knownAlternatives, PAIRS, pairCss, suggestBodies, TOP_FALLBACK, topFonts, trendingFonts } from "./fontSets";

const catalog = bundledCatalog();
const names = new Set(catalog.families.map((f) => f.family));
const get = (name: string) => catalog.families.find((f) => f.family === name)!;

describe("curated data", () => {
  it("only names families that exist in the catalog", () => {
    const all = [
      ...TOP_FALLBACK,
      ...COLLECTIONS.flatMap((c) => c.fonts.map((f) => f.family)),
      ...PAIRS.flatMap((p) => [p.heading, p.body]),
      ...BODY_FONTS,
      ...KNOWN_ALTERNATIVES.flatMap((k) => k.alternatives),
    ];
    expect(all.filter((n) => !names.has(n))).toEqual([]);
  });

  it("has no duplicates inside a list", () => {
    expect(new Set(TOP_FALLBACK).size).toBe(TOP_FALLBACK.length);
    for (const c of COLLECTIONS) expect(new Set(c.fonts.map((f) => f.family)).size).toBe(c.fonts.length);
    expect(new Set(PAIRS.map((p) => `${p.heading}/${p.body}`)).size).toBe(PAIRS.length);
  });

  it("covers the collections the spec names", () => {
    expect(COLLECTIONS.map((c) => c.id)).toEqual(["ui", "editorial", "display", "code", "branding"]);
    expect(COLLECTIONS.find((c) => c.id === "code")!.fonts.every((f) => get(f.family).category === "monospace")).toBe(true);
  });
});

describe("known alternatives", () => {
  it("finds a system font regardless of case", () => {
    expect(knownAlternatives(" arial ")?.alternatives[0]).toBe("Arimo");
    expect(knownAlternatives("Segoe UI")?.alternatives).toContain("Open Sans");
    expect(knownAlternatives("Some Font")).toBeNull();
  });

  it("never lists a Google Font as needing an alternative", () => {
    expect(KNOWN_ALTERNATIVES.filter((k) => names.has(k.name))).toEqual([]);
  });
});

describe("top and trending", () => {
  it("uses the curated list without API ranks", () => {
    const { fonts, live } = topFonts(catalog.families, 5);
    expect(live).toBe(false);
    expect(fonts.map((f) => f.family)).toEqual(TOP_FALLBACK.slice(0, 5));
  });

  it("uses live ranks when the catalog has them", () => {
    const ranked = catalog.families.map((f) => (f.family === "Lora" ? { ...f, rank: 1, trend: 2 } : f.family === "Inter" ? { ...f, rank: 2, trend: 1 } : f));
    expect(topFonts(ranked).fonts.map((f) => f.family)).toEqual(["Lora", "Inter"]);
    expect(trendingFonts(ranked).fonts.map((f) => f.family)).toEqual(["Inter", "Lora"]);
  });

  it("falls back to recently updated for trending", () => {
    const { fonts, live } = trendingFonts(catalog.families, 10);
    expect(live).toBe(false);
    expect(fonts[0].modified >= fonts[9].modified).toBe(true);
  });

  it("marks an API catalog stale after a week", () => {
    const c: Catalog = { families: [], origin: "api", updated: "2026-10-20" };
    expect(isStale(c, new Date("2026-10-25T12:00:00Z"))).toBe(false);
    expect(isStale(c, new Date("2026-10-28T12:00:00Z"))).toBe(true);
    expect(isStale({ ...c, origin: "bundled" }, new Date("2030-01-01"))).toBe(false);
  });
});

describe("pairing", () => {
  it("puts curated pairs first", () => {
    const s = suggestBodies(get("Playfair Display"), catalog.families);
    expect(s[0].body.family).toBe("Source Sans 3");
    expect(s[0].pair).toBeDefined();
  });

  it("contrasts a serif heading with sans bodies", () => {
    const s = suggestBodies(get("Bitter"), catalog.families);
    expect(s.length).toBeGreaterThanOrEqual(5);
    expect(s.every((x) => x.body.category === "sans-serif")).toBe(true);
  });

  it("gives display and handwriting headings readable bodies", () => {
    for (const name of ["Lobster", "Caveat"]) {
      const s = suggestBodies(get(name), catalog.families);
      expect(s.length).toBeGreaterThan(4);
      expect(s.every((x) => ["sans-serif", "serif"].includes(x.body.category))).toBe(true);
      expect(s.some((x) => x.body.family === name)).toBe(false);
    }
  });

  it("builds one import for both families", () => {
    const css = pairCss(get("Playfair Display"), get("Source Sans 3"));
    expect(css).toContain("family=Playfair+Display:");
    expect(css).toContain("&family=Source+Sans+3:");
    expect(css).toContain('h1, h2, h3 { font-family: "Playfair Display", serif; }');
    expect(css).toContain('body { font-family: "Source Sans 3", sans-serif; }');
    expect(pairCss(get("Inter"), get("Inter")).match(/family=/g)).toHaveLength(1);
  });
});

describe("catalog refresh", () => {
  it("tells mounted pages when a refresh lands", async () => {
    const { onCatalogChanged, refreshCatalog } = await import("./fonts");
    const items = Array.from({ length: 120 }, (_, i) => ({ family: `Family ${i}`, category: "serif", variants: ["regular"], subsets: ["latin"], lastModified: "2026-01-01" }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const seen = vi.fn();
    const off = onCatalogChanged(seen);
    const fresh = await refreshCatalog("key");
    off();
    vi.unstubAllGlobals();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(fresh.families[0]).toMatchObject({ family: "Family 0", rank: 1, trend: 1 });
  });
});
