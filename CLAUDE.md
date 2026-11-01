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
- Converter: input is anything CSS parses plus bare hex and `r, g, b` triplets. Colors outside sRGB keep their exact Lab/LCH/OKLab/OKLCH/P3 values; sRGB-based formats (HEX, RGB, HSL, HWB, HSV, CMYK) show the color gamut-mapped by reducing OKLCH chroma, and the page says so. HSV and CMYK are labelled "not CSS"; CMYK is the naive device-independent formula.
- Contrast: WCAG 2.2 ratio (culori) and APCA-W3 0.0.98G-4g (own implementation in `src/lib/contrast.ts`, tested against the published reference values). "Nearest passing color" moves one color's OKLCH lightness (hue kept, chroma clamped to sRGB) by binary search, for text or background, lighter or darker.
- Palettes: generated in OKLCH (`src/lib/palette.ts`, pure and seedable): harmony sets hue offsets, lightness runs dark to light so every palette has contrast inside it, chroma is tapered at the extremes and clamped to sRGB. The first locked color anchors hue and chroma. 3 to 8 colors; Space generates (not while typing or on a button). Saved palettes are rows in the SQLite `palettes` table (migration 3, colors as a JSON hex array; `src/lib/palettes.ts`).
- Scales: `src/lib/scale.ts` makes 50 to 950 in OKLCH from per-step lightness and relative-chroma tables shaped like Tailwind's. The base color is kept exactly at the step with the nearest lightness; other steps are shifted by its lightness offset, fading to zero at both ends, so the scale stays monotonic. Chroma is clamped to sRGB. Yellows (hue 50 to 115) lean darker steps towards orange. Default name is the Tailwind hue family. Export: CSS vars, Tailwind v4 `@theme`, Tailwind v3 config, JSON, values in HEX or OKLCH.
- Color pairing: `src/lib/pairing.ts`, seven pairings (complementary, analogous, split, triadic, square, rectangle, monochromatic). Default wheel is OKLCH (partners keep the base's lightness and chroma, clamped to sRGB); an HSL wheel toggle gives the classic answers (red pairs with cyan). Grays get a note, since they have no hue.
- Color blindness: `src/lib/vision.ts`. Protan/deutan/tritan use the Machado 2009 full-severity matrices in linear sRGB; lower severity (anomalous trichromacy) blends with identity. Achromatopsia and grayscale print keep luminance only. Situations (dim screen, glare, night light) are labelled approximations. Two colors "look the same" under CIEDE2000 5 and are "hard to tell apart" under 11. Input is 2 to 8 colors; with exactly 2 the page also shows text contrast.
- CSS generator: `src/lib/cssgen.ts`. Up to 6 named colors (first = primary, second = accent role), each gets a scale; optional neutral is a gray tinted with the primary hue. Semantic roles are shadcn-style names (background, foreground, primary, primary-foreground, secondary, accent, muted, border, ring, ...) for light and dark; dark applies with `prefers-color-scheme` or a `.dark` class. Formats: CSS vars, Tailwind v4 `@theme`, Tailwind v3 config (a role named like a scale becomes its `DEFAULT`), SCSS, W3C DTCG tokens JSON, Material 3 roles (tones are exact CIELAB L* like HCT; hue and chroma from CIELCh, not CAM16).
- Image palette: `src/lib/imagePalette.ts`, k-means (k-means++ seeding, seeded) in OKLab on at most 12,000 evenly spaced opaque pixels of the image scaled to 1200 px; 3 to 8 colors (8 = Palettes max, so results save as a palette). Sources: drop, paste, file, or `grab_screen` (Rust, `picker.rs`: hides our windows, captures the monitor under the main window via `capture_monitor_at`, same binary frame as the overlay). Images never leave the machine.
- Saved library: `src/lib/library.ts`. Starred colors are rows in the SQLite `saved_colors` table (migration 4, hex unique and uppercase, optional note up to 200 chars); saved palettes stay in `palettes`. Any window may star (the toolbar popover too); every change to either table broadcasts `huetype://library-changed` so open pages refresh (`src/useStarred.ts`, `components/StarButton.tsx`). The Saved page opens a palette in Palettes through a one-shot localStorage key (`requestOpenPalette` / `takeOpenRequest`). "Copy library as JSON" exports `{app, version: 1, colors, palettes}`. Gradients and fonts join the library when their sections exist.
- Curated datasets are our own JSON in the repo; do not scrape colorsinspo.com or similar sites.

## How work is done

- Work in small steps, one branch and one PR per step: `phase-<n>/step-<m>-<slug>`.
- At the end of each step, tick it in `docs/ROADMAP.md` and add any new decision here.
- Before pushing: `npm run build` (tsc + vite), `npm test` (vitest, `src/**/*.test.ts`), and `cargo clippy` + `cargo test` in `src-tauri`. CI runs the same on `windows-latest`.

## Layout

- `src/sections.ts`: the single list of all sections (sidebar, routing, placeholders read it).
- `src/pages/`: one component per section as they get built (`PickerHome`, `ContrastPage`, `ConverterPage`, `ColorNamesPage`, `PalettesPage`, `ScalesPage`, `PairingPage`, `VisionPage`, `CssGeneratorPage`, `ImagePalettePage`, `SavedPage`, `SettingsPage`), routed in `src/App.tsx`; `components/PageHead.tsx` renders the numbered title. `src/components/`: shared UI.
- `src/styles.css`: design tokens (light base, dark override) and app styles.
- `src/lib/`: frontend services. `db.ts` (shared SQLite connection), `settings.ts` (key/value settings, localStorage fallback outside Tauri), `autostart.ts`, `env.ts` (`isTauri()`).
- `src/SettingsContext.tsx`: settings state for the app, applies the theme.
- `toolbar.html` + `src/toolbar/`: the floating toolbar page (second Vite entry, always dark, own CSS). Its window is created in `src-tauri/src/toolbar.rs`; `capabilities/toolbar.json` scopes what it may call.
- `src-tauri/src/shortcuts.rs`: global shortcut registry (`shortcut_status`, `set_shortcut` commands; accelerators like `Ctrl+Alt+KeyC`). Frontend side: `src/lib/shortcuts.ts`, `src/components/ShortcutRow.tsx`.
- `src-tauri/src/capture/`: `mod.rs` has the `ScreenSource` trait (OS side; `XcapSource` today), `sample_point`, and the `color_at_point` / `color_at_cursor` commands. `sampler.rs` is pure pixel math (pixel, area average), unit tested. Building on Linux needs `libpipewire-0.3-dev` (xcap).
- `src-tauri/src/picker.rs`: the pick session (`start`, `finish`, overlay windows, `start_pick` / `overlay_*` commands, frame sent as binary: 20-byte header + RGBA). `overlay.html` + `src/overlay/` is the overlay page (third Vite entry, always dark; `pixels.ts` mirrors `sampler.rs`). `src/lib/picker.ts` is the frontend API (`startPick`, `onPick`, `onPickerError`).
- `src/lib/colors.ts` (formats, nearest name, contrast, copy format, clipboard, `parseColor` / `convert` for the Converter, `NAMED_COLORS`), `src/lib/history.ts` (pick history), `src/lib/palette.ts` (palette generator, export) `src/lib/palettes.ts` (saved palettes), `src/lib/scale.ts` (scales), `src/lib/pairing.ts` (color pairing), `src/lib/vision.ts` (color blindness), `src/lib/cssgen.ts` (CSS generator), `src/lib/imagePalette.ts` (image palette), `src/lib/library.ts` (starred colors, library events, export), `src/usePickRecorder.ts` (main window recorder). Toolbar popover: `src/toolbar/Popover.tsx`.
- `src-tauri/src/lib.rs`: app setup, window behavior, `open_section()` (tray to page navigation via the `huetype://navigate` event). `tray.rs`: tray icon and menu. `db.rs`: SQLite migrations (append-only; add a new version, never edit a released one).

## Storage

- One SQLite file, `huetype.db`, in the app config dir. Schema changes go in `src-tauri/src/db.rs` as a new migration.
- Settings are key/value rows in `settings`. Launch-at-startup is not stored there: the OS autostart entry is the source of truth.
- Window position and size are remembered by tauri-plugin-window-state (position/size only, never visibility).
- The main window starts hidden (`visible: false`) and is shown in `setup` unless launched with `--hidden` (the autostart entry passes it).
