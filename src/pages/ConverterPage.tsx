import { useEffect, useMemo, useState } from "react";
import { convert, copyText, nearestName, parseColor } from "../lib/colors";
import { recentPicks } from "../lib/history";
import { isTauri } from "../lib/env";
import { onPick, startPick } from "../lib/picker";
import type { Section } from "../sections";
import { PageHead } from "../components/PageHead";

const EXAMPLES = ["#5B6CFF", "rgb(242, 201, 76)", "hsl(160 63% 33%)", "oklch(70% 0.25 30)", "rebeccapurple"];
const LAST_KEY = "huetype.converter.last";

/** Converter (14): type or pick any color, get every format. */
export function ConverterPage({ section }: { section: Section }) {
  const [input, setInput] = useState(() => {
    try {
      return localStorage.getItem(LAST_KEY) ?? "#5B6CFF";
    } catch {
      return "#5B6CFF";
    }
  });
  const [copied, setCopied] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  const color = useMemo(() => parseColor(input), [input]);
  const result = useMemo(() => (color ? convert(color) : null), [color]);
  const name = result ? nearestName(result.hex) : null;

  useEffect(() => {
    try {
      if (color) localStorage.setItem(LAST_KEY, input);
    } catch {
      // ignore
    }
  }, [color, input]);

  useEffect(() => {
    recentPicks(6)
      .then((rows) => setRecent([...new Set(rows.map((r) => r.hex))]))
      .catch(() => {});
    // A pick made from this page lands in the input.
    return onPick((p) => {
      setInput(p.hex);
      setRecent((prev) => [p.hex, ...prev.filter((h) => h !== p.hex)].slice(0, 6));
    });
  }, []);

  const copy = (text: string) =>
    copyText(text)
      .then(() => setCopied(text))
      .catch(() => {});

  return (
    <div className="page">
      <PageHead section={section} />

      <div className="conv-top">
        <span
          className={`conv-swatch${result ? "" : " empty"}`}
          style={result ? { background: result.hex, opacity: result.alpha } : undefined}
          aria-hidden="true"
        />
        <div className="conv-input">
          <label htmlFor="conv-in">Any color</label>
          <div className="conv-row">
            <input
              id="conv-in"
              className="text-input mono-input"
              value={input}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setInput(e.target.value)}
              aria-invalid={!color}
              aria-describedby="conv-help"
            />
            <input
              type="color"
              className="native-color"
              value={result?.hex.toLowerCase() ?? "#000000"}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              aria-label="Choose with the system color picker"
            />
            {isTauri() && (
              <button type="button" className="secondary-btn" onClick={() => startPick().catch(() => {})}>
                Pick from screen
              </button>
            )}
          </div>
          <span id="conv-help" className={color ? "help" : "help error"}>
            {color
              ? name && `${name.deltaE < 1 ? "" : "Close to "}${name.name}${result?.outOfGamut ? " · outside sRGB: HEX, RGB, HSL, HWB, HSV and CMYK show the nearest sRGB color" : ""}`
              : "Not a color I can read. Try HEX, rgb(), hsl(), oklch(), a CSS name, or 3 numbers."}
          </span>
          <div className="conv-chips">
            {(recent.length ? recent : EXAMPLES).map((c) => (
              <button key={c} type="button" className="chip-btn" onClick={() => setInput(c)}>
                {recent.length > 0 && <span className="dot" style={{ background: c }} />}
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {result && (
        <section className="settings-group" aria-label="All formats">
          {result.rows.map((row) => (
            <div key={row.id} className="conv-line">
              <span className="conv-label">
                {row.label}
                {!row.css && <small title="Not a CSS color syntax"> not CSS</small>}
              </span>
              <code>{row.value}</code>
              <button type="button" className="link-btn" onClick={() => copy(row.value)}>
                {copied === row.value ? "Copied" : "Copy"}
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
