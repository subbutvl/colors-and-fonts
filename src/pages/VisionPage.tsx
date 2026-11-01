import { useEffect, useMemo, useState } from "react";
import { PageHead } from "../components/PageHead";
import { convert, parseColor } from "../lib/colors";
import { isTauri } from "../lib/env";
import { onPick, startPick } from "../lib/picker";
import { collisions, contrastRatio, simulate, splitColors, VISIONS, type Collision, type Vision } from "../lib/vision";
import type { Section } from "../sections";

const DEFAULT = "#D62728, #2CA02C, #1F77B4, #FF7F0E";
const LAST_KEY = "huetype.vision.last";
const MAX = 8;

function lastInput(): string {
  try {
    return localStorage.getItem(LAST_KEY) ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
}

const pairText = (c: Collision) => `${c.a + 1} and ${c.b + 1} ${c.level === "same" ? "look the same" : "are hard to tell apart"}`;

function VisionRow({ vision, colors, severity }: { vision: Vision; colors: string[]; severity: number }) {
  const sim = colors.map((c) => simulate(c, vision.id, severity));
  const hits = collisions(sim);
  const pair = colors.length === 2;
  return (
    <li className={`vision-row${hits.length ? " warn" : ""}`}>
      <div className="vision-meta">
        <strong>{vision.label}</strong>
        <span>{vision.note}</span>
      </div>
      <div className="vision-strip">
        {sim.map((c, i) => (
          <span key={i} style={{ background: c }} title={`${i + 1}: ${colors[i]} seen as ${c}`}>
            <b>{i + 1}</b>
          </span>
        ))}
      </div>
      {pair && (
        <div className="vision-sample" style={{ color: sim[0], background: sim[1] }}>
          Sample text <small>{contrastRatio(sim[0], sim[1]).toFixed(2)}:1</small>
        </div>
      )}
      <div className="vision-verdict">
        {pair && (
          <span className={`badge ${contrastRatio(sim[0], sim[1]) >= 4.5 ? "pass" : "fail"}`}>
            Text contrast {contrastRatio(sim[0], sim[1]) >= 4.5 ? "passes" : "below"} AA 4.5
          </span>
        )}
        {hits.length === 0 ? (
          <span className="badge pass">All distinct</span>
        ) : (
          hits.map((h) => (
            <span key={`${h.a}-${h.b}`} className="badge fail">
              {pairText(h)}
            </span>
          ))
        )}
      </div>
    </li>
  );
}

/** Color blindness (5): a color pair or palette as people with other vision, or in other situations, see it. */
export function VisionPage({ section }: { section: Section }) {
  const [input, setInput] = useState(lastInput);
  const [severity, setSeverity] = useState(100);
  const [draft, setDraft] = useState("#808080");

  const parsed = useMemo(
    () =>
      splitColors(input).map((text) => {
        const c = parseColor(text);
        const conv = c ? convert(c) : null;
        // A translucent color's look depends on what is behind it, so it
        // cannot be judged on its own: ask for the opaque color instead.
        return { text, hex: conv && conv.alpha >= 1 ? conv.hex : null, translucent: !!conv && conv.alpha < 1 };
      }),
    [input],
  );
  const colors = parsed.flatMap((p) => (p.hex ? [p.hex] : [])).slice(0, MAX);
  const bad = parsed.filter((p) => !p.hex && !p.translucent).map((p) => p.text);
  const translucent = parsed.filter((p) => p.translucent).map((p) => p.text);

  useEffect(() => {
    try {
      localStorage.setItem(LAST_KEY, input);
    } catch {
      // ignore
    }
  }, [input]);

  const add = (hex: string) => setInput((s) => (s.trim() ? `${s.trim().replace(/,$/, "")}, ${hex}` : hex));
  const removeAt = (i: number) => setInput(colors.filter((_, j) => j !== i).join(", "));
  useEffect(() => onPick((p) => add(p.hex)), []);

  const problems = VISIONS.filter((v) => v.id !== "typical")
    .map((v) => ({ v, n: collisions(colors.map((c) => simulate(c, v.id, severity / 100))).length }))
    .filter((x) => x.n > 0);

  return (
    <div className="page">
      <PageHead section={section} />

      <div className="conv-input">
        <label htmlFor="vision-in">Colors to check (2 to {MAX}: a text and background pair, or a chart palette)</label>
        <div className="conv-row">
          <input
            id="vision-in"
            className="text-input mono-input"
            value={input}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setInput(e.target.value)}
            aria-invalid={bad.length > 0 || translucent.length > 0 || colors.length < 2}
          />
          <input
            type="color"
            className="native-color"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Color to add, from the system color picker"
          />
          <button type="button" className="secondary-btn" onClick={() => add(draft.toUpperCase())} disabled={colors.length >= MAX}>
            Add
          </button>
          {isTauri() && (
            <button type="button" className="secondary-btn" onClick={() => startPick().catch(() => {})}>
              Add from screen
            </button>
          )}
        </div>
        <div className="conv-chips">
          {colors.map((c, i) => (
            <button key={`${c}-${i}`} type="button" className="chip-btn" onClick={() => removeAt(i)} title="Remove">
              <b>{i + 1}</b>
              <span className="dot" style={{ background: c }} />
              {c} ✕
            </button>
          ))}
        </div>
        {bad.length > 0 && <span className="help error">Not colors I can read: {bad.join(", ")}</span>}
        {translucent.length > 0 && (
          <span className="help error">
            Left out because they are translucent, so how they look depends on what is behind them: {translucent.join(", ")}. Enter the color as it
            appears on screen (or pick it).
          </span>
        )}
        {colors.length < 2 && <span className="help error">Add at least two colors to compare.</span>}
        {parsed.filter((p) => p.hex).length > MAX && <span className="help">Only the first {MAX} colors are checked.</span>}
      </div>

      <div className="toolbar-row">
        <label className="inline-field">
          Severity for red, green and blue weakness
          <input type="range" min={10} max={100} step={10} value={severity} onChange={(e) => setSeverity(Number(e.target.value))} />
          <span className="mono">{severity === 100 ? "full (-anopia)" : `${severity}% (-anomaly)`}</span>
        </label>
      </div>

      {colors.length >= 2 && (
        <>
          <p className={problems.length ? "alert" : "note"} role="status">
            {problems.length
              ? `Check these: ${problems.map((p) => p.v.label.split(" /")[0]).join(", ")}. Add a second cue (labels, patterns, lightness) or change a color.`
              : "Every color stays distinct for every vision type and situation here."}
          </p>

          <h2 className="vision-h">Color vision</h2>
          <ul className="vision-list">
            {VISIONS.filter((v) => v.kind !== "situation").map((v) => (
              <VisionRow key={v.id} vision={v} colors={colors} severity={v.severity ? severity / 100 : 1} />
            ))}
          </ul>

          <h2 className="vision-h">Situations</h2>
          <ul className="vision-list">
            {VISIONS.filter((v) => v.kind === "situation").map((v) => (
              <VisionRow key={v.id} vision={v} colors={colors} severity={1} />
            ))}
          </ul>

          <p className="note">
            Simulations use the Machado, Oliveira and Fernandes (2009) model. "Look the same" means a CIEDE2000 difference under 5; "hard to tell
            apart" means under 11. Situations are approximations to help you spot risks, not measurements.
          </p>
        </>
      )}
    </div>
  );
}
