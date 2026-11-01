import { useEffect, useState } from "react";
import { getShortcutStatus, prettyShortcut, type ShortcutAction, type ShortcutStatus } from "../lib/shortcuts";
import { onPick, startPick, type Pick } from "../lib/picker";

const FALLBACK: Record<ShortcutAction, string> = {
  pick_color: "Ctrl+Alt+KeyC",
  identify_font: "Ctrl+Alt+KeyF",
  toggle_toolbar: "Ctrl+Alt+Space",
};

/** Newest first; this list lives until the app quits (saved history comes in step 1.3). */
const MAX_PICKS = 24;

export function PickerHome() {
  const [shortcuts, setShortcuts] = useState<ShortcutStatus[] | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getShortcutStatus().then(setShortcuts).catch(() => {});
  }, []);
  useEffect(() => onPick((p) => setPicks((prev) => [p, ...prev].slice(0, MAX_PICKS))), []);

  const keys = (a: ShortcutAction) =>
    prettyShortcut(shortcuts?.find((s) => s.action === a)?.accelerator ?? FALLBACK[a]);

  const pick = () => {
    setError(null);
    startPick().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  const copy = (hex: string) => {
    navigator.clipboard
      .writeText(hex)
      .then(() => setCopied(hex))
      .catch(() => {});
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Picker</h1>
        <p>Pick a color from any app, or identify a font on screen.</p>
      </header>
      <div className="big-actions">
        <button type="button" className="big-action" onClick={pick}>
          <strong>Pick color</strong>
          <span>From any app or screen</span>
          <kbd>{keys("pick_color")}</kbd>
        </button>
        <button type="button" className="big-action" disabled>
          <strong>Identify font</strong>
          <span>Drag around text</span>
          <kbd>{keys("identify_font")}</kbd>
        </button>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {picks.length > 0 && (
        <section className="picks" aria-labelledby="picks-title">
          <div className="picks-head">
            <h2 id="picks-title">Picked this session</h2>
            <span className="mono" aria-live="polite">
              {copied ? `Copied ${copied}` : "Click a color to copy its hex"}
            </span>
          </div>
          <ul className="picks-list">
            {picks.map((p, i) => (
              <li key={`${i}-${p.hex}-${p.x}-${p.y}`}>
                <button type="button" className="pick-chip" onClick={() => copy(p.hex)} title={`Copy ${p.hex}`}>
                  <span className="sw" style={{ background: p.hex }} />
                  <span className="mono">{p.hex}</span>
                  <small>{p.width > 1 || p.height > 1 ? `${p.width} x ${p.height} average` : `at ${p.x}, ${p.y}`}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="note">
        Picking freezes every screen: click to add a color (keep clicking for more), Shift+drag to average an area,
        arrow keys to nudge one pixel, Esc when done. Press {keys("toggle_toolbar")} for the floating toolbar. Close
        this window any time: Huetype keeps running in the system tray.
      </p>
    </div>
  );
}
