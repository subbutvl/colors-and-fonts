import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHead } from "../components/PageHead";
import { contrast, convert, copyText, FORMAT_LABELS, formatColor, getCopyFormat, onCopyFormat, parseColor, type ColorFormat } from "../lib/colors";
import { isTauri } from "../lib/env";
import { onPick, startPick } from "../lib/picker";
import { onLibraryChanged } from "../lib/library";
import { deleteScale, listScales, saveScale, takeOpenScale, type OpenScale, type SavedScale } from "../lib/scales";
import { exportScale, hueFamily, makeScale, SCALE_EXPORTS, type ScaleExport, type ScaleValue } from "../lib/scale";
import type { Section } from "../sections";

const EXAMPLES = ["#5B6CFF", "#E5484D", "#F2C94C", "#1F9D55", "#8E4EC6", "#64748B"];
const LAST_KEY = "huetype.scales.last";

const ratio = (r: number) => (r >= 10 ? r.toFixed(0) : r.toFixed(1));

function lastInput(): string {
  try {
    return localStorage.getItem(LAST_KEY) ?? "#5B6CFF";
  } catch {
    return "#5B6CFF";
  }
}

/** Scales (2): one color in, 50 to 950 out; save and reopen scales. */
export function ScalesPage({ section }: { section: Section }) {
  const [input, setInput] = useState(lastInput);
  const [customName, setCustomName] = useState<string | null>(null);
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [exportAs, setExportAs] = useState<ScaleExport>("css");
  const [value, setValue] = useState<ScaleValue>("hex");
  const [status, setStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedScale[]>([]);

  const color = useMemo(() => parseColor(input), [input]);
  const conv = useMemo(() => (color ? convert(color) : null), [color]);
  // A reopened saved scale shows its stored steps until the base color changes,
  // so it looks and exports exactly as saved even if makeScale changes later.
  const [opened, setOpened] = useState<OpenScale | null>(null);
  const scale = useMemo(() => {
    if (!conv) return null;
    if (opened && opened.base === conv.hex) return opened.steps.map((s) => ({ ...s, base: s.hex === opened.base }));
    return makeScale(conv.hex);
  }, [conv, opened]);
  const name = customName ?? (conv ? hueFamily(conv.hex) : "color");

  useEffect(() => {
    getCopyFormat().then(setFormat);
    return onCopyFormat(setFormat);
  }, []);

  useEffect(() => onPick((p) => setInput(p.hex)), []);

  const refresh = useCallback(() => {
    listScales()
      .then(setSaved)
      .catch((e) => setStatus(`Could not load saved scales: ${e}`));
  }, []);
  useEffect(() => {
    refresh();
    return onLibraryChanged(refresh);
  }, [refresh]);

  // Opened from the Saved page: that scale as saved.
  useEffect(() => {
    const req = takeOpenScale();
    if (!req) return;
    setOpened(req);
    setInput(req.base);
    setCustomName(req.name || null);
  }, []);

  useEffect(() => {
    try {
      if (color) localStorage.setItem(LAST_KEY, input);
    } catch {
      // ignore
    }
  }, [color, input]);

  const copy = (text: string, what = text) =>
    copyText(text)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  const exported = scale ? exportScale(scale, exportAs, name, value) : "";

  const save = async () => {
    if (!scale || !conv) return;
    try {
      await saveScale(name, conv.hex, scale);
      setStatus(`Saved "${name.trim() || "Untitled scale"}" (find it below and on the Saved page)`);
      refresh();
    } catch (e) {
      setStatus(`Could not save: ${e}`);
    }
  };

  const open = (s: SavedScale) => {
    setOpened(s);
    setInput(s.base);
    setCustomName(s.name);
    setStatus(`Opened "${s.name}"`);
    document.querySelector(".content")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const drop = async (s: SavedScale) => {
    try {
      await deleteScale(s.id);
      setStatus(`Deleted "${s.name}"`);
    } catch (e) {
      setStatus(`Could not delete: ${e}`);
    }
  };

  return (
    <div className="page">
      <PageHead section={section} />

      <div className="conv-input">
        <label htmlFor="scale-in">Base color</label>
        <div className="conv-row">
          <input
            id="scale-in"
            className="text-input mono-input"
            value={input}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setInput(e.target.value)}
            aria-invalid={!color}
          />
          <input
            type="color"
            className="native-color"
            value={conv?.hex.toLowerCase() ?? "#000000"}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            aria-label="Choose with the system color picker"
          />
          {isTauri() && (
            <button type="button" className="secondary-btn" onClick={() => startPick().catch(() => {})}>
              Pick from screen
            </button>
          )}
          <input
            className="text-input scale-name"
            value={name}
            onChange={(e) => setCustomName(e.target.value)}
            aria-label="Scale name"
            maxLength={40}
            title="Name used in the export"
          />
          <button type="button" className="primary-btn" onClick={() => void save()} disabled={!scale}>
            Save scale
          </button>
        </div>
        <div className="conv-chips">
          {EXAMPLES.map((c) => (
            <button key={c} type="button" className="chip-btn" onClick={() => setInput(c)}>
              <span className="dot" style={{ background: c }} />
              {c}
            </button>
          ))}
          {customName !== null && (
            <button type="button" className="link-btn" onClick={() => setCustomName(null)}>
              Name from hue
            </button>
          )}
        </div>
        {!color && <span className="help error">Not a color I can read. Try HEX, rgb(), hsl(), oklch() or a CSS name.</span>}
        {conv?.outOfGamut && <span className="help">Outside sRGB: the scale is built from the nearest sRGB color, {conv.hex}.</span>}
      </div>

      {scale && (
        <ol className="scale" aria-label={`${name} scale`}>
          {scale.map((s) => {
            const onWhite = contrast("#FFFFFF", s.hex).ratio;
            const onBlack = contrast("#000000", s.hex).ratio;
            const ink = onWhite >= onBlack ? "#FFFFFF" : "#000000";
            const text = formatColor(s.hex, format);
            return (
              <li key={s.step}>
                <button
                  type="button"
                  className={`scale-tile${s.base ? " base" : ""}`}
                  style={{ background: s.hex, color: ink }}
                  onClick={() => copy(text, `${name}-${s.step}: ${text}`)}
                  title={`Copy ${FORMAT_LABELS[format]}`}
                >
                  <span className="scale-step">{s.step}</span>
                  {s.base && <span className="scale-base">Base</span>}
                  <span className="scale-hex">{s.hex}</span>
                </button>
                <span className="scale-ratio" title="WCAG contrast of white and black text on this color">
                  <span>W {ratio(onWhite)}</span>
                  <span>B {ratio(onBlack)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="help" role="status">
        {status ?? `Click a step to copy it as ${FORMAT_LABELS[format]}. W and B are the contrast of white and black text on it (4.5 passes AA).`}
      </p>

      {scale && (
        <section className="settings-group">
          <div className="ct-fix-head">
            <h2>Export</h2>
            <div className="conv-row">
              <select className="text-input" value={exportAs} onChange={(e) => setExportAs(e.target.value as ScaleExport)} aria-label="Export format">
                {SCALE_EXPORTS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
              <div className="theme-switch" role="group" aria-label="Values">
                {(["hex", "oklch"] as const).map((v) => (
                  <button key={v} type="button" className={value === v ? "on" : ""} aria-pressed={value === v} onClick={() => setValue(v)}>
                    {FORMAT_LABELS[v]}
                  </button>
                ))}
              </div>
              <button type="button" className="secondary-btn" onClick={() => copy(exported, SCALE_EXPORTS.find((x) => x.id === exportAs)!.label)}>
                Copy
              </button>
            </div>
          </div>
          <pre className="scale-code">{exported}</pre>
        </section>
      )}

      <section className="picks" aria-labelledby="saved-scales">
        <div className="picks-head">
          <h2 id="saved-scales">Saved scales</h2>
          <span className="help">{saved.length || "None yet"}</span>
        </div>
        {saved.length > 0 && (
          <ul className="saved-pals">
            {saved.map((sc) => (
              <li key={sc.id} className="saved-pal">
                <button type="button" className="saved-strip" onClick={() => open(sc)} title="Open this scale">
                  {sc.steps.map((st) => (
                    <span key={st.step} style={{ background: st.hex }} />
                  ))}
                </button>
                <div className="saved-meta">
                  <strong>{sc.name}</strong>
                  <span className="mono">{sc.base}</span>
                  <button type="button" className="link-btn" onClick={() => void drop(sc)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
