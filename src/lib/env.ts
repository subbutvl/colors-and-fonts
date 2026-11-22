/** True inside the Tauri webview; false in a plain browser (vite dev/preview). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** True on macOS (the webview's user agent says "Macintosh"). */
export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/.test(navigator.platform || navigator.userAgent);
}
