# Huetype roadmap

Each step is one PR. Tick a step when its PR is merged.

## Phase 0: App shell
- [x] 0.1 Scaffold Tauri v2 + React/TS, tray icon and menu, single main window that hides to tray, single instance, sidebar with all 21 sections as placeholders, light/dark following Windows
- [x] 0.2 Settings and storage: SQLite (tauri-plugin-sql) with migrations, settings page (theme, launch at startup), move theme pref out of localStorage
- [x] 0.3 Global shortcuts (Ctrl+Alt+C / F / Space) and the floating toolbar window shell: frameless, always on top, draggable, remembers position, shown/hidden from tray and shortcut

## Phase 1: Color picker
- [x] 1.0 Rebindable shortcuts in Settings (store in SQLite, re-register live)
- [x] 1.1 Windows screen capture (xcap) per monitor with per-monitor DPI mapping; Rust command that returns the color at a point; unit tests for sampling
- [x] 1.2 Capture overlay per monitor: frozen screenshot, loupe (11x11 at 10x), click adds, arrow nudge, Shift+drag average, Esc ends
- [x] 1.3 Toolbar swatches and multi-pick, swatch popover (formats, copy, nearest name, contrast), format toggle, pick history in SQLite, tray "Recent"
- [x] 1.4 Color engine (culori) + Converter (14) + HTML color names (13)
- [x] 1.5 Contrast (3): WCAG 2.2 + APCA, suggest nearest passing color; Picker home with recent picks

## Phase 2: Color tools
- [x] 2.1 Palettes (1): generate, lock, harmony modes, save
- [x] 2.2 Scales (2): OKLCH 50 to 950
- [x] 2.3 Color pairing (6)
- [x] 2.4 Color blindness (5): simulations and situational cases
- [x] 2.5 CSS generator (10): CSS vars, Tailwind v3/v4, Material 3, SCSS, tokens JSON
- [x] 2.6 Image palette (11): drop/paste/screen-grab, k-means in OKLab
- [x] 2.7 Saved library: star colors (recent picks, toolbar popover, Converter), Saved page with colors, notes and palettes, JSON export

## Phase 3: Fonts
- [x] 3.1 Google Fonts catalog (bundled snapshot, optional API-key refresh cached in SQLite); Font listing (15) with filters, live previews, copy CSS; starred fonts in Saved
- [x] 3.2 Top fonts (16), Curated fonts (18), Font pairing (17): curated top list or live popularity and trending (API key, weekly refresh), five collections, 30 curated pairs plus contrast rules
- [x] 3.3 Font identify capture: region select on overlay, Windows OCR (Windows.Media.Ocr), UI Automation exact-name lookup
- [x] 3.4 Font matching index (pre-rendered Google Fonts features) and results card with confidence labels

## Phase 4: Content
- [x] 4.1 Pantone Color of the Year 2002 to 2026 (4)
- [x] 4.2 Curated colors (7) and Brand colors (8)
- [x] 4.3 Gradients (9): curated set and editor
- [x] 4.4 Guess the color game (12)
- [x] 4.5 Design systems hub, curated list and my design systems CRUD (19 to 21)

## Phase 5: Release
- [x] 5.1 App icon and branding (icon set from `scripts/app-icon.cjs`, sidebar mark, favicon, installer metadata)
- [ ] 5.2 Windows installer (NSIS/MSI) built and attached to a GitHub release by a workflow on version tags
- [ ] 5.3 Auto-updater (tauri-plugin-updater, signed update manifest on GitHub releases)
- [ ] 5.4 Code signing: unsigned for now (decided 2026-11-01); revisit Azure Trusted Signing or an OV certificate later
