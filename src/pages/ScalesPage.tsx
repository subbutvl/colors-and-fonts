import { useEffect, useMemo, useState } from "react";
import { PageHead } from "../components/PageHead";
import { contrast, convert, copyText, FORMAT_LABELS, formatColor, getCopyFormat, onCopyFormat, parseColor, type ColorFormat } from "../lib/colors";
import { isTauri } from "../lib/env";
import { onPick, startPick } from "../lib/picker";
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

/** Scales (2): one color in, 50 to 950 out. */
export function ScalesPage({ section }: { section: Section }) {
  const [input, setInput] = useState(lastInput);
  const [customName, setCustomName] = useState<string | null>(null);
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [exportAs, setExportAs] = useState<ScaleExport>("css");
  const [value, setValue] = useState<ScaleValue>("hex");
  const [status, setStatus] = useState<string | null>(null);

  const color = useMemo(() => parseColor(input), [input]);
  const conv = useMemo(() => (color ? convert(color) : null), [color]);
  const scale = useMemo(() => (conv ? makeScale(conv.hex) : null), [conv]);
  const name = customName ?? (conv ? hueFamily(conv.hex) : "color");

  useEffect(() => {
    getCopyFormat().then(setFormat);
    return onCopyFormat(setFormat);
  }, []);

  useEffect(() => onPick((p) => setInput(p.hex)), []);

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
    </div>
  );
}
