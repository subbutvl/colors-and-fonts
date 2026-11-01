import { describe, expect, it } from "vitest";
import {
  CHARSET,
  decodeIndex,
  encodeIndex,
  glyphDistance,
  glyphFeature,
  GRID,
  indexGlyph,
  inkBox,
  inkGrid,
  type InkMap,
  inkSize,
} from "./glyphFeatures";

function map(w: number, h: number, fill: (x: number, y: number) => number): InkMap {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = fill(x, y);
  return { width: w, height: h, data };
}

describe("ink measurement", () => {
  it("finds the tight ink box", () => {
    const ink = map(10, 10, (x, y) => (x >= 2 && x < 6 && y >= 3 && y < 9 ? 1 : 0));
    expect(inkBox(ink)).toEqual({ x0: 2, y0: 3, x1: 6, y1: 9 });
    expect(inkBox(map(4, 4, () => 0.1))).toBeNull();
  });

  it("measures partial edge pixels as fractions", () => {
    // 4 full columns plus a half-covered one on the right.
    const ink = map(8, 4, (x) => (x < 4 ? 1 : x === 4 ? 0.5 : 0));
    const box = inkBox(ink)!;
    expect(inkSize(ink, box).width).toBeCloseTo(4.5);
    expect(inkSize(ink, box).height).toBeCloseTo(4);
  });

  it("resamples to the grid with a box filter", () => {
    const full = map(5, 3, () => 1);
    expect([...inkGrid(full, { x0: 0, y0: 0, x1: 5, y1: 3 })].every((v) => Math.abs(v - 1) < 1e-6)).toBe(true);
    // Left half inked: left grid columns 1, right columns 0.
    const half = map(16, 16, (x) => (x < 8 ? 1 : 0));
    const g = inkGrid(half, { x0: 0, y0: 0, x1: 16, y1: 16 });
    expect(g[0]).toBeCloseTo(1);
    expect(g[GRID - 1]).toBeCloseTo(0);
  });

  it("describes the same shape alike at different sizes", () => {
    const ring = (s: number) => map(s, s, (x, y) => (x < s / 4 || x >= (3 * s) / 4 || y < s / 4 || y >= (3 * s) / 4 ? 1 : 0));
    const big = ring(64);
    const small = ring(16);
    const a = glyphFeature(big, inkBox(big)!, 64);
    const b = glyphFeature(small, inkBox(small)!, 16);
    expect(glyphDistance(a, b)).toBeLessThan(0.02);
    expect(a.aspect).toBeCloseTo(0);
  });
});

describe("index format", () => {
  it("round-trips entries within quantisation", () => {
    const ink = map(12, 20, (x, y) => (x + y) % 3 === 0 ? 1 : 0.2);
    const f = glyphFeature(ink, inkBox(ink)!, 10);
    const glyphs = [...CHARSET].map((_, i) => (i % 5 === 0 ? null : f));
    const buf = encodeIndex([
      { family: "Test Sans", weight: 400, glyphs },
      { family: "Tëst Serif", weight: 700, glyphs },
    ]);
    const index = decodeIndex(buf);
    expect(index.entries.map((e) => [e.family, e.weight])).toEqual([
      ["Test Sans", 400],
      ["Tëst Serif", 700],
    ]);
    expect(indexGlyph(index, 1, 0)).toBeNull();
    const back = indexGlyph(index, 1, 1)!;
    expect(glyphDistance(back, f)).toBeLessThan(0.05);
    expect(back.aspect).toBeCloseTo(f.aspect, 1);
  });

  it("rejects other files", () => {
    expect(() => decodeIndex(new Uint8Array([1, 2, 3, 4, 5, 6, 7]))).toThrow();
  });
});
