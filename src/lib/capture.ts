import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./env";

/** Mirrors `ColorSample` in src-tauri/src/capture/mod.rs. */
export interface ColorSample {
  hex: string;
  rgb: { r: number; g: number; b: number };
  /** Physical virtual-desktop pixels. */
  x: number;
  y: number;
  sampleSize: number;
  monitor: { name: string; x: number; y: number; width: number; height: number; scaleFactor: number };
  elapsedMs: number;
}

/** Sizes offered for averaging (1 = single pixel). */
export const SAMPLE_SIZES = [1, 3, 5] as const;

/** Color under the mouse cursor anywhere on the desktop. */
export async function colorAtCursor(sampleSize = 1): Promise<ColorSample> {
  if (!isTauri()) throw new Error("Screen sampling works in the desktop app only.");
  return invoke<ColorSample>("color_at_cursor", { sampleSize });
}

/** Color at a physical virtual-desktop point. */
export async function colorAtPoint(x: number, y: number, sampleSize = 1): Promise<ColorSample> {
  if (!isTauri()) throw new Error("Screen sampling works in the desktop app only.");
  return invoke<ColorSample>("color_at_point", { x, y, sampleSize });
}
