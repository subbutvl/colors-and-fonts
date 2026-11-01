import { useCallback, useEffect, useState } from "react";
import { PageHead } from "../components/PageHead";
import { StarButton } from "../components/StarButton";
import { copyText, FORMAT_LABELS, formatColor, getCopyFormat, nearestName, onCopyFormat, type ColorFormat } from "../lib/colors";
import { fallbackFor, fontFamilyCss, getCatalog, loadPreviewFont, type FontFamily } from "../lib/fonts";
import {
  exportLibrary,
  listStarred,
  listStarredFonts,
  onLibraryChanged,
  setColorNote,
  setFontNote,
  unstarColor,
  unstarFont,
  type StarredColor,
  type StarredFont,
} from "../lib/library";
import { deletePalette, listPalettes, renamePalette, requestOpenPalette, type SavedPalette } from "../lib/palettes";
import type { Section } from "../sections";

/** A note field that saves when it loses focus or on Enter. */
function NoteField({ note, label, onSave }: { note: string; label: string; onSave: (note: string) => Promise<void> }) {
  const [value, setValue] = useState(note);
  useEffect(() => setValue(note), [note]);
  const commit = () => {
    if (value.trim() !== note) onSave(value).catch((e) => console.error("note", e));
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
          setValue(note);
          e.currentTarget.blur();
        }
      }}
      aria-label={label}
    />
  );
}

/** A starred font, previewed in itself when the catalog knows it. */
function SavedFontRow({ font, info, onCopy }: { font: StarredFont; info?: FontFamily; onCopy: (text: string, what: string) => void }) {
  useEffect(() => {
    if (info) loadPreviewFont(info, 400);
  }, [info]);
  return (
    <li className="saved-font">
      <div className="saved-font-main">
        <span className="saved-font-name" style={{ fontFamily: info ? `"${font.family}", ${fallbackFor(info.category)}` : undefined }}>
          {font.family}
        </span>
        <NoteField note={font.note} label={`Note for ${font.family}`} onSave={(n) => setFontNote(font.family, n)} />
      </div>
      {info && (
        <button type="button" className="link-btn" onClick={() => onCopy(fontFamilyCss(info), `font-family for ${font.family}`)}>
          Copy CSS
        </button>
      )}
      <StarButton on onClick={() => void unstarFont(font.family)} />
    </li>
  );
}

/** Saved (Picker group): starred colors, saved palettes and starred fonts in one place. */
export function SavedPage({ section }: { section: Section }) {
  const [colors, setColors] = useState<StarredColor[]>([]);
  const [palettes, setPalettes] = useState<SavedPalette[]>([]);
  const [fonts, setFonts] = useState<StarredFont[]>([]);
  const [catalog, setCatalog] = useState<Map<string, FontFamily>>(new Map());
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([listStarred(), listPalettes(), listStarredFonts()])
      .then(([c, p, f]) => {
        setColors(c);
        setPalettes(p);
        setFonts(f);
      })
      .catch((e) => setStatus(`Could not load the library: ${e}`));
  }, []);

  useEffect(() => {
    getCatalog()
      .then((cat) => setCatalog(new Map(cat.families.map((f) => [f.family, f]))))
      .catch(() => {});
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
  const shownFonts = q ? fonts.filter((f) => f.family.toLowerCase().includes(q) || f.note.toLowerCase().includes(q)) : fonts;
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
      await copy(await exportLibrary(), `the library as JSON (${colors.length} colors, ${palettes.length} palettes, ${fonts.length} fonts)`);
    } catch (e) {
      setStatus(`Could not export: ${e}`);
    }
  };

  const empty = colors.length === 0 && palettes.length === 0 && fonts.length === 0;

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
        {status ?? (empty ? "Nothing saved yet. Star a color in Recent picks, the toolbar or the Converter, save a palette, or star a font in Font listing." : `Click a color to copy it as ${FORMAT_LABELS[format]}.`)}
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
                    <NoteField note={c.note} label={`Note for ${c.hex}`} onSave={(n) => setColorNote(c.hex, n)} />
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

      <section className="picks" aria-labelledby="saved-fonts">
        <div className="picks-head">
          <h2 id="saved-fonts">Fonts</h2>
          <span className="help">{q ? `${shownFonts.length} of ${fonts.length}` : fonts.length || "None yet"}</span>
        </div>
        {shownFonts.length > 0 && (
          <ul className="saved-fonts">
            {shownFonts.map((f) => (
              <SavedFontRow key={f.id} font={f} info={catalog.get(f.family)} onCopy={copy} />
            ))}
          </ul>
        )}
      </section>

      <p className="note">Gradients you star will appear here once that section is built. Everything is stored on this computer.</p>
    </div>
  );
}
