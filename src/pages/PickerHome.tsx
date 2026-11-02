import { useCallback, useEffect, useState } from "react";
import { getShortcutStatus, prettyShortcut, type ShortcutAction, type ShortcutStatus } from "../lib/shortcuts";
import { onPickerError, startPick } from "../lib/picker";
import { startFontPick } from "../lib/fontIdentify";
import { clearHistory, onHistoryChanged, recentPicks, type HistoryPick } from "../lib/history";
import { StarButton } from "../components/StarButton";
import { colorRoute } from "../lib/colorDetails";
import { useStarred } from "../useStarred";
import { copyText, FORMAT_LABELS, formatColor, getCopyFormat, nearestName, onCopyFormat, type ColorFormat } from "../lib/colors";

const FALLBACK: Record<ShortcutAction, string> = {
  pick_color: "Ctrl+Alt+KeyC",
  identify_font: "Ctrl+Alt+KeyF",
  toggle_toolbar: "Ctrl+Alt+Space",
};

/** Recent picks shown here (the history keeps more). */
const SHOWN = 32;

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function PickerHome() {
  const [shortcuts, setShortcuts] = useState<ShortcutStatus[] | null>(null);
  const [picks, setPicks] = useState<HistoryPick[]>([]);
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isStarred, toggle } = useStarred();

  const reload = useCallback(() => {
    recentPicks(SHOWN)
      .then(setPicks)
      .catch((e) => console.error("recent picks", e));
  }, []);

  useEffect(() => {
    getShortcutStatus().then(setShortcuts).catch(() => {});
    getCopyFormat().then(setFormat);
    reload();
    const offHistory = onHistoryChanged(reload);
    const offFormat = onCopyFormat(setFormat);
    const offError = onPickerError((m) => setError(`The picker could not start: ${m}`));
    return () => {
      offHistory();
      offFormat();
      offError();
    };
  }, [reload]);

  const keys = (a: ShortcutAction) =>
    prettyShortcut(shortcuts?.find((s) => s.action === a)?.accelerator ?? FALLBACK[a]);

  const pick = () => {
    setError(null);
    startPick().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  const identify = () => {
    setError(null);
    startFontPick().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  const copy = (hex: string) => {
    const text = formatColor(hex, format);
    copyText(text)
      .then(() => setCopied(text))
      .catch(() => {});
  };
  const clear = () => {
    clearHistory()
      .then(reload)
      .catch((e) => setError(String(e)));
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
        <button type="button" className="big-action" onClick={identify}>
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
      <section className="picks" aria-labelledby="picks-title">
        <div className="picks-head">
          <h2 id="picks-title">Recent picks</h2>
          <span className="picks-tools">
            <span className="mono" aria-live="polite">
              {copied ? `Copied ${copied}` : `Click to copy as ${FORMAT_LABELS[format]}`}
            </span>
            {picks.length > 0 && (
              <button type="button" className="link-btn" onClick={clear}>
                Clear history
              </button>
            )}
          </span>
        </div>
        {picks.length === 0 ? (
          <p className="note">No picks yet. Every color you pick is saved here and copied to the clipboard.</p>
        ) : (
          <ul className="picks-list">
            {picks.map((p) => (
              <li key={p.id} className="pick-item">
                <button
                  type="button"
                  className="pick-chip"
                  onClick={() => copy(p.hex)}
                  title={`Copy ${formatColor(p.hex, format)}`}
                >
                  <span className="sw" style={{ background: p.hex }} />
                  <span className="mono">{p.hex}</span>
                  <small>
                    {nearestName(p.hex).name} · {when(p.pickedAt)}
                  </small>
                </button>
                <button
                  type="button"
                  className="link-btn pick-details"
                  onClick={() => (window.location.hash = `/${colorRoute(p.hex)}`)}
                  aria-label={`Details for ${p.hex}`}
                >
                  Details
                </button>
                <StarButton on={isStarred(p.hex)} onClick={() => toggle(p.hex)} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="note">
        Picking freezes every screen: click to add a color (keep clicking for more), Shift+drag to average an area,
        arrow keys to nudge one pixel, Esc when done. Each pick is copied in the format shown on the toolbar (click it
        to change). Press {keys("toggle_toolbar")} for the floating toolbar. Close this window any time: Huetype keeps
        running in the system tray.
      </p>
    </div>
  );
}
