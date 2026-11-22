# Huetype

Pick colors and identify fonts from anywhere on your desktop. A Tauri v2 app for Windows 10/11 and macOS 11+ (Apple silicon) that lives in the system tray or menu bar.

Status: early development. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Install

Download the latest release from [Releases](https://github.com/subbutvl/colors-and-fonts/releases). Builds are not code-signed yet:

- **Windows:** run the `.exe`. If SmartScreen says "Windows protected your PC", choose **More info**, then **Run anyway**.
- **macOS:** open the `.dmg` and drag Huetype to Applications. The first launch is blocked; open **System Settings > Privacy & Security** and choose **Open Anyway**. The first pick asks for **Screen Recording** permission; turn Huetype on, then quit and reopen it.

Default shortcuts: Ctrl+Alt+C picks a color, Ctrl+Alt+F identifies a font, Ctrl+Alt+Space shows the toolbar (on a Mac: ⌃⌥C, ⌃⌥F, ⌃⌥Space). Change them in Settings.

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

## Run it on macOS

Prerequisites (one time): Xcode Command Line Tools (`xcode-select --install`), [Node.js](https://nodejs.org/) 20.19+ or 22.12+, and [Rust](https://www.rust-lang.org/tools/install).

```sh
npm install
npm run tauri dev
```

Huetype shows a Dock icon while its window is open and only a menu bar icon after you close the window; click the menu bar icon and choose **Quit Huetype** to exit. Picking needs Screen Recording permission (System Settings > Privacy & Security > Screen Recording). A dev build is a different app to macOS than an installed one, so it asks again.

Build a disk image:

```sh
npm run tauri build -- --bundles dmg
```

What to check on a real Mac: [docs/MACOS-TESTING.md](docs/MACOS-TESTING.md).
