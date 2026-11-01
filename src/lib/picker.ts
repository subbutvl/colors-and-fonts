import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "./env";

/** Must match the constants in src-tauri/src/picker.rs. */
export const PICKED_EVENT = "huetype://picked";
export const PICKER_FINISHED_EVENT = "huetype://picker-finished";
export const PICKER_ERROR_EVENT = "huetype://picker-error";
export const OVERLAY_OPEN_EVENT = "huetype://overlay-open";
/** Bytes before the RGBA pixels in an `overlay_frame` response. */
export const FRAME_HEADER = 20;

/** Mirrors `Pick` in src-tauri/src/picker.rs. */
export interface Pick {
  hex: string;
  r: number;
  g: number;
  b: number;
  /** Physical virtual-desktop pixels; top-left of the area for an average. */
  x: number;
  y: number;
  /** Averaged area in physical pixels (1 x 1 for a single pixel). */
  width: number;
  height: number;
}

/** Freeze the screens and open the picker (same as the Pick color shortcut). */
export function startPick(): Promise<void> {
  if (!isTauri()) return Promise.reject(new Error("The picker works in the desktop app only."));
  return invoke("start_pick");
}

/** Subscribe to picks from any monitor. Returns an unsubscribe function. */
export function onPick(handler: (pick: Pick) => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let cancelled = false;
  listen<Pick>(PICKED_EVENT, (e) => handler(e.payload)).then((fn) => (cancelled ? fn() : (unlisten = fn)));
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/**
 * Picker start-up failures (capture or window creation), wherever the pick was
 * started. Delivers a failure that happened before this page mounted, then
 * live ones. Returns an unsubscribe function.
 */
export function onPickerError(handler: (message: string) => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let cancelled = false;
  invoke<string | null>("take_picker_error")
    .then((m) => !cancelled && m && handler(m))
    .catch(() => {});
  listen<string>(PICKER_ERROR_EVENT, (e) => {
    handler(e.payload);
    // Already shown here; don't show it again on the next mount.
    invoke("take_picker_error").catch(() => {});
  }).then((fn) => (cancelled ? fn() : (unlisten = fn)));
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** A pick session ended (picked or cancelled). Returns an unsubscribe function. */
export function onPickerFinished(handler: () => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let cancelled = false;
  listen(PICKER_FINISHED_EVENT, () => handler()).then((fn) => (cancelled ? fn() : (unlisten = fn)));
  return () => {
    cancelled = true;
    unlisten?.();
  };
}
