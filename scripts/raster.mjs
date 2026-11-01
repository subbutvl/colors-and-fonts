// A small anti-aliased rasterizer for opentype.js glyph paths (nonzero fill,
// exact horizontal coverage, 4 sub-scanlines per pixel). Build-time only:
// the font index renders Google Fonts glyphs with it.

const SUB = 4;
const CURVE_STEPS = 12;

/** Path commands (y down) to polygon edges. */
function edges(commands) {
  const out = [];
  let sx = 0;
  let sy = 0;
  let x = 0;
  let y = 0;
  const line = (x1, y1) => {
    if (y1 !== y) out.push([x, y, x1, y1]);
    x = x1;
    y = y1;
  };
  for (const c of commands) {
    if (c.type === "M") {
      if (x !== sx || y !== sy) line(sx, sy);
      x = sx = c.x;
      y = sy = c.y;
    } else if (c.type === "L") line(c.x, c.y);
    else if (c.type === "Q") {
      const [x0, y0] = [x, y];
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        line(u * u * x0 + 2 * u * t * c.x1 + t * t * c.x, u * u * y0 + 2 * u * t * c.y1 + t * t * c.y);
      }
    } else if (c.type === "C") {
      const [x0, y0] = [x, y];
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        line(
          u * u * u * x0 + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          u * u * u * y0 + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        );
      }
    } else if (c.type === "Z") line(sx, sy);
  }
  if (x !== sx || y !== sy) line(sx, sy);
  return out;
}

/**
 * Renders the path into an ink map (see src/lib/glyphFeatures.ts) with a
 * 2 px margin. Returns null for an empty path (a space, or a missing glyph).
 */
export function rasterize(path) {
  const e = edges(path.commands);
  if (!e.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x0, y0, x1, y1] of e) {
    minX = Math.min(minX, x0, x1);
    maxX = Math.max(maxX, x0, x1);
    minY = Math.min(minY, y0, y1);
    maxY = Math.max(maxY, y0, y1);
  }
  const ox = Math.floor(minX) - 2;
  const oy = Math.floor(minY) - 2;
  const width = Math.ceil(maxX) - ox + 2;
  const height = Math.ceil(maxY) - oy + 2;
  const data = new Float32Array(width * height);
  // Edges by the pixel rows they cross, so each scanline checks only its own.
  const rows = Array.from({ length: height }, () => []);
  for (const edge of e) {
    const top = Math.max(0, Math.floor(Math.min(edge[1], edge[3]) - oy));
    const bottom = Math.min(height - 1, Math.floor(Math.max(edge[1], edge[3]) - oy));
    for (let r = top; r <= bottom; r++) rows[r].push(edge);
  }
  const xs = [];
  for (let row = 0; row < height; row++) {
    for (let s = 0; s < SUB; s++) {
      const sy = oy + row + (s + 0.5) / SUB;
      xs.length = 0;
      for (const [x0, y0, x1, y1] of rows[row]) {
        if ((sy >= y0 && sy < y1) || (sy >= y1 && sy < y0)) {
          xs.push([x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0) - ox, y1 > y0 ? 1 : -1]);
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a[0] - b[0]);
      let wind = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        wind += xs[i][1];
        if (wind === 0) continue;
        const a = Math.max(0, xs[i][0]);
        const b = Math.min(width, xs[i + 1][0]);
        if (b <= a) continue;
        const off = row * width;
        const pa = Math.floor(a);
        const pb = Math.floor(b);
        if (pa === pb) data[off + pa] += (b - a) / SUB;
        else {
          data[off + pa] += (pa + 1 - a) / SUB;
          for (let p = pa + 1; p < pb; p++) data[off + p] += 1 / SUB;
          if (pb < width) data[off + pb] += (b - pb) / SUB;
        }
      }
    }
  }
  for (let i = 0; i < data.length; i++) data[i] = Math.min(1, data[i]);
  return { width, height, data };
}
