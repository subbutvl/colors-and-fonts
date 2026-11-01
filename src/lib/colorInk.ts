import { contrast } from "./colors";

/** Near-black or white, whichever reads better on the swatch. */
export function colorSwatchInk(hex: string): string {
  return contrast("#111111", hex).ratio >= contrast("#FFFFFF", hex).ratio ? "#111111" : "#FFFFFF";
}
