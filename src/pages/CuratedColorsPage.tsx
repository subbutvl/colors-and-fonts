import { useMemo, useState } from "react";
import { PageHead } from "../components/PageHead";
import { StarButton } from "../components/StarButton";
import { colorSwatchInk } from "../lib/colorInk";
import { copyText, FORMAT_LABELS, formatColor } from "../lib/colors";
import { COLOR_COLLECTIONS, searchPalettes, type CuratedPalette } from "../lib/colorSets";
import { requestOpenPalette, savePalette } from "../lib/palettes";
import type { Section } from "../sections";
import { useCopyFormat } from "../useCopyFormat";
import { useStarred } from "../useStarred";

/** Curated colors (7): our hand-picked palettes by mood and theme. */
export function CuratedColorsPage({ section }: { section: Section }) {
  const [collection, setCollection] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const format = useCopyFormat();
  const { isStarred, toggle } = useStarred();
  const results = useMemo(() => searchPalettes(query, collection), [query, collection]);
  const active = COLOR_COLLECTIONS.find((c) => c.id === collection);

  const copy = (text: string, what: string) =>
    copyText(text)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  const openInPalettes = (p: CuratedPalette) =>
    savePalette(p.name, p.colors)
      .then((id) => {
        requestOpenPalette(id);
        window.location.hash = "/palettes";
      })
      .catch((e) => setStatus(`Could not save the palette: ${e}`));

  return (
    <div className="page">
      <PageHead section={section} />
      <div className="toolbar-row">
        <input
          type="search"
          className="text-input"
          placeholder="Search palettes or a hex value"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search palettes"
        />
      </div>
      <div className="font-cats" role="group" aria-label="Collections">
        <button type="button" className={`chip-btn${collection === null ? " on" : ""}`} aria-pressed={collection === null} onClick={() => setCollection(null)}>
          All
        </button>
        {COLOR_COLLECTIONS.map((c) => (
          <button key={c.id} type="button" className={`chip-btn${c.id === collection ? " on" : ""}`} aria-pressed={c.id === collection} onClick={() => setCollection(c.id)}>
            {c.title} <small>{c.palettes.length}</small>
          </button>
        ))}
      </div>
      {active && <p className="note">{active.blurb}</p>}
      <p className="help" role="status">
        {status ?? `${results.length} palettes · click a color to copy its ${FORMAT_LABELS[format]} value`}
      </p>

      {results.length === 0 ? (
        <div className="empty">
          <strong>No palettes match “{query}”</strong>
          <span>Try a mood like “ocean”, a name, or part of a hex value.</span>
        </div>
      ) : (
        <ul className="cc-grid">
          {results.map(({ collection: c, palette: p }) => (
            <li key={p.name} className="cc-card">
              <div className="cc-strip">
                {p.colors.map((hex) => (
                  <div key={hex} className="cc-sw" style={{ background: hex, color: colorSwatchInk(hex) }}>
                    <button type="button" className="cc-sw-copy" onClick={() => copy(formatColor(hex, format), formatColor(hex, format))} title={`Copy ${formatColor(hex, format)}`}>
                      <span className="mono">{hex.slice(1)}</span>
                    </button>
                    <StarButton className="cc-star" on={isStarred(hex)} onClick={() => toggle(hex)} />
                  </div>
                ))}
              </div>
              <div className="cc-foot">
                <span>
                  <strong>{p.name}</strong>
                  {!collection && <small>{c.title}</small>}
                </span>
                <span className="cc-actions">
                  <button type="button" className="link-btn" onClick={() => copy(p.colors.join(", "), `${p.name} as a HEX list`)}>
                    Copy
                  </button>
                  <button type="button" className="link-btn" onClick={() => openInPalettes(p)} title="Save to your palettes and open it in Palettes">
                    Open in Palettes
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
