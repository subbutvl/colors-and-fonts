import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../lib/env";
import { FORMAT_LABELS, FORMATS, getCopyFormat, onCopyFormat, setCopyFormat, type ColorFormat } from "../lib/colors";
import { onHistoryChanged, recentPicks } from "../lib/history";
import { onPick } from "../lib/picker";
import { useStarred } from "../useStarred";
import { ValueCard } from "../picker-ui/ValueCard";
import { AppIcon, CloseIcon, DropperIcon, FontIcon, HistoryIcon, PlusIcon, StarIcon } from "./icons";

/** Must match `POPOVER_CLOSED_EVENT` in src-tauri/src/toolbar.rs. */
const POPOVER_CLOSED_EVENT = "huetype://toolbar-popover-closed";
/** Swatch slots on the pill. Must fit `WIDTH` in src-tauri/src/toolbar.rs. */
const SLOTS = 5;
/** Card width (valueCard.css) and the margin it keeps from the window edges. */
const CARD_WIDTH = 248;
const CARD_MARGIN = 8;
/** Hover delays, ms. */
const OPEN_DELAY = 120;
const CLOSE_DELAY = 260;

const call = (cmd: string, args?: Record<string, unknown>) => {
  if (isTauri()) invoke(cmd, args).catch((e) => console.error(cmd, e));
};

/**
 * Floating picker toolbar (always dark, see CLAUDE.md): the latest picks as
 * swatches (hover or click for values to copy and a link to Color details),
 * pick, copy format, history, open and hide.
 */
export function Toolbar() {
  const [swatches, setSwatches] = useState<string[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [format, setFormat] = useState<ColorFormat>("hex");
  /** The popover opens below the pill when the toolbar is near the screen top. */
  const [below, setBelow] = useState(false);
  /** Card position: centered over the swatch, kept inside the window. */
  const [cardLeft, setCardLeft] = useState(CARD_MARGIN);
  const timer = useRef<number | undefined>(undefined);
  const { isStarred, toggle } = useStarred();

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


  // The window grows upwards while the popover is open (see toolbar.rs).
  const showPopover = useCallback((index: number | null) => {
    window.clearTimeout(timer.current);
    if (index !== null) {
      const sw = document.querySelectorAll<HTMLElement>(".swatches .tb-btn")[index];
      const r = sw?.getBoundingClientRect();
      const center = r ? r.left + r.width / 2 : 0;
      setCardLeft(Math.max(CARD_MARGIN, Math.min(window.innerWidth - CARD_WIDTH - CARD_MARGIN, center - CARD_WIDTH / 2)));
    }
    setOpen(index);
    if (!isTauri()) return;
    invoke<boolean>("toolbar_popover", { open: index !== null })
      .then(setBelow)
      .catch((e) => console.error("toolbar_popover", e));
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
    // Clicks on other toolbar controls stay in this page (no blur), so
    // close on any press outside the popover and the swatches too.
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest(".tb-card, .swatch")) showPopover(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, showPopover]);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  const later = (fn: () => void, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };
  const details = (hex: string) => {
    showPopover(null);
    call("open_color", { hex });
  };

  const cycleFormat = () => {
    const next = FORMATS[(FORMATS.indexOf(format) + 1) % FORMATS.length];
    setFormat(next);
    setCopyFormat(next).catch((e) => console.error("format", e));
  };

  return (
    <div className={`stage${open !== null && below ? " below" : ""}`}>
      {open !== null && swatches[open] && (
        <div
          className="tb-card"
          style={{ marginLeft: cardLeft }}
          onMouseEnter={() => window.clearTimeout(timer.current)}
          onMouseLeave={() => later(() => showPopover(null), CLOSE_DELAY)}
        >
          <ValueCard hex={swatches[open]} onDetails={() => details(swatches[open])}>
            <button
              type="button"
              className={`vc-btn tb-star${isStarred(swatches[open]) ? " on" : ""}`}
              onClick={() => toggle(swatches[open])}
              aria-pressed={isStarred(swatches[open])}
              aria-label={isStarred(swatches[open]) ? "Remove from Saved" : "Save to Saved"}
              title={isStarred(swatches[open]) ? "Starred: click to remove from Saved" : "Star: keep it in Saved"}
            >
              <StarIcon filled={isStarred(swatches[open])} />
            </button>
          </ValueCard>
        </div>
      )}
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
                title={`${swatches[i]}: values and details`}
                aria-label={`Picked color ${swatches[i]}`}
                aria-expanded={open === i}
                onClick={() => showPopover(open === i ? null : i)}
                onMouseEnter={() => (open === i ? window.clearTimeout(timer.current) : later(() => showPopover(i), open === null ? OPEN_DELAY : 0))}
                onMouseLeave={() => later(() => showPopover(null), CLOSE_DELAY)}
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
        <button type="button" className="tb-btn" title="Identify font" aria-label="Identify font" onClick={() => call("start_font_pick")}>
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
    </div>
  );
}
