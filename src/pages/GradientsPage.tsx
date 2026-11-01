import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHead } from "../components/PageHead";
import { formatHex } from "culori";
import { copyText, parseColor } from "../lib/colors";
import {
  addStop,
  DEFAULT_GRADIENT,
  distribute,
  exportGradient,
  GRADIENT_EXPORTS,
  GRADIENT_TYPES,
  gradientCss,
  MAX_STOPS,
  MIN_STOPS,
  normalize,
  parseGradient,
  removeStop,
  reverse,
  SPACES,
  type Gradient,
  type GradientExport,
  type Stop,
} from "../lib/gradient";
import { deleteGradient, listGradients, saveGradient, takeOpenGradient, type SavedGradient } from "../lib/gradients";
import { CURATED_GRADIENTS, GRADIENT_GROUPS, type CuratedGradient } from "../lib/gradientSets";
import { onLibraryChanged } from "../lib/library";
import type { Section } from "../sections";

const CURRENT_KEY = "huetype.gradients.current";

function initialGradient(): { gradient: Gradient; name: string } {
  const opened = takeOpenGradient();
  if (opened) {
    // Keep it as the current gradient too, so a second read (React StrictMode) gets the same one.
    try {
      localStorage.setItem(CURRENT_KEY, JSON.stringify(opened.gradient));
    } catch {
      // ignore
    }
    return opened;
  }
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    const g = raw ? parseGradient(JSON.parse(raw)) : null;
    if (g) return { gradient: g, name: "" };
  } catch {
    // ignore
  }
  return { gradient: DEFAULT_GRADIENT, name: "" };
}

/** The bar under the preview: stops as handles you can drag, click to add. */
function StopsBar({
  gradient,
  selected,
  onSelect,
  onChange,
}: {
  gradient: Gradient;
  selected: number;
  onSelect: (i: number) => void;
  onChange: (g: Gradient, select?: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const strip = gradientCss({ ...gradient, type: "linear", angle: 90 });

  const posFrom = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.round(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };

  const moveStop = (i: number, pos: number) => {
    const stops = gradient.stops.map((s, k) => (k === i ? { ...s, pos } : s));
    onChange({ ...gradient, stops }, i);
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const step = e.shiftKey ? 10 : 1;
    const s = gradient.stops[i];
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") moveStop(i, Math.max(0, s.pos - step));
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") moveStop(i, Math.min(100, s.pos + step));
    else if (e.key === "Home") moveStop(i, 0);
    else if (e.key === "End") moveStop(i, 100);
    else if ((e.key === "Delete" || e.key === "Backspace") && gradient.stops.length > MIN_STOPS) {
      onChange(removeStop(gradient, i), Math.max(0, i - 1));
    } else return;
    e.preventDefault();
  };

  return (
    <div
      className="grad-bar"
      ref={bar}
      style={{ backgroundImage: strip }}
      onPointerDown={(e) => {
        if (e.target !== bar.current || gradient.stops.length >= MAX_STOPS) return;
        const next = addStop(gradient, posFrom(e.clientX));
        const pos = posFrom(e.clientX);
        onChange(next, next.stops.findIndex((s) => s.pos === pos));
      }}
      title="Click the bar to add a stop"
    >
      {gradient.stops.map((s, i) => (
        <button
          key={i}
          type="button"
          className={`grad-handle${i === selected ? " on" : ""}`}
          style={{ left: `${s.pos}%`, background: s.color }}
          aria-label={`Stop ${i + 1}, ${s.color} at ${s.pos}%`}
          aria-pressed={i === selected}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = i;
            onSelect(i);
          }}
          onPointerMove={(e) => {
            if (drag.current === i) moveStop(i, posFrom(e.clientX));
          }}
          onPointerUp={() => (drag.current = null)}
          onKeyDown={(e) => onKey(e, i)}
        />
      ))}
    </div>
  );
}

/** One stop: color, hex, position, remove. */
function StopRow({
  stop,
  index,
  selected,
  canRemove,
  onSelect,
  onChange,
  onRemove,
}: {
  stop: Stop;
  index: number;
  selected: boolean;
  canRemove: boolean;
  onSelect: () => void;
  onChange: (s: Stop) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(stop.color);
  useEffect(() => setDraft(stop.color), [stop.color]);
  const commit = () => {
    const c = parseColor(draft);
    if (c) onChange({ ...stop, color: formatHex(c)!.toUpperCase() });
    else setDraft(stop.color);
  };
  return (
    <li className={`grad-stop${selected ? " on" : ""}`} onFocus={onSelect} onClick={onSelect}>
      <label className="grad-swatch" style={{ background: stop.color }} title="Pick a color">
        <input type="color" value={stop.color.toLowerCase()} onChange={(e) => onChange({ ...stop, color: e.target.value.toUpperCase() })} aria-label={`Stop ${index + 1} color`} />
      </label>
      <input
        className="text-input mono"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        aria-label={`Stop ${index + 1} color value`}
        spellCheck={false}
      />
      <label className="inline-field">
        <input
          type="number"
          className="text-input grad-pos"
          min={0}
          max={100}
          value={stop.pos}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange({ ...stop, pos: Math.min(100, Math.max(0, v)) });
          }}
          aria-label={`Stop ${index + 1} position`}
        />
        %
      </label>
      <button type="button" className="link-btn" onClick={onRemove} disabled={!canRemove} aria-label={`Remove stop ${index + 1}`}>
        Remove
      </button>
    </li>
  );
}

function CuratedCard({ item, onOpen, onCopy }: { item: CuratedGradient; onOpen: () => void; onCopy: () => void }) {
  return (
    <li className="grad-card">
      <button type="button" className="grad-card-preview" style={{ background: gradientCss(item.gradient) }} onClick={onOpen} aria-label={`Edit ${item.name}`} />
      <div className="grad-card-meta">
        <span>
          <strong>{item.name}</strong>
          <small>
            {item.group} · {GRADIENT_TYPES.find((t) => t.id === item.gradient.type)!.label}
          </small>
        </span>
        <span className="grad-card-actions">
          <button type="button" className="link-btn" onClick={onCopy}>
            Copy CSS
          </button>
          <button type="button" className="link-btn" onClick={onOpen}>
            Edit
          </button>
        </span>
      </div>
    </li>
  );
}

/** Gradients (9): editor with linear, radial and conic, plus a curated set. */
export function GradientsPage({ section }: { section: Section }) {
  const [initial] = useState(initialGradient);
  const [gradient, setGradient] = useState<Gradient>(initial.gradient);
  const [name, setName] = useState(initial.name);
  const [selected, setSelected] = useState(0);
  const [exportAs, setExportAs] = useState<GradientExport>("css");
  const [status, setStatus] = useState<string | null>(initial.name ? `Opened "${initial.name}"` : null);
  const [saved, setSaved] = useState<SavedGradient[]>([]);
  const [group, setGroup] = useState<string | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const placing = useRef(false);

  const g = useMemo(() => normalize(gradient), [gradient]);
  const css = gradientCss(g);
  const code = exportGradient(g, exportAs);

  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_KEY, JSON.stringify(g));
    } catch {
      // ignore
    }
  }, [g]);

  const refresh = useCallback(() => {
    listGradients()
      .then(setSaved)
      .catch(() => setSaved([]));
  }, []);
  useEffect(() => {
    refresh();
    return onLibraryChanged(refresh);
  }, [refresh]);

  const copy = (text: string, what: string) =>
    copyText(text)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  /** Edits keep stops in the order the user sees until they are normalized for output. */
  const change = (next: Gradient, select?: number) => {
    setGradient(next);
    if (select !== undefined && select >= 0) setSelected(select);
  };

  const set = (patch: Partial<Gradient>) => change({ ...gradient, ...patch });

  const load = (next: Gradient, label: string) => {
    setGradient(next);
    setSelected(0);
    setName(label);
    setStatus(`Opened "${label}"`);
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    try {
      await saveGradient(name, g);
      setStatus(`Saved "${name.trim() || "Untitled gradient"}"`);
    } catch (e) {
      setStatus(`Could not save: ${e}`);
    }
  };

  // Radial and conic: click or drag on the preview to move the center.
  const placeCenter = (e: React.PointerEvent) => {
    if (g.type === "linear") return;
    const r = preview.current!.getBoundingClientRect();
    set({
      x: Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))),
      y: Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100))),
    });
  };

  const curated = CURATED_GRADIENTS.filter((c) => !group || c.group === group);
  const sel = Math.min(selected, gradient.stops.length - 1);

  return (
    <div className="page">
      <PageHead section={section} />

      <div
        ref={preview}
        className={`grad-preview${g.type !== "linear" ? " placeable" : ""}`}
        style={{ backgroundImage: css }}
        onPointerDown={(e) => {
          if (g.type === "linear") return;
          placing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          placeCenter(e);
        }}
        onPointerMove={(e) => placing.current && placeCenter(e)}
        onPointerUp={() => (placing.current = false)}
        role="img"
        aria-label={`Gradient preview: ${css}`}
      >
        {g.type !== "linear" && <span className="grad-center" style={{ left: `${g.x}%`, top: `${g.y}%` }} aria-hidden="true" />}
      </div>

      <StopsBar gradient={gradient} selected={sel} onSelect={setSelected} onChange={change} />

      <div className="grad-controls">
        <div className="font-cats" role="group" aria-label="Gradient type">
          {GRADIENT_TYPES.map((t) => (
            <button key={t.id} type="button" className={`chip-btn${g.type === t.id ? " on" : ""}`} aria-pressed={g.type === t.id} onClick={() => set({ type: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
        {g.type !== "radial" && (
          <label className="inline-field">
            {g.type === "linear" ? "Angle" : "Start"}
            <input type="range" min={0} max={359} value={g.angle} onChange={(e) => set({ angle: Number(e.target.value) })} />
            <span className="mono">{g.angle}°</span>
          </label>
        )}
        {g.type === "radial" && (
          <label className="inline-field">
            Shape
            <select value={g.shape} onChange={(e) => set({ shape: e.target.value as Gradient["shape"] })}>
              <option value="circle">Circle</option>
              <option value="ellipse">Ellipse</option>
            </select>
          </label>
        )}
        {g.type !== "linear" && (
          <span className="inline-field">
            Center <span className="mono">{g.x}% {g.y}%</span>
            <button type="button" className="link-btn" onClick={() => set({ x: 50, y: 50 })} disabled={g.x === 50 && g.y === 50}>
              Reset
            </button>
          </span>
        )}
        <label className="inline-field" title={SPACES.find((s) => s.id === g.space)!.hint}>
          Mix in
          <select value={g.space} onChange={(e) => set({ space: e.target.value as Gradient["space"] })}>
            {SPACES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="help" role="status">
        {status ??
          (g.type === "linear"
            ? "Drag the handles to move stops; click the bar to add one. Arrow keys nudge a focused handle, Delete removes it."
            : "Click or drag on the preview to move the center. Drag the handles to move stops; click the bar to add one.")}
      </p>

      <div className="grad-editor">
        <section className="grad-stops-panel" aria-labelledby="grad-stops-h">
          <div className="picks-head">
            <h2 id="grad-stops-h">Stops</h2>
            <span className="grad-tools">
              <button type="button" className="link-btn" onClick={() => change(addStop(gradient), gradient.stops.length)} disabled={gradient.stops.length >= MAX_STOPS}>
                Add
              </button>
              <button type="button" className="link-btn" onClick={() => change(reverse(gradient))}>
                Reverse
              </button>
              <button type="button" className="link-btn" onClick={() => change(distribute(gradient))}>
                Space evenly
              </button>
            </span>
          </div>
          <ol className="grad-stops">
            {gradient.stops.map((s, i) => (
              <StopRow
                key={i}
                stop={s}
                index={i}
                selected={i === sel}
                canRemove={gradient.stops.length > MIN_STOPS}
                onSelect={() => setSelected(i)}
                onChange={(next) => change({ ...gradient, stops: gradient.stops.map((x, k) => (k === i ? next : x)) })}
                onRemove={() => change(removeStop(gradient, i), Math.max(0, i - 1))}
              />
            ))}
          </ol>
        </section>

        <section className="grad-export" aria-labelledby="grad-export-h">
          <div className="picks-head">
            <h2 id="grad-export-h">Code</h2>
            <span className="conv-row">
              <select className="text-input" value={exportAs} onChange={(e) => setExportAs(e.target.value as GradientExport)} aria-label="Export format">
                {GRADIENT_EXPORTS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
              <button type="button" className="secondary-btn" onClick={() => copy(code, GRADIENT_EXPORTS.find((x) => x.id === exportAs)!.label)}>
                Copy
              </button>
            </span>
          </div>
          <pre className="scale-code">{code}</pre>
          {exportAs === "css" && g.space !== "srgb" && (
            <p className="help">The first line is an sRGB fallback with extra stops, for browsers without {g.space === "oklch" ? "OKLCH" : "OKLab"} mixing.</p>
          )}
          <form
            className="conv-row"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input className="text-input" placeholder="Gradient name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Gradient name" maxLength={80} />
            <button type="submit" className="secondary-btn">
              Save gradient
            </button>
          </form>
        </section>
      </div>

      <section className="picks" aria-labelledby="grad-saved-h">
        <div className="picks-head">
          <h2 id="grad-saved-h">Saved gradients</h2>
          <span className="help">{saved.length || "None yet"}</span>
        </div>
        {saved.length > 0 && (
          <ul className="grad-grid small">
            {saved.map((s) => (
              <li key={s.id} className="grad-card">
                <button type="button" className="grad-card-preview" style={{ background: gradientCss(s.gradient) }} onClick={() => load(s.gradient, s.name)} aria-label={`Edit ${s.name}`} />
                <div className="grad-card-meta">
                  <span>
                    <strong>{s.name}</strong>
                  </span>
                  <span className="grad-card-actions">
                    <button type="button" className="link-btn" onClick={() => copy(exportGradient(s.gradient, "css"), `CSS of ${s.name}`)}>
                      Copy CSS
                    </button>
                    <button type="button" className="link-btn" onClick={() => void deleteGradient(s.id)}>
                      Delete
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="grad-curated-h">
        <h2 className="vision-h" id="grad-curated-h">
          Curated gradients
        </h2>
        <div className="font-cats" role="group" aria-label="Gradient groups">
          <button type="button" className={`chip-btn${group === null ? " on" : ""}`} aria-pressed={group === null} onClick={() => setGroup(null)}>
            All <b>{CURATED_GRADIENTS.length}</b>
          </button>
          {GRADIENT_GROUPS.map((gr) => (
            <button key={gr} type="button" className={`chip-btn${group === gr ? " on" : ""}`} aria-pressed={group === gr} onClick={() => setGroup(gr)}>
              {gr} <b>{CURATED_GRADIENTS.filter((c) => c.group === gr).length}</b>
            </button>
          ))}
        </div>
        <ul className="grad-grid">
          {curated.map((c) => (
            <CuratedCard key={c.name} item={c} onOpen={() => load(c.gradient, c.name)} onCopy={() => copy(exportGradient(c.gradient, "css"), `CSS of ${c.name}`)} />
          ))}
        </ul>
      </section>
    </div>
  );
}
