import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../lib/env";
import { startPick } from "../lib/picker";
import { startFontPick } from "../lib/fontIdentify";
import { DropperIcon, FontIcon } from "../toolbar/icons";

const stroke = {
  viewBox: "0 0 10 10",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1,
  "aria-hidden": true,
} as const;

/**
 * The main window has no system frame (`decorations: false`), so this bar is
 * its title bar: drag area (double-click maximizes), the two pick modes, and
 * minimize, maximize and close. Close hides to the tray like before (Rust
 * handles CloseRequested). Outside Tauri only the brand and modes show.
 */
export function TitleBar({ onError }: { onError: (message: string) => void }) {
  const desktop = isTauri();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    const sync = () => win.isMaximized().then((m) => !cancelled && setMaximized(m)).catch(() => {});
    sync();
    win.onResized(sync).then((fn) => (cancelled ? fn() : (unlisten = fn)));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [desktop]);

  const run = (start: () => Promise<void>) => () => {
    start().catch((e) => onError(e instanceof Error ? e.message : String(e)));
  };
  const win = () => getCurrentWindow();

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="brand" data-tauri-drag-region>
        <span className="brand-mark" aria-hidden="true" />
        Huetype
      </div>
      <div className="titlebar-modes">
        <button type="button" className="titlebar-mode" onClick={run(startPick)} title="Pick a color from the screen">
          <DropperIcon />
          <span>Pick color</span>
        </button>
        <button type="button" className="titlebar-mode" onClick={run(startFontPick)} title="Identify a font on the screen">
          <FontIcon />
          <span>Identify font</span>
        </button>
      </div>
      <div className="titlebar-drag" data-tauri-drag-region />
      {desktop && (
        <div className="titlebar-controls">
          <button type="button" className="titlebar-btn" onClick={() => void win().minimize()} aria-label="Minimize" title="Minimize">
            <svg {...stroke}>
              <path d="M0 5.5h10" />
            </svg>
          </button>
          <button
            type="button"
            className="titlebar-btn"
            onClick={() => void win().toggleMaximize()}
            aria-label={maximized ? "Restore" : "Maximize"}
            title={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? (
              <svg {...stroke}>
                <path d="M2.5 2.5V.5h7v7h-2" />
                <rect x=".5" y="2.5" width="7" height="7" />
              </svg>
            ) : (
              <svg {...stroke}>
                <rect x=".5" y=".5" width="9" height="9" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="titlebar-btn close"
            onClick={() => void win().close()}
            aria-label="Close to the tray"
            title="Close (Huetype keeps running in the tray)"
          >
            <svg {...stroke}>
              <path d="m.5.5 9 9M9.5.5l-9 9" />
            </svg>
          </button>
        </div>
      )}
    </header>
  );
}
