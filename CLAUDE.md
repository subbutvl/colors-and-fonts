# Huetype

Tauri v2 desktop app (Windows first) for picking colors and identifying fonts from anywhere on screen, plus 21 color, font and design-system reference sections.

- Feature spec: https://claude.ai/artifact/HdMre9X6c3rZEUFnwpSCvz
- UI mockups: https://claude.ai/artifact/2KLHspqnq7HtQUpy2mVyAf
- Roadmap and current step: `docs/ROADMAP.md` (read this first; it is the source of truth for what is done and what is next)

## Decisions (agreed with Subbu, 2026-11-01)

- Name **Huetype**. Theme: light and dark; default follows Windows. The floating picker toolbar and loupe are always dark.
- Frontend React + TypeScript + Vite. Backend Rust (Tauri v2).
- v1 targets **Windows 10/11 only**. Keep OS-specific code (screen capture, OCR, accessibility) behind a trait or `cfg` module so macOS/Linux can be added later.
- Pantone section = Color of the Year only, 2002 to 2026.
- Font identify is offline in v1 (no AI/cloud). Google Fonts only, with "closest alternative" wording for other fonts.
- One app window only (`main`). The picker toolbar and capture overlay are transient helper windows. Closing `main` hides it to the tray; Quit is in the tray menu.
- Default global shortcuts are **Ctrl+Alt+C** (pick color), **Ctrl+Alt+F** (identify font), **Ctrl+Alt+Space** (toolbar). Not Ctrl+Shift: Ctrl+Shift+C is browser DevTools. A shortcut another app owns is reported in Settings, never fatal. Users can rebind in Settings; choices are stored as `shortcut.<action>` settings rows and re-applied by the main window on load (`applySavedShortcuts`).
- Screen coordinates are physical pixels on the virtual desktop (same space as `cursor_position()`; monitors can have negative origins and different scale factors). Sampling captures only a small square around the point via xcap (GDI on Windows, default features off), never a full screen, and averages in sRGB (1, 3, 5 up to 25 px squares).
- Picking: each pick session hides our own windows, freezes every monitor (full capture), and covers each monitor with an overlay window `overlay-<n>` (created once, then hidden and reused). Click adds and keeps the session open (multi-pick); Shift+drag averages; arrows nudge 1 px (Shift 10); Enter picks; Esc, right-click or Alt+F4 ends. Picks are broadcast as `huetype://picked`.
- Pick history: the main window (always loaded, even hidden) records every pick in the SQLite `picks` table (kept to the newest 500), copies it in the copy format (`picker.format` setting: hex, rgb, hsl or oklch; changed from the toolbar's format chip), and refreshes the tray's "Recent colors" menu via `set_recent_picks`. Other windows only read history. Color math is culori (`src/lib/colors.ts`): nearest CSS name by CIEDE2000, WCAG 2 contrast.
- The toolbar window grows upward by `POPOVER_HEIGHT` while a swatch popover is open (`toolbar_popover`), so the pill never moves and no transparent area blocks clicks the rest of the time.
- Curated datasets are our own JSON in the repo; do not scrape colorsinspo.com or similar sites.

## How work is done

- Work in small steps, one branch and one PR per step: `phase-<n>/step-<m>-<slug>`.
- At the end of each step, tick it in `docs/ROADMAP.md` and add any new decision here.
- Before pushing: `npm run build` (tsc + vite), and `cargo clippy` + `cargo test` in `src-tauri`. CI runs the same on `windows-latest`.

## Layout

- `src/sections.ts`: the single list of all sections (sidebar, routing, placeholders read it).
- `src/pages/`: one component per section as they get built. `src/components/`: shared UI.
- `src/styles.css`: design tokens (light base, dark override) and app styles.
- `src/lib/`: frontend services. `db.ts` (shared SQLite connection), `settings.ts` (key/value settings, localStorage fallback outside Tauri), `autostart.ts`, `env.ts` (`isTauri()`).
- `src/SettingsContext.tsx`: settings state for the app, applies the theme.
- `toolbar.html` + `src/toolbar/`: the floating toolbar page (second Vite entry, always dark, own CSS). Its window is created in `src-tauri/src/toolbar.rs`; `capabilities/toolbar.json` scopes what it may call.
- `src-tauri/src/shortcuts.rs`: global shortcut registry (`shortcut_status`, `set_shortcut` commands; accelerators like `Ctrl+Alt+KeyC`). Frontend side: `src/lib/shortcuts.ts`, `src/components/ShortcutRow.tsx`.
- `src-tauri/src/capture/`: `mod.rs` has the `ScreenSource` trait (OS side; `XcapSource` today), `sample_point`, and the `color_at_point` / `color_at_cursor` commands. `sampler.rs` is pure pixel math (pixel, area average), unit tested. Building on Linux needs `libpipewire-0.3-dev` (xcap).
- `src-tauri/src/picker.rs`: the pick session (`start`, `finish`, overlay windows, `start_pick` / `overlay_*` commands, frame sent as binary: 20-byte header + RGBA). `overlay.html` + `src/overlay/` is the overlay page (third Vite entry, always dark; `pixels.ts` mirrors `sampler.rs`). `src/lib/picker.ts` is the frontend API (`startPick`, `onPick`, `onPickerError`).
- `src/lib/colors.ts` (formats, nearest name, contrast, copy format, clipboard), `src/lib/history.ts` (pick history), `src/usePickRecorder.ts` (main window recorder). Toolbar popover: `src/toolbar/Popover.tsx`.
- `src-tauri/src/lib.rs`: app setup, window behavior, `open_section()` (tray to page navigation via the `huetype://navigate` event). `tray.rs`: tray icon and menu. `db.rs`: SQLite migrations (append-only; add a new version, never edit a released one).

## Storage

- One SQLite file, `huetype.db`, in the app config dir. Schema changes go in `src-tauri/src/db.rs` as a new migration.
- Settings are key/value rows in `settings`. Launch-at-startup is not stored there: the OS autostart entry is the source of truth.
- Window position and size are remembered by tauri-plugin-window-state (position/size only, never visibility).
- The main window starts hidden (`visible: false`) and is shown in `setup` unless launched with `--hidden` (the autostart entry passes it).
