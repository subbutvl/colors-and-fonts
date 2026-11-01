# Huetype

Pick colors and identify fonts from anywhere on your desktop. A Tauri v2 app that lives in the system tray.

Status: early development. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Run it on Windows

Prerequisites (one time):

1. [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (required by Vite 8)
2. [Rust](https://www.rust-lang.org/tools/install) (stable, MSVC toolchain)
3. Microsoft C++ Build Tools ("Desktop development with C++") and WebView2 (preinstalled on Windows 11). Full list: https://v2.tauri.app/start/prerequisites/

Then:

```powershell
npm install
npm run tauri dev
```

The first Rust build takes a few minutes. Closing the window hides Huetype to the tray; right click the tray icon and choose **Quit Huetype** to exit.

Build an installer:

```powershell
npm run tauri build
```
