/**
 * Glyph features for font matching, shared by the index build script
 * (`scripts/font-index.mjs`, which renders Google Fonts glyphs) and the app
 * (which measures letters cut from a screen capture). Both sides must
 * describe a letter the same way, so everything here works on an "ink map":
 * coverage from 0 (background) to 1 (fully inked), whatever the source.
 *
 * A letter is described by an 8 x 8 grid of average ink inside its ink box,
 * plus its width and height relative to the x-height of its line (log
 * ratios). The grid captures shape and stroke weight; the ratios capture
 * proportions (wide or condensed, tall ascenders, cap height).
 *
 * Kept free of DOM and imports so Node can load it directly.
 */

export const GRID = 8;
/** Letters the index stores, in index order. */
export const CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
/** Lowercase letters with no ascender or descender: their height is the x-height. */
export const XHEIGHT_CHARS = "acemnorsuvwxz";
/** Coverage at or above this counts as ink for boxes and letter splitting. */
export const INK_T = 0.35;

export interface InkMap {
  width: number;
  height: number;
  /** Row-major coverage, 0..1. */
  data: Float32Array;
}

/** Pixel box, end-exclusive. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GlyphFeature {
  /** GRID x GRID average ink, row-major, 0..1. */
  grid: Float32Array;
  /** ln(width / x-height). */
  aspect: number;
  /** ln(height / x-height). */
  height: number;
}

/** Tight box of pixels with ink at or above INK_T, or null when there are none. */
export function inkBox(ink: InkMap, within?: Box): Box | null {
  const b = within ?? { x0: 0, y0: 0, x1: ink.width, y1: ink.height };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = b.y0; y < b.y1; y++) {
    for (let x = b.x0; x < b.x1; x++) {
      if (ink.data[y * ink.width + x] >= INK_T) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x0 === Infinity ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * Size of the box with sub-pixel edges: the outermost row or column only
 * counts by its strongest coverage, so a 7 px letter and a 70 px letter of
 * the same font measure alike.
 */
export function inkSize(ink: InkMap, box: Box): { width: number; height: number } {
  const w = ink.width;
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;
  for (let y = box.y0; y < box.y1; y++) {
    left = Math.max(left, ink.data[y * w + box.x0]);
    right = Math.max(right, ink.data[y * w + box.x1 - 1]);
  }
  for (let x = box.x0; x < box.x1; x++) {
    top = Math.max(top, ink.data[box.y0 * w + x]);
    bottom = Math.max(bottom, ink.data[(box.y1 - 1) * w + x]);
  }
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  return {
    width: bw === 1 ? left : bw - 2 + left + right,
    height: bh === 1 ? top : bh - 2 + top + bottom,
  };
}

/** Weights of `n` source pixels for each of GRID cells (exact box filter). */
function cellWeights(n: number): Float32Array {
  const out = new Float32Array(GRID * n);
  const span = n / GRID;
  for (let c = 0; c < GRID; c++) {
    const a = c * span;
    const b = a + span;
    for (let p = Math.floor(a); p < Math.min(n, Math.ceil(b)); p++) {
      const overlap = Math.min(b, p + 1) - Math.max(a, p);
      if (overlap > 0) out[c * n + p] = overlap / span;
    }
  }
  return out;
}

/** Average ink of the box resampled to GRID x GRID cells. */
export function inkGrid(ink: InkMap, box: Box): Float32Array {
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  const wx = cellWeights(bw);
  const wy = cellWeights(bh);
  // Columns first: rows of the box reduced to GRID values each.
  const rows = new Float32Array(bh * GRID);
  for (let y = 0; y < bh; y++) {
    const off = (box.y0 + y) * ink.width + box.x0;
    for (let c = 0; c < GRID; c++) {
      let s = 0;
      for (let x = 0; x < bw; x++) s += wx[c * bw + x] * ink.data[off + x];
      rows[y * GRID + c] = s;
    }
  }
  const grid = new Float32Array(GRID * GRID);
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      let s = 0;
      for (let y = 0; y < bh; y++) s += wy[r * bh + y] * rows[y * GRID + c];
      grid[r * GRID + c] = Math.min(1, s);
    }
  }
  return grid;
}

export function glyphFeature(ink: InkMap, box: Box, xHeight: number): GlyphFeature {
  const size = inkSize(ink, box);
  return {
    grid: inkGrid(ink, box),
    aspect: Math.log(Math.max(size.width, 0.25) / xHeight),
    height: Math.log(Math.max(size.height, 0.25) / xHeight),
  };
}

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ------------------------------------------------------------- comparison

/** How much each part counts in the distance between two letters. */
export const WEIGHTS = { grid: 1, aspect: 0.6, height: 0.6 };

/** Distance between two letters: RMS grid difference plus proportion differences. */
export function glyphDistance(a: GlyphFeature, b: GlyphFeature): number {
  let s = 0;
  for (let i = 0; i < a.grid.length; i++) {
    const d = a.grid[i] - b.grid[i];
    s += d * d;
  }
  return (
    WEIGHTS.grid * Math.sqrt(s / a.grid.length) +
    WEIGHTS.aspect * Math.abs(a.aspect - b.aspect) +
    WEIGHTS.height * Math.abs(a.height - b.height)
  );
}

// ---------------------------------------------------------- index format

/**
 * Binary index layout (little endian):
 *   "HTFI", u8 version, u8 GRID, u8 glyph count, glyph chars (ASCII),
 *   u32 entry count, then per entry:
 *   u8 name length, name (UTF-8), u16 weight, then per glyph:
 *   u8 aspect, u8 height (0 = glyph missing), GRID*GRID/2 bytes of 4-bit grid.
 */
export const INDEX_VERSION = 1;
const ASPECT_RANGE = [-3, 2] as const;
const HEIGHT_RANGE = [-2, 2] as const;
const GLYPH_BYTES = 2 + (GRID * GRID) / 2;

const quant = (v: number, [lo, hi]: readonly [number, number]) => 1 + Math.round(((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 254);
const dequant = (q: number, [lo, hi]: readonly [number, number]) => lo + ((q - 1) / 254) * (hi - lo);

export interface IndexEntry {
  family: string;
  weight: number;
  /** One per CHARSET letter; null when the font has no such glyph. */
  glyphs: (GlyphFeature | null)[];
}

export function encodeGlyph(f: GlyphFeature | null, out: Uint8Array, at: number): void {
  if (!f) {
    out.fill(0, at, at + GLYPH_BYTES);
    return;
  }
  out[at] = quant(f.aspect, ASPECT_RANGE);
  out[at + 1] = quant(f.height, HEIGHT_RANGE);
  for (let i = 0; i < f.grid.length; i += 2) {
    const hi = Math.round(f.grid[i] * 15);
    const lo = Math.round(f.grid[i + 1] * 15);
    out[at + 2 + i / 2] = (hi << 4) | lo;
  }
}

export function decodeGlyph(buf: Uint8Array, at: number): GlyphFeature | null {
  if (buf[at] === 0) return null;
  const grid = new Float32Array(GRID * GRID);
  for (let i = 0; i < grid.length; i += 2) {
    const b = buf[at + 2 + i / 2];
    grid[i] = (b >> 4) / 15;
    grid[i + 1] = (b & 15) / 15;
  }
  return { grid, aspect: dequant(buf[at], ASPECT_RANGE), height: dequant(buf[at + 1], HEIGHT_RANGE) };
}

export function encodeIndex(entries: IndexEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const names = entries.map((e) => enc.encode(e.family));
  const size = 4 + 3 + CHARSET.length + 4 + names.reduce((s, n) => s + 1 + n.length + 2 + CHARSET.length * GLYPH_BYTES, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let p = 0;
  out.set(enc.encode("HTFI"), p);
  p += 4;
  out[p++] = INDEX_VERSION;
  out[p++] = GRID;
  out[p++] = CHARSET.length;
  out.set(enc.encode(CHARSET), p);
  p += CHARSET.length;
  view.setUint32(p, entries.length, true);
  p += 4;
  entries.forEach((e, i) => {
    out[p++] = names[i].length;
    out.set(names[i], p);
    p += names[i].length;
    view.setUint16(p, e.weight, true);
    p += 2;
    for (let g = 0; g < CHARSET.length; g++) {
      encodeGlyph(e.glyphs[g] ?? null, out, p);
      p += GLYPH_BYTES;
    }
  });
  return out;
}

/** A decoded index: names up front, letters read from the buffer on demand. */
export interface FontIndex {
  buf: Uint8Array;
  entries: { family: string; weight: number; at: number }[];
}

export function decodeIndex(buf: Uint8Array): FontIndex {
  const dec = new TextDecoder();
  if (dec.decode(buf.subarray(0, 4)) !== "HTFI") throw new Error("Not a font index");
  if (buf[4] !== INDEX_VERSION || buf[5] !== GRID) throw new Error("Font index version not supported");
  const n = buf[6];
  if (dec.decode(buf.subarray(7, 7 + n)) !== CHARSET) throw new Error("Font index letters differ");
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 7 + n;
  const count = view.getUint32(p, true);
  p += 4;
  const entries: FontIndex["entries"] = [];
  for (let i = 0; i < count; i++) {
    const len = buf[p++];
    const family = dec.decode(buf.subarray(p, p + len));
    p += len;
    const weight = view.getUint16(p, true);
    p += 2;
    entries.push({ family, weight, at: p });
    p += n * GLYPH_BYTES;
  }
  return { buf, entries };
}

/** Letter `charIndex` (position in CHARSET) of an entry, or null when the font lacks it. */
export function indexGlyph(index: FontIndex, entry: number, charIndex: number): GlyphFeature | null {
  return decodeGlyph(index.buf, index.entries[entry].at + charIndex * GLYPH_BYTES);
}
