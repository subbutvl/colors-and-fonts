import { differenceCiede2000 } from "culori";
import { describe, expect, it } from "vitest";
import { filterTopPalettes, TOP_PALETTE_TAGS, TOP_PALETTES } from "./topPalettes";

const de = differenceCiede2000();

describe("top palettes", () => {
  it("has 100 named five-color palettes with known tags", () => {
    expect(TOP_PALETTES).toHaveLength(100);
    expect(new Set(TOP_PALETTES.map((p) => p.id)).size).toBe(100);
    expect(new Set(TOP_PALETTES.map((p) => p.name)).size).toBe(100);
    for (const p of TOP_PALETTES) {
      expect(p.colors).toHaveLength(5);
      for (const c of p.colors) expect(c).toMatch(/^#[0-9A-F]{6}$/);
      expect(p.tags.length).toBeGreaterThan(0);
      for (const t of p.tags) expect(TOP_PALETTE_TAGS).toContain(t);
    }
  });

  it("keeps the colors inside each palette apart", () => {
    for (const p of TOP_PALETTES)
      for (let i = 0; i < 5; i++)
        for (let j = i + 1; j < 5; j++) expect(de(p.colors[i], p.colors[j]), `${p.name} ${p.colors[i]} ${p.colors[j]}`).toBeGreaterThan(4);
  });

  it("filters by tag and searches names and hex", () => {
    expect(filterTopPalettes("", "retro").every((p) => p.tags.includes("retro"))).toBe(true);
    expect(filterTopPalettes("sunset").map((p) => p.id)).toContain("sunset-boulevard");
    expect(filterTopPalettes("#ffe3b3").map((p) => p.id)).toContain("sunset-boulevard");
    expect(filterTopPalettes("", null)).toHaveLength(100);
  });
});
