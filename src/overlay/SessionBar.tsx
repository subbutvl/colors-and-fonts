import { useEffect, useRef, useState } from "react";
import { ValueCard } from "../picker-ui/ValueCard";
import { CloseIcon } from "../toolbar/icons";

/** Hover delays, ms: open quickly, close a little later so the pointer can reach the card. */
const OPEN_DELAY = 80;
const CLOSE_DELAY = 220;

/**
 * Bar at the bottom of the pick overlay: every color picked in this session,
 * in order, with a hover card of values to copy, and a Close button (same as
 * Esc). Mouse events stop here, so using the bar never picks a color.
 */
export function SessionBar({
  picks,
  onClose,
  onDetails,
  onEnter,
}: {
  /** Picked hex colors, oldest first. */
  picks: string[];
  onClose: () => void;
  onDetails: (hex: string) => void;
  /** The pointer moved onto the bar (hide the loupe). */
  onEnter: () => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const list = useRef<HTMLDivElement>(null);

  const later = (fn: () => void, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Keep the newest pick in view.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [picks.length]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="session-bar"
      onMouseDown={stop}
      onMouseUp={stop}
      onMouseMove={stop}
      onContextMenu={stop}
      onMouseEnter={onEnter}
      onMouseLeave={() => later(() => setHover(null), CLOSE_DELAY)}
      role="toolbar"
      aria-label="Colors picked this time"
    >
      {picks.length === 0 ? (
        <span className="session-empty">Picked colors show up here</span>
      ) : (
        <div className="session-picks" ref={list}>
          {picks.map((hex, i) => (
            <button
              key={`${hex}-${i}`}
              type="button"
              className={`session-sw${hover === i ? " on" : ""}`}
              style={{ background: hex }}
              aria-label={`${hex}: show values`}
              onMouseEnter={() => later(() => setHover(i), hover === null ? OPEN_DELAY : 0)}
              onFocus={() => setHover(i)}
              onClick={() => setHover(hover === i ? null : i)}
            />
          ))}
        </div>
      )}
      {hover !== null && picks[hover] && (
        <div
          className="session-card"
          style={{ left: cardLeft(list.current, hover) }}
          onMouseEnter={() => window.clearTimeout(timer.current)}
        >
          <ValueCard hex={picks[hover]} onDetails={() => onDetails(picks[hover])} />
        </div>
      )}
      <span className="session-divider" />
      <span className="session-count">{picks.length === 1 ? "1 color" : `${picks.length} colors`}</span>
      <button type="button" className="session-close" onClick={onClose} title="Close the picker (Esc)" aria-label="Close the picker">
        <CloseIcon />
        <span>Close</span>
        <kbd>Esc</kbd>
      </button>
    </div>
  );
}

/** Center the card over the hovered swatch, measured inside the bar. */
function cardLeft(list: HTMLDivElement | null, index: number): number | undefined {
  const sw = list?.children[index] as HTMLElement | undefined;
  const bar = list?.parentElement;
  if (!sw || !bar) return undefined;
  const a = sw.getBoundingClientRect();
  const b = bar.getBoundingClientRect();
  return a.left - b.left + a.width / 2;
}
