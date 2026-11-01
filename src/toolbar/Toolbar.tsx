import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../lib/env";
import { AppIcon, CloseIcon, DropperIcon, FontIcon, HistoryIcon, PlusIcon } from "./icons";

/** Must match `ACTION_EVENT` in src-tauri/src/toolbar.rs. */
const ACTION_EVENT = "huetype://toolbar-action";

type Action = "pick_color" | "identify_font";

/**
 * Floating picker toolbar (always dark, see CLAUDE.md). Step 0.3 is the shell:
 * it moves, hides and opens the app. Picking is wired up in Phase 1.
 */
export function Toolbar() {
  const [flash, setFlash] = useState<Action | null>(null);

  // A pick/identify shortcut shows the toolbar and briefly highlights its button.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    let timer: number | undefined;
    listen<Action>(ACTION_EVENT, (e) => {
      setFlash(e.payload);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setFlash(null), 1600);
    }).then((fn) => (cancelled ? fn() : (unlisten = fn)));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unlisten?.();
    };
  }, []);

  const call = (cmd: string) => {
    if (isTauri()) invoke(cmd).catch((e) => console.error(cmd, e));
  };

  return (
    <div className="stage">
      <div className="toolbar" role="toolbar" aria-label="Huetype picker toolbar">
        <span className="handle" data-tauri-drag-region title="Drag to move" />
        <div className="swatches" data-tauri-drag-region>
          {[0, 1, 2].map((i) => (
            <button key={i} type="button" className="tb-btn slot" disabled title="Pick a color (coming in Phase 1)" aria-label="Empty color slot">
              <PlusIcon />
            </button>
          ))}
        </div>
        <span className="divider" data-tauri-drag-region />
        <button
          type="button"
          className={`tb-btn${flash === "pick_color" ? " flash" : ""}`}
          disabled
          title="Pick color (coming in Phase 1)"
          aria-label="Pick color"
        >
          <DropperIcon />
        </button>
        <button
          type="button"
          className={`tb-btn${flash === "identify_font" ? " flash" : ""}`}
          disabled
          title="Identify font (coming in Phase 3)"
          aria-label="Identify font"
        >
          <FontIcon />
        </button>
        <button type="button" className="tb-btn" disabled title="Pick history (coming in Phase 1)" aria-label="Pick history">
          <HistoryIcon />
        </button>
        <span className="fmt" title="Copy format (coming in Phase 1)">HEX</span>
        <span className="divider" data-tauri-drag-region />
        <button type="button" className="tb-btn" title="Open Huetype" aria-label="Open Huetype" onClick={() => call("open_main_window")}>
          <AppIcon />
        </button>
        <button type="button" className="tb-btn" title="Hide toolbar" aria-label="Hide toolbar" onClick={() => call("hide_toolbar")}>
          <CloseIcon />
        </button>
      </div>
      {flash && (
        <p className="hint" role="status">
          {flash === "pick_color" ? "Color picking arrives in Phase 1" : "Font identify arrives in Phase 3"}
        </p>
      )}
    </div>
  );
}
