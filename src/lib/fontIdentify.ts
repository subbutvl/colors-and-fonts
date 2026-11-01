import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "./env";
import { FRAME_HEADER } from "./picker";

/** Must match `FONT_CAPTURED_EVENT` in src-tauri/src/picker.rs. */
export const FONT_CAPTURED_EVENT = "huetype://font-captured";

export interface OcrWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrLine {
  text: string;
  words: OcrWord[];
}

/** One font identify capture (see `FontCapture` in src-tauri/src/fontid/mod.rs). */
export interface FontCapture {
  x: number;
  y: number;
  width: number;
  height: number;
  ocr: { text: string; lines: OcrLine[]; language: string } | null;
  ocrError: string | null;
  exact: { name: string; size: number | null } | null;
  textHeight: number | null;
  elapsedMs: number;
}

/** Freeze the screen and let the user drag a box around text. */
export async function startFontPick(): Promise<void> {
  if (!isTauri()) throw new Error("Font identify works in the desktop app.");
  await invoke("start_font_pick");
}

export async function lastFontCapture(): Promise<FontCapture | null> {
  if (!isTauri()) return null;
  return invoke<FontCapture | null>("font_capture");
}

/** The captured pixels as ImageData. */
export async function fontCaptureImage(): Promise<ImageData> {
  const buf = await invoke<ArrayBuffer>("font_capture_image");
  const view = new DataView(buf);
  const w = view.getUint32(0, true);
  const h = view.getUint32(4, true);
  return new ImageData(new Uint8ClampedArray(buf, FRAME_HEADER, w * h * 4), w, h);
}

export function onFontCaptured(handler: (c: FontCapture) => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let cancelled = false;
  listen<FontCapture>(FONT_CAPTURED_EVENT, (e) => handler(e.payload)).then((fn) => (cancelled ? fn() : (unlisten = fn)));
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** Text smaller than this (px tall, per word box) reads poorly and matches roughly. */
export const SMALL_TEXT_PX = 14;

/** Plain-language notes on how much to trust a capture. */
export function captureNotes(c: FontCapture): string[] {
  const notes: string[] = [];
  if (c.ocrError) notes.push(c.ocrError);
  else if (!c.ocr?.text.trim()) notes.push("No text was found in the box. Select one line of text with a little space around it.");
  if (c.textHeight !== null && c.textHeight < SMALL_TEXT_PX) {
    notes.push(`The text is small (about ${Math.round(c.textHeight)} px tall), so results will be rough. Zoom in on the text and try again.`);
  }
  if ((c.ocr?.lines.length ?? 0) > 3) notes.push("Several lines were selected. One line in one style gives the best match.");
  return notes;
}
