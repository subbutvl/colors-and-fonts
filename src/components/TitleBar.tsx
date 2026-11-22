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
 * its title bar: drag area, the two pick modes, minimize and close. The
 * window has a fixed size (1400 x 1000), so there is no maximize. Close hides
 * to the tray (Rust handles CloseRequested). Outside Tauri only the brand and
 * modes show.
 */
export function TitleBar({ onError }: { onError: (message: string) => void }) {
  const desktop = isTauri();
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
