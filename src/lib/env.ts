/** True inside the Tauri webview; false in a plain browser (vite dev/preview). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
