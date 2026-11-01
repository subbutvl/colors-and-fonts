import { useCallback, useEffect, useState } from "react";
import { PageHead } from "../components/PageHead";
import { StarButton } from "../components/StarButton";
import { copyText, FORMAT_LABELS, formatColor, getCopyFormat, nearestName, onCopyFormat, type ColorFormat } from "../lib/colors";
import { exportLibrary, listStarred, onLibraryChanged, setColorNote, unstarColor, type StarredColor } from "../lib/library";
import { deletePalette, listPalettes, renamePalette, requestOpenPalette, type SavedPalette } from "../lib/palettes";
import type { Section } from "../sections";

/** A note field that saves when it loses focus or on Enter. */
function NoteField({ color }: { color: StarredColor }) {
  const [value, setValue] = useState(color.note);
  useEffect(() => setValue(color.note), [color.note]);
  const commit = () => {
    if (value.trim() !== color.note) setColorNote(color.hex, value).catch((e) => console.error("note", e));
  };
  return (
    <input
      className="saved-note"
      value={value}
      placeholder="Add a note"
      maxLength={200}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setValue(color.note);
          e.currentTarget.blur();
        }
      }}
      aria-label={`Note for ${color.hex}`}
    />
  );
}

/** Saved (Picker group): starred colors and saved palettes in one place. */
export function SavedPage({ section }: { section: Section }) {
  const [colors, setColors] = useState<StarredColor[]>([]);
  const [palettes, setPalettes] = useState<SavedPalette[]>([]);
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([listStarred(), listPalettes()])
      .then(([c, p]) => {
        setColors(c);
        setPalettes(p);
      })
      .catch((e) => setStatus(`Could not load the library: ${e}`));
  }, []);

  useEffect(() => {
    reload();
    getCopyFormat().then(setFormat);
    const offLib = onLibraryChanged(reload);
    const offFormat = onCopyFormat(setFormat);
    return () => {
      offLib();
      offFormat();
    };
  }, [reload]);

  const copy = (text: string, what = text) =>
    copyText(text)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  const q = query.trim().toLowerCase();
  const shownColors = q
    ? colors.filter((c) => c.hex.toLowerCase().includes(q.replace(/^#?/, "")) || c.note.toLowerCase().includes(q) || nearestName(c.hex).name.includes(q))
    : colors;
  const shownPalettes = q ? palettes.filter((p) => p.name.toLowerCase().includes(q) || p.colors.some((c) => c.toLowerCase().includes(q.replace(/^#?/, "")))) : palettes;

  const open = (p: SavedPalette) => {
    requestOpenPalette(p.id);
    window.location.hash = "/palettes";
  };

  const rename = async () => {
    if (!renaming) return;
    try {
      await renamePalette(renaming.id, renaming.name);
      setRenaming(null);
    } catch (e) {
      setStatus(`Could not rename: ${e}`);
    }
  };

  const drop = async (p: SavedPalette) => {
    try {
      await deletePalette(p.id);
      setStatus(`Deleted "${p.name}"`);
    } catch (e) {
      setStatus(`Could not delete: ${e}`);
    }
  };

  const exportAll = async () => {
    try {
      await copy(await exportLibrary(), `the library as JSON (${colors.length} colors, ${palettes.length} palettes)`);
    } catch (e) {
      setStatus(`Could not export: ${e}`);
    }
  };

  const empty = colors.length === 0 && palettes.length === 0;

  return (
    <div className="page">
      <PageHead section={section} />

      <div className="toolbar-row">
        <input
          className="text-input saved-search"
          type="search"
          placeholder="Search by hex, name or note"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the library"
        />
        <button type="button" className="secondary-btn" onClick={() => void exportAll()} disabled={empty}>
          Copy library as JSON
        </button>
      </div>

      <p className="help" role="status">
        {status ?? (empty ? "Nothing saved yet. Star a color in Recent picks, the toolbar or the Converter, or save a palette." : `Click a color to copy it as ${FORMAT_LABELS[format]}.`)}
      </p>

      <section className="picks" aria-labelledby="saved-colors">
        <div className="picks-head">
          <h2 id="saved-colors">Colors</h2>
          <span className="help">{q ? `${shownColors.length} of ${colors.length}` : colors.length || "None yet"}</span>
        </div>
        {shownColors.length > 0 && (
          <ul className="saved-colors">
            {shownColors.map((c) => {
              const value = formatColor(c.hex, format);
              return (
                <li key={c.id} className="saved-color">
                  <button type="button" className="saved-sw" style={{ background: c.hex }} onClick={() => copy(value)} title={`Copy ${value}`} />
                  <div className="saved-color-meta">
                    <span className="saved-color-top">
                      <code>{c.hex}</code>
                      <StarButton on onClick={() => void unstarColor(c.hex)} />
                    </span>
                    <small>{nearestName(c.hex).name}</small>
                    <NoteField color={c} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="picks" aria-labelledby="saved-palettes">
        <div className="picks-head">
          <h2 id="saved-palettes">Palettes</h2>
          <span className="help">{q ? `${shownPalettes.length} of ${palettes.length}` : palettes.length || "None yet"}</span>
        </div>
        {shownPalettes.length > 0 && (
          <ul className="saved-pals">
            {shownPalettes.map((p) => (
              <li key={p.id} className="saved-pal">
                <button type="button" className="saved-strip" onClick={() => open(p)} title="Open in Palettes">
                  {p.colors.map((c, i) => (
                    <span key={i} style={{ background: c }} />
                  ))}
                </button>
                {renaming?.id === p.id ? (
                  <form
                    className="saved-meta"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void rename();
                    }}
                  >
                    <input
                      className="text-input saved-rename"
                      value={renaming.name}
                      maxLength={80}
                      autoFocus
                      onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
                      onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                      aria-label="Palette name"
                    />
                    <button type="submit" className="link-btn">
                      Save
                    </button>
                  </form>
                ) : (
                  <div className="saved-meta">
                    <strong>{p.name}</strong>
                    <button type="button" className="link-btn" onClick={() => copy(p.colors.map((c) => formatColor(c, format)).join(", "), `"${p.name}"`)}>
                      Copy
                    </button>
                    <button type="button" className="link-btn" onClick={() => setRenaming({ id: p.id, name: p.name })}>
                      Rename
                    </button>
                    <button type="button" className="link-btn" onClick={() => void drop(p)}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="note">Gradients and fonts you star will appear here once those sections are built. Everything is stored on this computer.</p>
    </div>
  );
}
