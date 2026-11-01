import { useMemo, useState } from "react";
import { PageHead } from "../components/PageHead";
import { StarButton } from "../components/StarButton";
import { colorSwatchInk } from "../lib/colorInk";
import { copyText, FORMAT_LABELS, formatColor } from "../lib/colors";
import { BRAND_CATEGORIES, BRAND_NOTE, brandCss, BRANDS, searchBrands } from "../lib/colorSets";
import { openExternal } from "../lib/open";
import type { Section } from "../sections";
import { useCopyFormat } from "../useCopyFormat";
import { useStarred } from "../useStarred";

/** Brand colors (8): published colors of well-known brands, HEX only, no logos. */
export function BrandColorsPage({ section }: { section: Section }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const format = useCopyFormat();
  const { isStarred, toggle } = useStarred();
  const list = useMemo(() => searchBrands(query, category), [query, category]);

  const copy = (text: string, what: string) =>
    copyText(text)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  return (
    <div className="page">
      <PageHead section={section} />
      <div className="toolbar-row">
        <input
          type="search"
          className="text-input"
          placeholder="Search a brand, color name or hex"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search brands"
        />
      </div>
      <div className="font-cats" role="group" aria-label="Categories">
        <button type="button" className={`chip-btn${category === null ? " on" : ""}`} aria-pressed={category === null} onClick={() => setCategory(null)}>
          All <small>{BRANDS.length}</small>
        </button>
        {BRAND_CATEGORIES.map((c) => (
          <button key={c} type="button" className={`chip-btn${c === category ? " on" : ""}`} aria-pressed={c === category} onClick={() => setCategory(c)}>
            {c} <small>{BRANDS.filter((b) => b.category === c).length}</small>
          </button>
        ))}
      </div>
      <p className="help" role="status">
        {status ?? `${list.length} brands · click a color to copy its ${FORMAT_LABELS[format]} value`}
      </p>

      {list.length === 0 ? (
        <div className="empty">
          <strong>No brands match “{query}”</strong>
          <span>Search by brand, a color name like “blurple”, or a hex value.</span>
        </div>
      ) : (
        <ul className="brand-list">
          {list.map((b) => (
            <li key={b.name} className="brand-row">
              <div className="brand-meta">
                <strong>{b.name}</strong>
                <small>{b.category}</small>
                <span className="brand-links">
                  <button type="button" className="link-btn" onClick={() => void openExternal((b.guide ?? b.site)!)}>
                    {b.guide ? "Brand guidelines ↗" : "Website ↗"}
                  </button>
                  <button type="button" className="link-btn" onClick={() => copy(brandCss(b), `CSS variables for ${b.name}`)}>
                    Copy CSS
                  </button>
                </span>
              </div>
              <ul className="brand-colors">
                {b.colors.map((c) => {
                  const value = formatColor(c.hex, format);
                  return (
                    <li key={c.hex + c.name} className="brand-color" style={{ background: c.hex, color: colorSwatchInk(c.hex) }}>
                      <button type="button" className="brand-copy" onClick={() => copy(value, `${b.name} ${c.name} ${value}`)} title={`Copy ${value}`}>
                        <span>{c.name}</span>
                        <span className="mono">{c.hex}</span>
                      </button>
                      <StarButton className="cc-star" on={isStarred(c.hex)} onClick={() => toggle(c.hex)} />
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p className="note">{BRAND_NOTE}</p>
    </div>
  );
}
