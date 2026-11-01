import { formatHex, oklab } from "culori";
import { seeded, type Rand } from "./palette";

/**
 * Main colors of an image by k-means in OKLab, so clusters group colors the
 * way people see them. Pure: works on raw RGBA pixels, seedable for tests.
 */
export interface Pixels {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

export interface Extracted {
  hex: string;
  /** Share of the (opaque) image, 0 to 1. */
  share: number;
  /** A pixel close to the cluster centre, for a marker on the image. */
  x: number;
  y: number;
}

export const MIN_K = 3;
/** Same as the Palettes maximum, so a result can be saved as a palette. */
export const MAX_K = 8;
/** Pixels sampled at most; plenty for a stable palette and fast enough to run on every change. */
export const SAMPLE_LIMIT = 12000;

interface Sample {
  l: number;
  a: number;
  b: number;
  x: number;
  y: number;
}

const toLab = (r: number, g: number, b: number) => {
  const c = oklab({ mode: "rgb", r: r / 255, g: g / 255, b: b / 255 })!;
  return { l: c.l, a: c.a ?? 0, b: c.b ?? 0 };
};

/** Evenly spaced opaque pixels, at most `limit`. */
export function sample(px: Pixels, limit = SAMPLE_LIMIT): Sample[] {
  const total = px.width * px.height;
  const step = Math.max(1, Math.sqrt(total / limit));
  const out: Sample[] = [];
  for (let fy = 0; fy < px.height; fy += step) {
    const y = Math.floor(fy);
    for (let fx = 0; fx < px.width; fx += step) {
      const x = Math.floor(fx);
      const i = (y * px.width + x) * 4;
      if (px.data[i + 3] < 128) continue;
      out.push({ ...toLab(px.data[i], px.data[i + 1], px.data[i + 2]), x, y });
    }
  }
  return out;
}

const dist2 = (p: { l: number; a: number; b: number }, q: { l: number; a: number; b: number }) =>
  (p.l - q.l) ** 2 + (p.a - q.a) ** 2 + (p.b - q.b) ** 2;

/** k-means++ seeding: spread the first centres out. */
function seedCentres(points: Sample[], k: number, rand: Rand) {
  const centres = [{ ...points[Math.floor(rand() * points.length)] }];
  const d = points.map((p) => dist2(p, centres[0]));
  while (centres.length < k) {
    const sum = d.reduce((s, v) => s + v, 0);
    if (sum === 0) break; // fewer distinct colors than k
    let r = rand() * sum;
    let idx = 0;
    while (idx < d.length - 1 && (r -= d[idx]) > 0) idx++;
    centres.push({ ...points[idx] });
    points.forEach((p, i) => (d[i] = Math.min(d[i], dist2(p, centres[centres.length - 1]))));
  }
  return centres;
}

export function extract(px: Pixels, k: number, rand: Rand = seeded(1)): Extracted[] {
  const points = sample(px);
  if (!points.length) return [];
  const n = Math.min(MAX_K, Math.max(MIN_K, Math.round(k)));
  let centres = seedCentres(points, n, rand);
  const assign = new Int32Array(points.length);

  for (let iter = 0; iter < 24; iter++) {
    let moved = false;
    points.forEach((p, i) => {
      let best = 0;
      let bd = Infinity;
      centres.forEach((c, j) => {
        const v = dist2(p, c);
        if (v < bd) {
          bd = v;
          best = j;
        }
      });
      if (assign[i] !== best) moved = true;
      assign[i] = best;
    });
    const sums = centres.map(() => ({ l: 0, a: 0, b: 0, n: 0 }));
    points.forEach((p, i) => {
      const s = sums[assign[i]];
      s.l += p.l;
      s.a += p.a;
      s.b += p.b;
      s.n++;
    });
    centres = centres.map((c, j) => (sums[j].n ? { ...c, l: sums[j].l / sums[j].n, a: sums[j].a / sums[j].n, b: sums[j].b / sums[j].n } : c));
    if (!moved && iter > 0) break; // assignments settled
  }

  const counts = centres.map(() => 0);
  const nearest = centres.map(() => ({ d: Infinity, x: 0, y: 0 }));
  points.forEach((p, i) => {
    const j = assign[i];
    counts[j]++;
    const v = dist2(p, centres[j]);
    if (v < nearest[j].d) nearest[j] = { d: v, x: p.x, y: p.y };
  });

  return centres
    .map((c, j) => ({
      hex: formatHex({ mode: "oklab", l: c.l, a: c.a, b: c.b }).toUpperCase(),
      share: counts[j] / points.length,
      x: nearest[j].x,
      y: nearest[j].y,
    }))
    .filter((e) => e.share > 0)
    .sort((a, b) => b.share - a.share);
}
