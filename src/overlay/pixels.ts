/**
 * Pixel reads on the frozen frame. Same rules as src-tauri/src/capture/sampler.rs:
 * sRGB values, area averages rounded half up, out-of-frame pixels ignored.
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hex({ r, g, b }: Rgb): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function pixel(img: ImageData, x: number, y: number): Rgb | null {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
  const i = (y * img.width + x) * 4;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] };
}

/** Mean of the inclusive rectangle (x0, y0)-(x1, y1), clipped to the frame. */
export function averageRect(img: ImageData, x0: number, y0: number, x1: number, y1: number): Rgb | null {
  const left = Math.max(0, Math.min(x0, x1));
  const top = Math.max(0, Math.min(y0, y1));
  const right = Math.min(img.width - 1, Math.max(x0, x1));
  const bottom = Math.min(img.height - 1, Math.max(y0, y1));
  if (left > right || top > bottom) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let y = top; y <= bottom; y++) {
    let i = (y * img.width + left) * 4;
    for (let x = left; x <= right; x++, i += 4) {
      r += img.data[i];
      g += img.data[i + 1];
      b += img.data[i + 2];
    }
  }
  const n = (right - left + 1) * (bottom - top + 1);
  const mean = (s: number) => Math.floor((s + Math.floor(n / 2)) / n);
  return { r: mean(r), g: mean(g), b: mean(b) };
}
