import { useEffect, useMemo, useState } from "react";
import {
  copyText,
  FORMAT_LABELS,
  formatColor,
  getCopyFormat,
  GRAY_CHROMA,
  NAMED_COLORS,
  onCopyFormat,
  type ColorFormat,
  type NamedColor,
} from "../lib/colors";
import type { Section } from "../sections";
import { PageHead } from "../components/PageHead";

type Sort = "hue" | "name" | "light";
const SORTS: { id: Sort; label: string }[] = [
  { id: "hue", label: "Hue" },
  { id: "name", label: "Name" },
  { id: "light", label: "Lightness" },
];

function sorted(list: NamedColor[], sort: Sort): NamedColor[] {
  const out = [...list];
  if (sort === "name") return out.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "light") return out.sort((a, b) => b.l - a.l);
  // Hue: colors around the wheel, then grays light to dark.
  return out.sort((a, b) => {
    const ga = a.c < GRAY_CHROMA;
    const gb = b.c < GRAY_CHROMA;
    if (ga !== gb) return ga ? 1 : -1;
    if (ga) return b.l - a.l;
    return a.h - b.h || b.l - a.l;
  });
}

/** HTML color names (13): the 148 CSS named colors. */
export function ColorNamesPage({ section }: { section: Section }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("hue");
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    getCopyFormat().then(setFormat);
    return onCopyFormat(setFormat);
  }, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    const hit = (c: NamedColor) => !q || c.name.includes(q) || c.hex.toLowerCase().includes(q.replace(/^#/, ""));
    return sorted(NAMED_COLORS.filter(hit), sort);
  }, [query, sort]);

  const copy = (c: NamedColor, what: "name" | "value") => {
    const text = what === "name" ? c.name : formatColor(c.hex, format);
    copyText(text)
      .then(() => setCopied(text))
      .catch(() => {});
  };

  return (
    <div className="page">
      <PageHead section={section} />
      <div className="toolbar-row">
        <input
          type="search"
          className="text-input"
          placeholder="Search by name or hex"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search color names"
        />
        <div className="theme-switch" role="group" aria-label="Sort by">
          {SORTS.map((s) => (
            <button key={s.id} type="button" className={sort === s.id ? "on" : ""} onClick={() => setSort(s.id)} aria-pressed={sort === s.id}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="mono" aria-live="polite">
          {copied ? `Copied ${copied}` : `${list.length} colors · click to copy the name, or the ${FORMAT_LABELS[format]} value`}
        </span>
      </div>
      {list.length === 0 ? (
        <div className="empty">
          <strong>No color names match “{query}”</strong>
          <span>Names are single words like “cornflowerblue”.</span>
        </div>
      ) : (
        <ul className="names-grid">
          {list.map((c) => (
            <li key={c.name} className="name-card">
              <button
                type="button"
                className="name-sw"
                style={{ background: c.hex }}
                onClick={() => copy(c, "value")}
                aria-label={`Copy ${formatColor(c.hex, format)}`}
                title={`Copy ${formatColor(c.hex, format)}`}
              />
              <button type="button" className="name-text" onClick={() => copy(c, "name")} title={`Copy “${c.name}”`}>
                <strong>{c.name}</strong>
              </button>
              <button type="button" className="name-hex mono" onClick={() => copy(c, "value")} title={`Copy ${formatColor(c.hex, format)}`}>
                {c.hex}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
