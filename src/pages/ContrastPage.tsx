import { useEffect, useMemo, useRef, useState } from "react";
import { convert, copyText, parseColor } from "../lib/colors";
import { apcaLc, apcaUse, flatten, suggest, TARGETS, wcag, type Suggestion } from "../lib/contrast";
import { isTauri } from "../lib/env";
import { onPick, onPickerFinished, startPick } from "../lib/picker";
import type { Section } from "../sections";
import { PageHead } from "../components/PageHead";

type Side = "text" | "background";
const STORE = "huetype.contrast";

function load(): { text: string; background: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
    if (saved?.text && saved?.background) return saved;
  } catch {
    // ignore
  }
  return { text: "#5B6CFF", background: "#FFFFFF" };
}

function ColorField({
  side,
  value,
  onChange,
  onPickScreen,
}: {
  side: Side;
  value: string;
  onChange: (v: string) => void;
  onPickScreen: () => void;
}) {
  const color = parseColor(value);
  const hex = color ? convert(color).hex : null;
  const id = `contrast-${side}`;
  return (
    <div className="ct-field">
      <label htmlFor={id}>{side === "text" ? "Text" : "Background"}</label>
      <div className="conv-row">
        <span className="ct-dot" style={{ background: hex ?? "transparent" }} aria-hidden="true" />
        <input
          id={id}
          className="text-input mono-input"
          value={value}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!color}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="color"
          className="native-color"
          value={hex?.toLowerCase() ?? "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={`Choose ${side} color with the system picker`}
        />
        {isTauri() && (
          <button type="button" className="secondary-btn" onClick={onPickScreen} title="Pick from screen">
            Pick
          </button>
        )}
      </div>
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`badge ${ok ? "pass" : "fail"}`}>{`${ok ? "Pass" : "Fail"} · ${label}`}</span>;
}

/** Contrast (3): WCAG 2.2 and APCA for a text and background pair. */
export function ContrastPage({ section }: { section: Section }) {
  const [pair, setPair] = useState(load);
  const [targetIndex, setTargetIndex] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  /** Which field the next screen pick fills. */
  const picking = useRef<Side | null>(null);

  const text = parseColor(pair.text);
  const background = parseColor(pair.background);
  // Translucent colors are measured as drawn: the background over white,
  // the text over the background.
  const bg = background ? flatten(background, "#FFFFFF") : null;
  const fg = text && bg ? flatten(text, bg) : null;
  const translucent = (text?.alpha ?? 1) < 1 || (background?.alpha ?? 1) < 1;

  useEffect(() => {
    try {
      if (fg && bg) localStorage.setItem(STORE, JSON.stringify(pair));
    } catch {
      // ignore
    }
  }, [pair, fg, bg]);

  useEffect(() => {
    const offPick = onPick((p) => {
      const side = picking.current;
      if (!side) return;
      picking.current = null;
      setPair((prev) => ({ ...prev, [side]: p.hex }));
    });
    // Cancelled with Esc: later picks from elsewhere must not land here.
    const offFinished = onPickerFinished(() => (picking.current = null));
    return () => {
      offPick();
      offFinished();
    };
  }, []);

  const set = (side: Side) => (value: string) => setPair((prev) => ({ ...prev, [side]: value }));
  const pickScreen = (side: Side) => {
    picking.current = side;
    startPick().catch(() => (picking.current = null));
  };

  const result = useMemo(() => {
    if (!fg || !bg) return null;
    return { w: wcag(fg, bg), lc: apcaLc(fg, bg) };
  }, [fg, bg]);
  const target = TARGETS[targetIndex];
  const suggestions = useMemo(() => (fg && bg ? suggest(fg, bg, target) : []), [fg, bg, target]);

  const apply = (s: Suggestion) => setPair((prev) => ({ ...prev, [s.side]: s.hex }));
  const copy = (t: string) =>
    copyText(t)
      .then(() => setCopied(t))
      .catch(() => {});

  return (
    <div className="page">
      <PageHead section={section} />

      <div className="ct-inputs">
        <ColorField side="text" value={pair.text} onChange={set("text")} onPickScreen={() => pickScreen("text")} />
        <button
          type="button"
          className="secondary-btn ct-swap"
          onClick={() => setPair((p) => ({ text: p.background, background: p.text }))}
          aria-label="Swap text and background"
          title="Swap"
        >
          ⇄
        </button>
        <ColorField
          side="background"
          value={pair.background}
          onChange={set("background")}
          onPickScreen={() => pickScreen("background")}
        />
      </div>

      {!result ? (
        <p className="alert" role="alert">
          Enter two colors I can read: HEX, rgb(), hsl(), oklch() or a CSS name.
        </p>
      ) : (
        <>
          {translucent && (
            <p className="help">
              Translucent colors are measured as drawn: the background over white ({bg}), the text over the background
              ({fg}).
            </p>
          )}
          <div className="ct-preview" style={{ background: bg!, color: fg! }}>
            <p className="ct-large">Large text 24px</p>
            <p className="ct-bold">Bold UI label 18.66px</p>
            <p>
              Body text at 16px. The quick brown fox jumps over the lazy dog, and contrast decides whether everyone can
              read it comfortably.
            </p>
            <p className="ct-small">Small print at 12px, which needs the most contrast.</p>
          </div>

          <div className="ct-results">
            <section className="ct-card" aria-label="WCAG 2.2">
              <h2>WCAG 2.2</h2>
              <strong className="ct-big">{result.w.ratio.toFixed(2)}:1</strong>
              <div className="badges">
                <Badge ok={result.w.aa} label="AA text" />
                <Badge ok={result.w.aaLarge} label="AA large & UI" />
                <Badge ok={result.w.aaa} label="AAA text" />
                <Badge ok={result.w.aaaLarge} label="AAA large" />
              </div>
            </section>
            <section className="ct-card" aria-label="APCA">
              <h2>APCA</h2>
              <strong className="ct-big">Lc {result.lc.toFixed(1)}</strong>
              <p className="help">
                {apcaUse(result.lc)}
                {result.lc < 0 ? ", light text on dark" : ""}. APCA is the draft method for WCAG 3; it weighs dark mode
                and font weight more accurately.
              </p>
            </section>
          </div>

          <section className="settings-group" aria-labelledby="ct-fix">
            <div className="ct-fix-head">
              <h2 id="ct-fix">Nearest passing colors</h2>
              <label>
                Target{" "}
                <select value={targetIndex} onChange={(e) => setTargetIndex(Number(e.target.value))}>
                  {TARGETS.map((t, i) => (
                    <option key={t.label} value={i}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {suggestions.length === 0 ? (
              <p className="ct-ok">This pair already meets {target.label}.</p>
            ) : (
              suggestions.map((s) => (
                <div key={`${s.side}-${s.direction}`} className="conv-line">
                  <span className="ct-sample" style={{ background: s.side === "background" ? s.hex : bg!, color: s.side === "text" ? s.hex : fg! }}>
                    Aa
                  </span>
                  <span className="ct-sugg">
                    {s.direction === "lighter" ? "Lighter" : "Darker"} {s.side}{" "}
                    <code>{s.hex}</code>
                    <small> · lightness {s.deltaL.toFixed(1)} points away</small>
                  </span>
                  <button type="button" className="link-btn" onClick={() => copy(s.hex)}>
                    {copied === s.hex ? "Copied" : "Copy"}
                  </button>
                  <button type="button" className="link-btn" onClick={() => apply(s)}>
                    Use
                  </button>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
