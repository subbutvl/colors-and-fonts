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
- `src-tauri/src/lib.rs`: app setup, window behavior, `open_section()` (tray to page navigation via the `huetype://navigate` event). `tray.rs`: tray icon and menu. `db.rs`: SQLite migrations (append-only; add a new version, never edit a released one).

## Storage

- One SQLite file, `huetype.db`, in the app config dir. Schema changes go in `src-tauri/src/db.rs` as a new migration.
- Settings are key/value rows in `settings`. Launch-at-startup is not stored there: the OS autostart entry is the source of truth.
- Window position and size are remembered by tauri-plugin-window-state (position/size only, never visibility).
- The main window starts hidden (`visible: false`) and is shown in `setup` unless launched with `--hidden` (the autostart entry passes it).
