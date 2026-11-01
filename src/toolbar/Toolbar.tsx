import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../lib/env";
import { FORMAT_LABELS, FORMATS, getCopyFormat, onCopyFormat, setCopyFormat, type ColorFormat } from "../lib/colors";
import { onHistoryChanged, recentPicks } from "../lib/history";
import { onPick } from "../lib/picker";
import { AppIcon, CloseIcon, DropperIcon, FontIcon, HistoryIcon, PlusIcon } from "./icons";
import { Popover } from "./Popover";

/** Must match `ACTION_EVENT` in src-tauri/src/toolbar.rs. */
const ACTION_EVENT = "huetype://toolbar-action";
/** Must match `POPOVER_CLOSED_EVENT` in src-tauri/src/toolbar.rs. */
const POPOVER_CLOSED_EVENT = "huetype://toolbar-popover-closed";
/** Swatch slots on the pill. */
const SLOTS = 3;

/** Only identify_font flashes now: pick_color opens the picker instead. */
type Action = "pick_color" | "identify_font";

const call = (cmd: string, args?: Record<string, unknown>) => {
  if (isTauri()) invoke(cmd, args).catch((e) => console.error(cmd, e));
};

/**
 * Floating picker toolbar (always dark, see CLAUDE.md): the latest picks as
 * swatches (click for details), pick, copy format, history, open and hide.
 */
export function Toolbar() {
  const [flash, setFlash] = useState<Action | null>(null);
  const [swatches, setSwatches] = useState<string[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [format, setFormat] = useState<ColorFormat>("hex");

  const reload = useCallback(() => {
    // Browser preview (no app): sample swatches so the layout can be checked.
    if (!isTauri()) return setSwatches(["#5B6CFF", "#F2C94C", "#1F8A70"]);
    recentPicks(SLOTS)
      .then((rows) => setSwatches(rows.map((r) => r.hex)))
      .catch((e) => console.error("recent picks", e));
  }, []);

  useEffect(() => {
    reload();
    getCopyFormat().then(setFormat);
    const offPick = onPick((p) => setSwatches((prev) => [p.hex, ...prev].slice(0, SLOTS)));
    const offHistory = onHistoryChanged(reload);
    const offFormat = onCopyFormat(setFormat);
    return () => {
      offPick();
      offHistory();
      offFormat();
    };
  }, [reload]);

  // Font identify shows the toolbar and briefly highlights its button.
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

  // The window grows upwards while the popover is open (see toolbar.rs).
  const showPopover = useCallback((index: number | null) => {
    setOpen(index);
    call("toolbar_popover", { open: index !== null });
  }, []);

  // A new pick moves the swatches, so close the popover. So do Esc and
  // clicking away from the toolbar.
  useEffect(() => onPick(() => showPopover(null)), [showPopover]);
  // Rust shrank the window itself (toolbar hidden): forget the popover.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen(POPOVER_CLOSED_EVENT, () => setOpen(null)).then((fn) => (cancelled ? fn() : (unlisten = fn)));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && showPopover(null);
    const onBlur = () => showPopover(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [open, showPopover]);

  const cycleFormat = () => {
    const next = FORMATS[(FORMATS.indexOf(format) + 1) % FORMATS.length];
    setFormat(next);
    setCopyFormat(next).catch((e) => console.error("format", e));
  };

  return (
    <div className="stage">
      {open !== null && swatches[open] && <Popover hex={swatches[open]} onClose={() => showPopover(null)} />}
      <div className="toolbar" role="toolbar" aria-label="Huetype picker toolbar">
        <span className="handle" data-tauri-drag-region title="Drag to move" />
        <div className="swatches" data-tauri-drag-region>
          {Array.from({ length: SLOTS }, (_, i) =>
            swatches[i] ? (
              <button
                key={i}
                type="button"
                className={`tb-btn swatch${open === i ? " on" : ""}`}
                style={{ background: swatches[i] }}
                title={`${swatches[i]}: details and copy`}
                aria-label={`Picked color ${swatches[i]}`}
                aria-expanded={open === i}
                onClick={() => showPopover(open === i ? null : i)}
              />
            ) : (
              <button
                key={i}
                type="button"
                className="tb-btn slot"
                title="Pick a color"
                aria-label="Empty slot: pick a color"
                onClick={() => call("start_pick")}
              >
                <PlusIcon />
              </button>
            ),
          )}
        </div>
        <span className="divider" data-tauri-drag-region />
        <button type="button" className="tb-btn" title="Pick color" aria-label="Pick color" onClick={() => call("start_pick")}>
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
        <button type="button" className="tb-btn" title="Pick history" aria-label="Pick history" onClick={() => call("open_history")}>
          <HistoryIcon />
        </button>
        <button
          type="button"
          className="fmt"
          title="Copy format for picks (click to change)"
          aria-label={`Copy format: ${FORMAT_LABELS[format]}. Click to change.`}
          onClick={cycleFormat}
        >
          {FORMAT_LABELS[format]}
        </button>
        <span className="divider" data-tauri-drag-region />
        <button type="button" className="tb-btn" title="Open Huetype" aria-label="Open Huetype" onClick={() => call("open_main_window")}>
          <AppIcon />
        </button>
        <button type="button" className="tb-btn" title="Hide toolbar" aria-label="Hide toolbar" onClick={() => call("hide_toolbar")}>
          <CloseIcon />
        </button>
      </div>
      {flash === "identify_font" && (
        <p className="hint" role="status">
          Font identify arrives in Phase 3
        </p>
      )}
    </div>
  );
}
