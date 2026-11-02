import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import { resolve } from "node:path";
// @ts-expect-error type error without @types/node package
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  // Three pages: the main window, the floating toolbar and the picker overlay.
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        toolbar: resolve(root, "toolbar.html"),
        overlay: resolve(root, "overlay.html"),
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    // An explicit IPv4 address: on some Windows setups "localhost" resolves
    // to ::1 while the dev server listens on 127.0.0.1 (or the other way
    // round), and the app window shows "localhost refused to connect".
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
