import { useCallback, useEffect, useState } from "react";
import { PageHead } from "../components/PageHead";
import { contrast, copyText, FORMAT_LABELS, formatColor, getCopyFormat, nearestName, onCopyFormat, type ColorFormat } from "../lib/colors";
import {
  exportPalette,
  generate,
  HARMONIES,
  MAX_COLORS,
  MIN_COLORS,
  type ExportFormat,
  type Harmony,
} from "../lib/palette";
import { onLibraryChanged } from "../lib/library";
import { deletePalette, listPalettes, savePalette, takeOpenRequest, type SavedPalette } from "../lib/palettes";
import { takePaletteSeed } from "../lib/colorDetails";
import { colorSwatchInk } from "../lib/colorInk";
import { filterTopPalettes, TOP_PALETTE_TAGS, TOP_PALETTES, TOP_PALETTES_NOTE, type TopPalette } from "../lib/topPalettes";
import type { Section } from "../sections";

interface Slot {
  hex: string;
  locked: boolean;
}

const EXPORTS: { id: ExportFormat; label: string }[] = [
  { id: "css", label: "CSS variables" },
  { id: "json", label: "JSON array" },
  { id: "list", label: "Comma list" },
];

const fresh = (harmony: Harmony, count: number, current: Slot[] = []): Slot[] =>
  generate({ harmony, count, current }).map((hex, i) => ({ hex, locked: current[i]?.locked ?? false }));

/** Black or white, whichever reads better on the swatch. */
const inkOn = (hex: string) => (contrast("#FFFFFF", hex).ratio >= contrast("#111111", hex).ratio ? "#FFFFFF" : "#111111");

/** Space should generate unless the user is typing or on a control. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName);
}

/** Palettes (1): generate, lock, reorder, export and save, plus our top 100. */
export function PalettesPage({ section }: { section: Section }) {
  const [harmony, setHarmony] = useState<Harmony>("analogous");
  const [slots, setSlots] = useState<Slot[]>(() => fresh("analogous", 5));
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [exportAs, setExportAs] = useState<ExportFormat>("css");
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<SavedPalette[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [topQuery, setTopQuery] = useState("");
  const [topTag, setTopTag] = useState<string | null>(null);

  useEffect(() => {
    getCopyFormat().then(setFormat);
    return onCopyFormat(setFormat);
  }, []);

  const refresh = useCallback(() => {
    listPalettes()
      .then(setSaved)
      .catch((e) => setStatus(`Could not load saved palettes: ${e}`));
  }, []);
  useEffect(() => {
    refresh();
    return onLibraryChanged(refresh);
  }, [refresh]);

  // Opened from Color details ("Start a palette"): that color, locked, first.
  useEffect(() => {
    const seed = takePaletteSeed();
    if (seed) setSlots(fresh(harmony, 5, [{ hex: seed, locked: true }]));
    // Only on open.
  }, []);

  // Opened from the Saved page: load that palette into the generator.
  useEffect(() => {
    const id = takeOpenRequest();
    if (id === null) return;
    listPalettes()
      .then((list) => {
        const p = list.find((x) => x.id === id);
        if (p) load(p);
      })
      .catch(() => {});
  }, []);

  const regenerate = useCallback(() => {
    setSlots((s) => fresh(harmony, s.length, s));
    setStatus(null);
  }, [harmony]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target)) return;
      e.preventDefault();
      regenerate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [regenerate]);

  const update = (i: number, change: Partial<Slot>) =>
    setSlots((s) => s.map((slot, j) => (j === i ? { ...slot, ...change } : slot)));

  const move = (i: number, by: number) =>
    setSlots((s) => {
      const j = i + by;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const remove = (i: number) => setSlots((s) => (s.length > MIN_COLORS ? s.filter((_, j) => j !== i) : s));

  /** One more color that fits the palette, added at the end. */
  const add = () =>
    setSlots((s) => {
      if (s.length >= MAX_COLORS) return s;
      const grown = fresh(harmony, s.length + 1, s.map((slot) => ({ ...slot, locked: true })));
      return [...s, { hex: grown[s.length].hex, locked: false }];
    });

  const copy = (text: string, what: string) =>
    copyText(text)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  const hexes = slots.map((s) => s.hex);

  const save = async () => {
    try {
      await savePalette(name, hexes);
      setStatus(`Saved "${name.trim() || "Untitled palette"}"`);
      setName("");
      refresh();
    } catch (e) {
      setStatus(`Could not save: ${e}`);
    }
  };

  const load = (p: SavedPalette) => {
    setSlots(p.colors.slice(0, MAX_COLORS).map((hex) => ({ hex, locked: false })));
    setName(p.name);
    setStatus(`Loaded "${p.name}"`);
  };

  /** A ready-made palette into the generator, unlocked, and back to the top. */
  const openTop = (p: TopPalette) => {
    setSlots(p.colors.map((hex) => ({ hex, locked: false })));
    setName(p.name);
    setStatus(`Opened "${p.name}": lock the colors you like, then press Space.`);
    document.querySelector(".content")?.scrollTo({ top: 0, behavior: "smooth" });
  };
  const top = filterTopPalettes(topQuery, topTag);

  const drop = async (p: SavedPalette) => {
    try {
      await deletePalette(p.id);
      setStatus(`Deleted "${p.name}"`);
      refresh();
    } catch (e) {
      setStatus(`Could not delete: ${e}`);
    }
  };

  return (
    <div className="page">
      <PageHead section={section} />

      <div className="toolbar-row">
        <button type="button" className="primary-btn" onClick={regenerate}>
          Generate <kbd>Space</kbd>
        </button>
        <label className="inline-field">
          Harmony
          <select value={harmony} onChange={(e) => setHarmony(e.target.value as Harmony)}>
            {HARMONIES.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </select>
        </label>
        <div className="stepper" role="group" aria-label="Number of colors">
          <button type="button" onClick={() => remove(slots.length - 1)} disabled={slots.length <= MIN_COLORS} aria-label="Fewer colors">
            −
          </button>
          <span>{slots.length} colors</span>
          <button type="button" onClick={add} disabled={slots.length >= MAX_COLORS} aria-label="More colors">
            +
          </button>
        </div>
      </div>

      <ol className="pal-strip" aria-label="Palette">
        {slots.map((slot, i) => {
          const ink = inkOn(slot.hex);
          const value = formatColor(slot.hex, format);
          return (
            <li key={i} className="pal-col" style={{ background: slot.hex, color: ink }}>
              <button type="button" className="pal-hex" onClick={() => copy(value, value)} title={`Copy ${FORMAT_LABELS[format]}`}>
                {slot.hex}
              </button>
              <span className="pal-name">{nearestName(slot.hex).name}</span>
              <div className="pal-tools">
                <button
                  type="button"
                  className={slot.locked ? "on" : ""}
                  onClick={() => update(i, { locked: !slot.locked })}
                  aria-pressed={slot.locked}
                  title={slot.locked ? "Unlock" : "Lock (keep when generating)"}
                >
                  {slot.locked ? "Locked" : "Lock"}
                </button>
                <label className="pal-edit" title="Edit color">
                  Edit
                  <input type="color" value={slot.hex.toLowerCase()} onChange={(e) => update(i, { hex: e.target.value.toUpperCase() })} />
                </label>
                <span className="pal-move">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move left">
                    ←
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === slots.length - 1} aria-label="Move right">
                    →
                  </button>
                </span>
                <button type="button" onClick={() => remove(i)} disabled={slots.length <= MIN_COLORS} aria-label="Remove color">
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="help" role="status">
        {status ?? `Space generates new colors; locked ones stay. Click a hex to copy it as ${FORMAT_LABELS[format]}.`}
      </p>

      <div className="pal-actions">
        <div className="conv-row">
          <select className="text-input" value={exportAs} onChange={(e) => setExportAs(e.target.value as ExportFormat)} aria-label="Export format">
            {EXPORTS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <button type="button" className="secondary-btn" onClick={() => copy(exportPalette(hexes, exportAs, name || "palette"), EXPORTS.find((x) => x.id === exportAs)!.label)}>
            Copy export
          </button>
        </div>
        <form
          className="conv-row"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input className="text-input" placeholder="Palette name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Palette name" maxLength={80} />
          <button type="submit" className="secondary-btn">
            Save palette
          </button>
        </form>
      </div>

      <section className="picks">
        <div className="picks-head">
          <h2>Saved palettes</h2>
          <span className="help">{saved.length || "None yet"}</span>
        </div>
        {saved.length > 0 && (
          <ul className="saved-pals">
            {saved.map((p) => (
              <li key={p.id} className="saved-pal">
                <button type="button" className="saved-strip" onClick={() => load(p)} title="Open in the generator">
                  {p.colors.map((c, i) => (
                    <span key={i} style={{ background: c }} />
                  ))}
                </button>
                <div className="saved-meta">
                  <strong>{p.name}</strong>
                  <span className="mono">{p.colors.length} colors</span>
                  <button type="button" className="link-btn" onClick={() => void drop(p)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="top-pals" aria-labelledby="top-pals-title">
        <div className="picks-head">
          <h2 id="top-pals-title">Top {TOP_PALETTES.length} palettes</h2>
          <input
            className="text-input"
            type="search"
            placeholder="Search names or hex"
            value={topQuery}
            onChange={(e) => setTopQuery(e.target.value)}
            aria-label="Search top palettes"
          />
        </div>
        <div className="font-cats" role="group" aria-label="Filter top palettes">
          <button type="button" className={`chip-btn${topTag === null ? " on" : ""}`} aria-pressed={topTag === null} onClick={() => setTopTag(null)}>
            All
          </button>
          {TOP_PALETTE_TAGS.map((t) => (
            <button key={t} type="button" className={`chip-btn${t === topTag ? " on" : ""}`} aria-pressed={t === topTag} onClick={() => setTopTag(t === topTag ? null : t)}>
              {t}
            </button>
          ))}
        </div>
        <p className="help">{TOP_PALETTES_NOTE} Click a color to copy it; Open puts the palette in the generator.</p>
        {top.length === 0 ? (
          <p className="note">No palette matches.</p>
        ) : (
          <ul className="cc-grid top-grid">
            {top.map((p) => (
              <li key={p.id} className="cc-card">
                <div className="cc-strip">
                  {p.colors.map((hex) => {
                    const value = formatColor(hex, format);
                    return (
                      <div key={hex} className="cc-sw" style={{ background: hex, color: colorSwatchInk(hex) }}>
                        <button type="button" className="cc-sw-copy" onClick={() => copy(value, value)} title={`Copy ${value}`}>
                          <span className="mono">{hex.slice(1)}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="cc-foot">
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.tags.join(" · ")}</small>
                  </span>
                  <span className="cc-actions">
                    <button type="button" className="link-btn" onClick={() => copy(p.colors.join(", "), `${p.name} as a HEX list`)}>
                      Copy
                    </button>
                    <button type="button" className="link-btn" onClick={() => openTop(p)}>
                      Open
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
