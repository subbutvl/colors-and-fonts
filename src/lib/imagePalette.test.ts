import { describe, expect, it } from "vitest";
import { differenceCiede2000 } from "culori";
import { extract, sample } from "./imagePalette";

const dE = differenceCiede2000();

/** Image made of vertical bands: [hex, width] pairs. */
function bands(spec: [string, number][], height = 20, alpha = 255) {
  const width = spec.reduce((s, [, w]) => s + w, 0);
  const data = new Uint8ClampedArray(width * height * 4);
  let x0 = 0;
  for (const [hex, w] of spec) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    for (let y = 0; y < height; y++)
      for (let x = x0; x < x0 + w; x++) data.set([r, g, b, alpha], (y * width + x) * 4);
    x0 += w;
  }
  return { data, width, height };
}

describe("extract", () => {
  it("finds the bands, biggest first, with their shares", () => {
    const img = bands([
      ["#E5484D", 50],
      ["#1F9D55", 30],
      ["#5B6CFF", 20],
    ]);
    const out = extract(img, 3);
    expect(out).toHaveLength(3);
    expect(dE(out[0].hex, "#E5484D")).toBeLessThan(1);
    expect(dE(out[1].hex, "#1F9D55")).toBeLessThan(1);
    expect(dE(out[2].hex, "#5B6CFF")).toBeLessThan(1);
    expect(out[0].share).toBeCloseTo(0.5, 1);
    expect(out.reduce((s, e) => s + e.share, 0)).toBeCloseTo(1, 5);
  });

  it("points each marker at a pixel of its color", () => {
    const img = bands([
      ["#000000", 10],
      ["#FFFFFF", 10],
      ["#FF0000", 10],
    ]);
    for (const e of extract(img, 3)) {
      const band = Math.floor(e.x / 10);
      expect(e.hex).toBe(["#000000", "#FFFFFF", "#FF0000"][band]);
    }
  });

  it("returns fewer colors when the image has fewer", () => {
    const out = extract(bands([["#123456", 40]]), 5);
    expect(out).toHaveLength(1);
    expect(out[0].hex).toBe("#123456");
    expect(out[0].share).toBe(1);
  });

  it("ignores transparent pixels", () => {
    expect(extract(bands([["#123456", 40]], 10, 0), 3)).toEqual([]);
  });

  it("is repeatable", () => {
    const img = bands([
      ["#E5484D", 13],
      ["#F2C94C", 17],
      ["#1F9D55", 9],
      ["#5B6CFF", 21],
      ["#8E4EC6", 7],
    ]);
    expect(extract(img, 4)).toEqual(extract(img, 4));
  });
});

describe("sample", () => {
  it("caps the number of pixels", () => {
    const big = bands([["#808080", 400]], 300);
    expect(sample(big, 1000).length).toBeLessThanOrEqual(1100);
    expect(sample(big, 1000).length).toBeGreaterThan(800);
  });
});
