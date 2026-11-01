import {
  CHARSET,
  decodeIndex,
  type FontIndex,
  type GlyphFeature,
  glyphDistance,
  glyphFeature,
  indexGlyph,
  INK_T,
  type InkMap,
  inkBox,
  inkSize,
  median,
  XHEIGHT_CHARS,
} from "./glyphFeatures.ts";

/**
 * Offline font matching: cut the captured words into letters (OCR says
 * which letter each one is), describe them like the index does, and rank
 * index fonts by how close their letters are. See glyphFeatures.ts.
 */

/** RGBA pixels (ImageData or anything shaped like it). */
export interface Pixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface WordBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One measured letter. */
export interface Letter {
  char: string;
  box: { x0: number; y0: number; x1: number; y1: number };
  feature: GlyphFeature;
}

export interface Measured {
  letters: Letter[];
  /** Words whose ink did not split into one piece per letter (touching letters, ligatures). */
  skippedWords: number;
  /** Words found on a background too close to the text color. */
  lowContrast: number;
  /** Median x-height of the letters, in capture pixels. */
  xHeight: number | null;
  /** Light text on a dark background. */
  inverted: boolean;
}

/** Fewer distinct letters than this and a ranking means little. */
export const MIN_LETTERS = 4;

const lum = (d: ArrayLike<number>, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

interface Component {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  label: number;
}

/**
 * Ink map of a region: background is the median of the region's border,
 * text is the far end of the brightness range from it. Returns null when
 * the two are too close to tell apart.
 */
function regionInk(img: Pixels, x0: number, y0: number, w: number, h: number): { ink: InkMap; inverted: boolean } | null {
  const L = new Float32Array(w * h);
  const border: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = lum(img.data, ((y0 + y) * img.width + x0 + x) * 4);
      L[y * w + x] = v;
      if (y === 0 || x === 0 || y === h - 1 || x === w - 1) border.push(v);
    }
  }
  const bg = median(border);
  const sorted = Float32Array.from(L).sort();
  const dark = sorted[Math.floor(sorted.length * 0.02)];
  const light = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))];
  const inverted = light - bg > bg - dark;
  const fg = inverted ? light : dark;
  if (Math.abs(fg - bg) < 40) return null;
  const data = new Float32Array(w * h);
  for (let i = 0; i < L.length; i++) data[i] = Math.min(1, Math.max(0, (L[i] - bg) / (fg - bg)));
  return { ink: { width: w, height: h, data }, inverted };
}

/** 8-connected pieces of ink at or above `t`; `labels` gets 1-based piece numbers. */
function components(ink: InkMap, labels: Int32Array, t: number): Component[] {
  const { width: w, height: h, data } = ink;
  const out: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < data.length; start++) {
    if (data[start] < t || labels[start]) continue;
    const label = out.length + 1;
    const c: Component = { x0: w, y0: h, x1: 0, y1: 0, label };
    labels[start] = label;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      if (x < c.x0) c.x0 = x;
      if (y < c.y0) c.y0 = y;
      if (x + 1 > c.x1) c.x1 = x + 1;
      if (y + 1 > c.y1) c.y1 = y + 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (!labels[q] && data[q] >= t) {
            labels[q] = label;
            stack.push(q);
          }
        }
      }
    }
    out.push(c);
  }
  return out;
}

/** Connectivity thresholds tried in turn when splitting a word into letters. */
const SPLIT_THRESHOLDS = [INK_T, 0.15, 0.6];

/** Pieces of ink grouped into letters, left to right. */
function letterGroups(comps: Component[], want: number): Component[][] {
  if (!comps.length) return [];
  // Dots, accents and other small pieces join the letter below or above them.
  const tall = median(comps.map((c) => c.y1 - c.y0));
  const groups: Component[][] = [];
  const small: Component[] = [];
  for (const c of comps) {
    if (c.y1 - c.y0 < tall * 0.45) small.push(c);
    else groups.push([c]);
  }
  const span = (g: Component[]) => [Math.min(...g.map((c) => c.x0)), Math.max(...g.map((c) => c.x1))] as const;
  for (const s of small) {
    let best: Component[] | null = null;
    let bestOverlap = 0;
    for (const g of groups) {
      const [gx0, gx1] = span(g);
      const overlap = Math.min(gx1, s.x1) - Math.max(gx0, s.x0);
      if (overlap > bestOverlap && overlap >= (s.x1 - s.x0) * 0.5) {
        best = g;
        bestOverlap = overlap;
      }
    }
    if (best) best.push(s);
    else groups.push([s]); // punctuation: a letter of its own
  }
  groups.sort((a, b) => span(a)[0] - span(b)[0]);
  // A letter broken in two side by side pieces that overlap: join the most
  // overlapping neighbours until the count fits.
  while (groups.length > want) {
    let at = -1;
    let most = 0;
    for (let i = 0; i < groups.length - 1; i++) {
      const [a0, a1] = span(groups[i]);
      const [b0, b1] = span(groups[i + 1]);
      const overlap = (Math.min(a1, b1) - Math.max(a0, b0)) / Math.min(a1 - a0, b1 - b0);
      if (overlap > most) {
        most = overlap;
        at = i;
      }
    }
    if (at < 0 || most < 0.3) break;
    groups.splice(at, 2, [...groups[at], ...groups[at + 1]]);
  }
  return groups;
}

/** Faint edge pixels (below `t`) belong to the piece they touch; marked negative. */
function assignEdges(ink: InkMap, labels: Int32Array, t: number): void {
  const { width: w, height: h } = ink;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (labels[i] || ink.data[i] <= 0) continue;
      for (let dy = -1; dy <= 1 && !labels[i]; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const l = labels[ny * w + nx];
          if (l > 0 && ink.data[ny * w + nx] >= t) {
            labels[i] = -l;
            break;
          }
        }
      }
    }
  }
}

interface Piece {
  char: string;
  box: { x0: number; y0: number; x1: number; y1: number };
  ink: InkMap;
}

/** Split one word into one ink map per letter, or null when the pieces do not line up with the text. */
function splitWord(img: Pixels, word: WordBox): { pieces: Piece[]; inverted: boolean } | "contrast" | null {
  const padX = Math.max(1, Math.round(word.height * 0.08));
  const padY = Math.max(1, Math.round(word.height * 0.15));
  const x0 = Math.max(0, Math.floor(word.x) - padX);
  const y0 = Math.max(0, Math.floor(word.y) - padY);
  const x1 = Math.min(img.width, Math.ceil(word.x + word.width) + padX);
  const y1 = Math.min(img.height, Math.ceil(word.y + word.height) + padY);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 3 || h < 3) return null;
  const region = regionInk(img, x0, y0, w, h);
  if (!region) return "contrast";
  const { ink } = region;
  // Pieces from the neighbouring words that the padding let in are dropped.
  const inWord = (c: Component) => {
    const cx = x0 + (c.x0 + c.x1) / 2;
    return cx >= word.x && cx <= word.x + word.width;
  };
  const chars = [...word.text].filter((c) => !/\s/.test(c));
  // Hairlines of small serif text break apart at the usual threshold and
  // tight letters touch: try a lower, then a higher threshold if the count is off.
  let found: { groups: Component[][]; labels: Int32Array } | null = null;
  for (const t of SPLIT_THRESHOLDS) {
    const labels = new Int32Array(w * h);
    const groups = letterGroups(components(ink, labels, t).filter(inWord), chars.length);
    if (groups.length === chars.length) {
      assignEdges(ink, labels, t);
      found = { groups, labels };
      break;
    }
  }
  if (!found) return null;
  const { groups, labels } = found;

  const pieces = groups.map((g, gi) => {
    const own = new Set(g.map((c) => c.label));
    const data = new Float32Array(w * h);
    for (let i = 0; i < data.length; i++) {
      const l = Math.abs(labels[i]);
      if (own.has(l)) data[i] = ink.data[i];
    }
    const box = {
      x0: Math.min(...g.map((c) => c.x0)),
      y0: Math.min(...g.map((c) => c.y0)),
      x1: Math.max(...g.map((c) => c.x1)),
      y1: Math.max(...g.map((c) => c.y1)),
    };
    const pieceInk = { width: w, height: h, data };
    const tight = inkBox(pieceInk, box) ?? box;
    return { char: chars[gi], box: { x0: tight.x0 + x0, y0: tight.y0 + y0, x1: tight.x1 + x0, y1: tight.y1 + y0 }, ink: pieceInk, local: tight };
  });
  return {
    pieces: pieces.map((p) => ({ char: p.char, box: p.box, ink: cropInk(p.ink, p.local) })),
    inverted: region.inverted,
  };
}

/** The box's part of an ink map, with a 1 px empty margin. */
function cropInk(ink: InkMap, b: { x0: number; y0: number; x1: number; y1: number }): InkMap {
  const w = b.x1 - b.x0 + 2;
  const h = b.y1 - b.y0 + 2;
  const data = new Float32Array(w * h);
  for (let y = b.y0; y < b.y1; y++) {
    for (let x = b.x0; x < b.x1; x++) data[(y - b.y0 + 1) * w + (x - b.x0 + 1)] = ink.data[y * ink.width + x];
  }
  return { width: w, height: h, data };
}

/** Cut the captured words into letters and describe each one. */
export function measureLetters(img: Pixels, words: WordBox[]): Measured {
  const pieces: Piece[] = [];
  let skippedWords = 0;
  let lowContrast = 0;
  let invertedVotes = 0;
  let splitWords = 0;
  for (const word of words) {
    if (!word.text.trim()) continue;
    const r = splitWord(img, word);
    if (r === "contrast") lowContrast++;
    else if (!r) skippedWords++;
    else {
      pieces.push(...r.pieces);
      splitWords++;
      if (r.inverted) invertedVotes++;
    }
  }
  const heights = pieces.filter((p) => XHEIGHT_CHARS.includes(p.char)).map((p) => inkSize(p.ink, inkBox(p.ink)!).height);
  const xHeight = heights.length ? median(heights) : null;
  const letters: Letter[] = [];
  if (xHeight) {
    for (const p of pieces) {
      if (!CHARSET.includes(p.char)) continue;
      const box = inkBox(p.ink);
      if (box) letters.push({ char: p.char, box: p.box, feature: glyphFeature(p.ink, box, xHeight) });
    }
  }
  return { letters, skippedWords, lowContrast, xHeight, inverted: invertedVotes * 2 > splitWords };
}

/** Average of each letter's occurrences: repeated letters steady the measurement. */
export function averageLetters(letters: Letter[]): Map<string, GlyphFeature> {
  const sums = new Map<string, { grid: Float32Array; aspect: number; height: number; n: number }>();
  for (const l of letters) {
    let s = sums.get(l.char);
    if (!s) sums.set(l.char, (s = { grid: new Float32Array(l.feature.grid.length), aspect: 0, height: 0, n: 0 }));
    for (let i = 0; i < s.grid.length; i++) s.grid[i] += l.feature.grid[i];
    s.aspect += l.feature.aspect;
    s.height += l.feature.height;
    s.n++;
  }
  const out = new Map<string, GlyphFeature>();
  for (const [c, s] of sums) out.set(c, { grid: s.grid.map((v) => v / s.n), aspect: s.aspect / s.n, height: s.height / s.n });
  return out;
}

export interface Match {
  family: string;
  weight: number;
  /** Mean letter distance; lower is closer. */
  distance: number;
  /** Letters compared. */
  letters: number;
}

/**
 * Popular families win near-ties: many families copy their Latin letters
 * from a popular one (Heebo from Roboto, Khula from Open Sans), and the
 * popular original is the likelier answer.
 */
export const PREFER_FACTOR = 0.95;

/** Index fonts ranked by distance to the measured letters, one entry per family. */
export function rankFonts(index: FontIndex, letters: Map<string, GlyphFeature>, limit = 8, prefer?: Set<string>): Match[] {
  const wanted = [...letters.keys()].map((c) => [CHARSET.indexOf(c), letters.get(c)!] as const).filter(([i]) => i >= 0);
  const best = new Map<string, Match>();
  index.entries.forEach((e, ei) => {
    let sum = 0;
    let n = 0;
    for (const [ci, f] of wanted) {
      const g = indexGlyph(index, ei, ci);
      if (!g) continue;
      sum += glyphDistance(f, g);
      n++;
    }
    // A font missing most of the letters cannot be judged on them.
    if (n < Math.max(1, wanted.length * 0.75)) return;
    const m = { family: e.family, weight: e.weight, distance: (sum / n) * (prefer?.has(e.family) ? PREFER_FACTOR : 1), letters: n };
    const prev = best.get(e.family);
    if (!prev || m.distance < prev.distance) best.set(e.family, m);
  });
  return [...best.values()].sort((a, b) => a.distance - b.distance).slice(0, limit);
}

export type Confidence = "likely" | "possible" | "alternative";

/**
 * Distances under these read as a likely or possible match. Small text
 * measures noisier, so the limits grow as the x-height (px) shrinks. Tuned
 * on text rendered in Chromium at 14 to 40 px: the right family scores
 * about 0.08 to 0.11 at 40 px and 0.2 to 0.29 at 14 px.
 */
export const likelyLimit = (xHeight: number) => 0.09 + 0.6 / xHeight;
export const possibleLimit = (xHeight: number) => 0.16 + 1.0 / xHeight;

/**
 * Plain label for a match. "Likely" also needs a clear lead over the next
 * family, since near-identical families (Roboto and Heebo share most
 * letters) cannot be told apart from a few words.
 */
export function confidence(m: Match, next: Match | undefined, letterCount: number, xHeight: number): Confidence {
  if (letterCount < MIN_LETTERS) return "alternative";
  const lead = next ? next.distance / m.distance : Infinity;
  if (m.distance < likelyLimit(xHeight) && lead > 1.05) return "likely";
  if (m.distance < possibleLimit(xHeight)) return "possible";
  return "alternative";
}

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  likely: "Likely match",
  possible: "Possible match",
  alternative: "Closest alternative",
};

// ------------------------------------------------------------- the index

let indexPromise: Promise<FontIndex> | null = null;

/** The bundled index (public/font-index.bin), fetched once. */
export function loadFontIndex(): Promise<FontIndex> {
  indexPromise ??= fetch(`${import.meta.env.BASE_URL}font-index.bin`)
    .then((r) => {
      if (!r.ok) throw new Error(`Font index not found (HTTP ${r.status})`);
      return r.arrayBuffer();
    })
    .then((b) => decodeIndex(new Uint8Array(b)));
  indexPromise.catch(() => (indexPromise = null));
  return indexPromise;
}

export interface Identified {
  measured: Measured;
  /** Distinct letters compared. */
  letterCount: number;
  matches: (Match & { confidence: Confidence })[];
  /** Fonts in the index. */
  indexSize: number;
}

/** Measure the captured words and rank the index against them. */
export function identify(index: FontIndex, img: Pixels, words: WordBox[], { limit = 6, prefer }: { limit?: number; prefer?: Set<string> } = {}): Identified {
  const measured = measureLetters(img, words);
  const letters = averageLetters(measured.letters);
  const ranked = letters.size ? rankFonts(index, letters, limit, prefer) : [];
  const xh = measured.xHeight ?? 1;
  const matches = ranked.map((m, i) => ({
    ...m,
    // Only the leader can be "likely"; the rest are possible only when close to it.
    confidence:
      i === 0
        ? confidence(m, ranked[1], letters.size, xh)
        : m.distance < possibleLimit(xh) && m.distance < ranked[0].distance * 1.25 && letters.size >= MIN_LETTERS
          ? ("possible" as const)
          : ("alternative" as const),
  }));
  return { measured, letterCount: letters.size, matches, indexSize: new Set(index.entries.map((e) => e.family)).size };
}
