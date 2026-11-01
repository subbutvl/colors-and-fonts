import { useEffect, useMemo, useState } from "react";
import { PageHead } from "../components/PageHead";
import { contrast, convert, copyText, FORMAT_LABELS, formatColor, getCopyFormat, onCopyFormat, parseColor, type ColorFormat } from "../lib/colors";
import { isTauri } from "../lib/env";
import { isGray, PAIRINGS, partners, type PairingId, type Partner, type Wheel } from "../lib/pairing";
import { onPick, startPick } from "../lib/picker";
import type { Section } from "../sections";

const EXAMPLES = ["#5B6CFF", "#E5484D", "#F2C94C", "#1F9D55", "#8E4EC6", "#0EA5E9"];
const LAST_KEY = "huetype.pairing.last";
const WHEEL_SIZE = 220;

function lastInput(): string {
  try {
    return localStorage.getItem(LAST_KEY) ?? "#5B6CFF";
  } catch {
    return "#5B6CFF";
  }
}

/** Hue ring for the wheel: HSL at full saturation, or OKLCH at a fixed mid lightness. */
function ringGradient(wheel: Wheel): string {
  const stops = Array.from({ length: 13 }, (_, i) => {
    const h = i * 30;
    return wheel === "hsl" ? `hsl(${h} 100% 50%)` : `oklch(0.72 0.15 ${h})`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function HueWheel({ list, wheel }: { list: Partner[]; wheel: Wheel }) {
  const c = WHEEL_SIZE / 2;
  const r = c - 18;
  const at = (h: number) => ({ x: c + r * Math.sin((h * Math.PI) / 180), y: c - r * Math.cos((h * Math.PI) / 180) });
  // Monochromatic sets share one hue: draw them along the radius instead.
  const sameHue = list.every((p) => p.hue !== undefined && Math.abs((p.hue ?? 0) - (list[0].hue ?? 0)) < 10);
  return (
    <div className="hue-wheel" style={{ width: WHEEL_SIZE, height: WHEEL_SIZE, background: ringGradient(wheel) }} aria-hidden="true">
      <svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
        <circle cx={c} cy={c} r={r - 22} className="hue-wheel-hole" />
        {list.map((p, i) => {
          if (p.hue === undefined) return null;
          const pos = sameHue && list.length > 2 ? { x: c + ((r * (i + 1)) / list.length) * Math.sin((p.hue * Math.PI) / 180), y: c - ((r * (i + 1)) / list.length) * Math.cos((p.hue * Math.PI) / 180) } : at(p.hue);
          return (
            <g key={i}>
              <line x1={c} y1={c} x2={pos.x} y2={pos.y} className="hue-wheel-line" />
              <circle cx={pos.x} cy={pos.y} r={p.base ? 11 : 8} fill={p.hex} className={p.base ? "hue-dot base" : "hue-dot"} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Color pairing (6): partners for one color by hue relationship. */
export function PairingPage({ section }: { section: Section }) {
  const [input, setInput] = useState(lastInput);
  const [wheel, setWheel] = useState<Wheel>("oklch");
  const [selected, setSelected] = useState<PairingId>("complementary");
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [status, setStatus] = useState<string | null>(null);

  const color = useMemo(() => parseColor(input), [input]);
  const conv = useMemo(() => (color ? convert(color) : null), [color]);
  const sets = useMemo(
    () => (conv ? PAIRINGS.map((p) => ({ pairing: p, list: partners(conv.hex, p.id, wheel) })) : []),
    [conv, wheel],
  );
  const current = sets.find((s) => s.pairing.id === selected);

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

  const copy = (text: string) =>
    copyText(text)
      .then(() => setStatus(`Copied ${text}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  return (
    <div className="page">
      <PageHead section={section} />

      <div className="conv-input">
        <label htmlFor="pair-in">Base color</label>
        <div className="conv-row">
          <input
            id="pair-in"
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
          <span className="help">Wheel</span>
          <div className="theme-switch pair-wheel-switch" role="group" aria-label="Color wheel">
            {(["oklch", "hsl"] as const).map((w) => (
              <button key={w} type="button" className={wheel === w ? "on" : ""} aria-pressed={wheel === w} onClick={() => setWheel(w)} title={w === "oklch" ? "Perceptual: partners keep the same lightness" : "Classic RGB wheel: red pairs with cyan"}>
                {w === "oklch" ? "OKLCH" : "HSL"}
              </button>
            ))}
          </div>
        </div>
        <div className="conv-chips">
          {EXAMPLES.map((c) => (
            <button key={c} type="button" className="chip-btn" onClick={() => setInput(c)}>
              <span className="dot" style={{ background: c }} />
              {c}
            </button>
          ))}
        </div>
        {!color && <span className="help error">Not a color I can read. Try HEX, rgb(), hsl(), oklch() or a CSS name.</span>}
        {conv && isGray(conv.hex) && <span className="help">This is a gray, so it has no hue to pair by. Partners are grays too: try a more colorful base.</span>}
      </div>

      {current && (
        <div className="pair-main">
          <HueWheel list={current.list} wheel={wheel} />
          <div className="pair-feature">
            <h2>{current.pairing.label}</h2>
            <p className="note">{current.pairing.blurb}</p>
            <div className="pair-big">
              {current.list.map((p, i) => {
                const ink = contrast("#FFFFFF", p.hex).ratio >= contrast("#111111", p.hex).ratio ? "#FFFFFF" : "#111111";
                const text = formatColor(p.hex, format);
                return (
                  <div key={i} className="pair-big-col" style={{ background: p.hex, color: ink }}>
                    {p.base && <span className="pair-tag">Base</span>}
                    <button type="button" onClick={() => copy(text)} title={`Copy ${FORMAT_LABELS[format]}`}>
                      {p.hex}
                    </button>
                    {!p.base && (
                      <button type="button" className="pair-use" onClick={() => setInput(p.hex)}>
                        Use as base
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" className="link-btn" onClick={() => copy(current.list.map((p) => formatColor(p.hex, format)).join(", "))}>
              Copy all as {FORMAT_LABELS[format]}
            </button>
          </div>
        </div>
      )}

      <p className="help" role="status">
        {status ?? "Pick a pairing below to see it on the wheel. Click a color to copy it."}
      </p>

      <ul className="pair-grid">
        {sets.map(({ pairing, list }) => (
          <li key={pairing.id}>
            <button
              type="button"
              className={`pair-card${pairing.id === selected ? " on" : ""}`}
              onClick={() => setSelected(pairing.id)}
              aria-pressed={pairing.id === selected}
            >
              <span className="pair-strip">
                {list.map((p, i) => (
                  <span key={i} style={{ background: p.hex }} />
                ))}
              </span>
              <strong>{pairing.label}</strong>
              <span className="mono">{list.map((p) => p.hex).join(" ")}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
