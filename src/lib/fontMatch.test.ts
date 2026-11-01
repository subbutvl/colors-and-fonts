import { describe, expect, it } from "vitest";
import { CHARSET, decodeIndex, encodeIndex, glyphFeature, type GlyphFeature, inkBox, type InkMap } from "./glyphFeatures";
import { averageLetters, confidence, measureLetters, type Pixels, rankFonts } from "./fontMatch";

/** A toy "font": each letter is a set of rectangles in x-height units (y down from the x-height line). */
type Shape = [x: number, y: number, w: number, h: number][];
type ToyFont = Record<string, { width: number; rects: Shape }>;

const BLOCK: ToyFont = {
  x: { width: 1, rects: [[0, 0, 1, 1]] },
  o: { width: 1, rects: [[0, 0, 1, 0.25], [0, 0.75, 1, 0.25], [0, 0, 0.25, 1], [0.75, 0, 0.25, 1]] },
  i: { width: 0.25, rects: [[0, 0, 0.25, 1], [0, -0.5, 0.25, 0.25]] },
  n: { width: 0.9, rects: [[0, 0, 0.25, 1], [0.65, 0, 0.25, 1], [0, 0, 0.9, 0.25]] },
};
const THIN: ToyFont = {
  x: { width: 0.7, rects: [[0, 0, 0.7, 1]] },
  o: { width: 0.7, rects: [[0, 0, 0.7, 0.1], [0, 0.9, 0.7, 0.1], [0, 0, 0.1, 1], [0.6, 0, 0.1, 1]] },
  i: { width: 0.1, rects: [[0, 0, 0.1, 1], [0, -0.4, 0.1, 0.12]] },
  n: { width: 0.6, rects: [[0, 0, 0.1, 1], [0.5, 0, 0.1, 1], [0, 0, 0.6, 0.1]] },
};

/** Paint words in a toy font; returns pixels and OCR-like word boxes. */
function paint(font: ToyFont, words: string[], xh: number, { dark = "#111", light = "#fafafa", gap = 0.3 } = {}) {
  const W = 400;
  const H = Math.ceil(xh * 3);
  const fg = parseInt(dark.slice(1), 16) & 0xff;
  const bg = parseInt(light.slice(1), 16) & 0xff;
  const data = new Uint8ClampedArray(W * H * 4).fill(bg);
  const top = Math.round(xh);
  let pen = 4;
  const boxes = [];
  for (const word of words) {
    const start = pen;
    for (const c of word) {
      for (const [rx, ry, rw, rh] of font[c].rects) {
        for (let y = Math.round(top + ry * xh); y < Math.round(top + (ry + rh) * xh); y++)
          for (let x = Math.round(pen + rx * xh); x < Math.round(pen + (rx + rw) * xh); x++) {
            const i = (y * W + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = fg;
          }
      }
      pen += (font[c].width + gap) * xh;
    }
    boxes.push({ text: word, x: start, y: top - xh * 0.6, width: pen - gap * xh - start, height: xh * 1.7 });
    pen += xh;
  }
  return { img: { width: W, height: H, data } as Pixels, boxes };
}

/** Index entry for a toy font, rendered big like the build script does. */
function entry(family: string, font: ToyFont) {
  const xh = 48;
  const glyphs: (GlyphFeature | null)[] = [...CHARSET].map((c) => {
    const g = font[c];
    if (!g) return null;
    const w = Math.ceil(g.width * xh) + 4;
    const h = Math.ceil(2 * xh);
    const data = new Float32Array(w * h);
    for (const [rx, ry, rw, rh] of g.rects)
      for (let y = Math.round(xh + ry * xh); y < Math.round(xh + (ry + rh) * xh); y++)
        for (let x = Math.round(2 + rx * xh); x < Math.round(2 + (rx + rw) * xh); x++) data[y * w + x] = 1;
    const ink: InkMap = { width: w, height: h, data };
    return glyphFeature(ink, inkBox(ink)!, xh);
  });
  return { family, weight: 400, glyphs };
}

const index = decodeIndex(encodeIndex([entry("Block", BLOCK), entry("Thin", THIN)]));

describe("measureLetters", () => {
  it("cuts words into letters and joins the dot of i", () => {
    const { img, boxes } = paint(BLOCK, ["nix", "oxo"], 20);
    const m = measureLetters(img, boxes);
    expect(m.letters.map((l) => l.char).join("")).toBe("nixoxo");
    expect(m.skippedWords).toBe(0);
    expect(m.xHeight).toBeCloseTo(20, 0);
    const i = m.letters.find((l) => l.char === "i")!;
    expect(i.box.y1 - i.box.y0).toBeGreaterThan(25); // stem plus dot
  });

  it("skips a word whose pieces do not match its text", () => {
    const { img, boxes } = paint(BLOCK, ["nix"], 20);
    const m = measureLetters(img, [{ ...boxes[0], text: "nixx" }]);
    expect(m.letters).toEqual([]);
    expect(m.skippedWords).toBe(1);
  });

  it("reads light text on a dark background", () => {
    const { img, boxes } = paint(BLOCK, ["onion"], 16, { dark: "#f0f0f0", light: "#202020" });
    const m = measureLetters(img, boxes);
    expect(m.inverted).toBe(true);
    expect(m.letters).toHaveLength(5);
  });

  it("reports text too close to its background", () => {
    const { img, boxes } = paint(BLOCK, ["onion"], 16, { dark: "#777777", light: "#808080" });
    expect(measureLetters(img, boxes).lowContrast).toBe(1);
  });
});

describe("rankFonts", () => {
  it.each([
    [BLOCK, "Block", 24],
    [THIN, "Thin", 24],
    [BLOCK, "Block", 9],
    [THIN, "Thin", 12],
  ] as const)("ranks the right toy font first (%#)", (font, family, xh) => {
    const { img, boxes } = paint(font, ["onion", "xi"], xh);
    const letters = averageLetters(measureLetters(img, boxes).letters);
    const ranked = rankFonts(index, letters);
    expect(ranked[0].family).toBe(family);
    expect(ranked[0].distance).toBeLessThan(ranked[1].distance);
  });

  it("labels confidence from distance, lead and letter count", () => {
    const m = { family: "A", weight: 400, distance: 0.1, letters: 8 };
    expect(confidence(m, { ...m, family: "B", distance: 0.3 }, 8, 20)).toBe("likely");
    expect(confidence(m, { ...m, family: "B", distance: 0.102 }, 8, 20)).toBe("possible");
    expect(confidence(m, undefined, 2, 20)).toBe("alternative");
    expect(confidence({ ...m, distance: 0.5 }, undefined, 8, 20)).toBe("alternative");
    // The same distance is a likely match for small text, a possible one for large text.
    expect(confidence({ ...m, distance: 0.15 }, undefined, 8, 8)).toBe("likely");
    expect(confidence({ ...m, distance: 0.15 }, undefined, 8, 30)).toBe("possible");
  });
});
