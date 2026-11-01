import { useEffect, useMemo, useRef, useState } from "react";
import { PageHead } from "../components/PageHead";
import { StarButton } from "../components/StarButton";
import { copyText } from "../lib/colors";
import {
  CATEGORIES,
  cssUrl,
  fallbackFor,
  filterFonts,
  fontFamilyCss,
  getCatalog,
  googleFontsPage,
  importRule,
  linkTag,
  loadPreviewFont,
  previewWeight,
  sortFonts,
  styleCount,
  subsetLabel,
  subsetsByUse,
  WEIGHT_NAMES,
  type Catalog,
  type FontCategory,
  type FontFamily,
  type FontSort,
} from "../lib/fonts";
import { openExternal } from "../lib/open";
import type { Section } from "../sections";
import { useStarredFonts } from "../useStarredFonts";

const PAGE = 48;
const STORE_KEY = "huetype.fonts.listing";
const DEFAULT_TEXT = "The quick brown fox jumps over the lazy dog";
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

interface Prefs {
  text: string;
  size: number;
  weight: number;
  categories: FontCategory[];
  variableOnly: boolean;
  italicOnly: boolean;
  subset: string;
  hasWeight: number;
  sort: FontSort;
}

const DEFAULTS: Prefs = { text: "", size: 32, weight: 400, categories: [], variableOnly: false, italicOnly: false, subset: "", hasWeight: 0, sort: "popular" };

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

/** One family: name, facts, a live preview and copy actions. */
function FontCard({
  font,
  text,
  size,
  weight,
  starred,
  onStar,
  onCopy,
}: {
  font: FontFamily;
  text: string;
  size: number;
  weight: number;
  starred: boolean;
  onStar: () => void;
  onCopy: (text: string, what: string) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [visible, setVisible] = useState(false);
  const w = previewWeight(font, weight);

  // Fetch the font only once its card scrolls near the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (visible) loadPreviewFont(font, w);
  }, [visible, font, w]);

  const wght = font.axes.find((a) => a.tag === "wght");
  const otherAxes = font.axes.filter((a) => a.tag !== "wght" && a.tag !== "ital").map((a) => a.tag);

  return (
    <li ref={ref} className="font-card">
      <div className="font-card-head">
        <strong>{font.family}</strong>
        <StarButton on={starred} onClick={onStar} />
      </div>
      <div className="font-card-meta">
        <span>{CATEGORIES.find((c) => c.id === font.category)?.label}</span>
        <span>
          {styleCount(font)} {styleCount(font) === 1 ? "style" : "styles"}
        </span>
        {wght && (
          <span className="badge" title={`Variable weight ${wght.min} to ${wght.max}${otherAxes.length ? `; also ${otherAxes.join(", ")}` : ""}`}>
            Variable{otherAxes.length ? ` +${otherAxes.length}` : ""}
          </span>
        )}
        {font.rank && <span title="Popularity on Google Fonts">#{font.rank}</span>}
      </div>
      <p
        className="font-preview"
        style={{ fontFamily: visible ? `"${font.family}", ${fallbackFor(font.category)}` : undefined, fontSize: size, fontWeight: w }}
        lang="en"
      >
        {text || DEFAULT_TEXT}
      </p>
      <div className="font-card-actions">
        <button type="button" className="link-btn" onClick={() => onCopy(fontFamilyCss(font), `font-family for ${font.family}`)}>
          Copy CSS
        </button>
        <button type="button" className="link-btn" onClick={() => onCopy(linkTag(font), `<link> tags for ${font.family}`)}>
          Copy &lt;link&gt;
        </button>
        <button type="button" className="link-btn" onClick={() => onCopy(importRule(font), `@import for ${font.family}`)}>
          Copy @import
        </button>
        <button type="button" className="link-btn" onClick={() => void openExternal(googleFontsPage(font))} title={cssUrl(font)}>
          Google Fonts ↗
        </button>
      </div>
    </li>
  );
}

/** Font listing (15): every Google Fonts family with live previews. */
export function FontListingPage({ section }: { section: Section }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [status, setStatus] = useState<string | null>(null);
  const { isStarred, toggle } = useStarredFonts();
  const more = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch((e) => setStatus(`Could not load the font catalog: ${e}`));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }, [prefs]);

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value }));

  const hasRank = !!catalog?.families.some((f) => f.rank);
  const sort: FontSort = prefs.sort === "popular" && !hasRank ? "name" : prefs.sort;
  const subsets = useMemo(() => (catalog ? subsetsByUse(catalog.families) : []), [catalog]);
  const results = useMemo(() => {
    if (!catalog) return [];
    const list = filterFonts(catalog.families, {
      query,
      categories: prefs.categories,
      variableOnly: prefs.variableOnly,
      italicOnly: prefs.italicOnly,
      subset: prefs.subset || undefined,
      weight: prefs.hasWeight || undefined,
    });
    return sortFonts(list, sort);
  }, [catalog, query, prefs.categories, prefs.variableOnly, prefs.italicOnly, prefs.subset, prefs.hasWeight, sort]);

  // New filters start from the top of the list again.
  useEffect(() => setShown(PAGE), [query, prefs.categories, prefs.variableOnly, prefs.italicOnly, prefs.subset, prefs.hasWeight, sort]);

  // Load the next page when the end of the list comes into view.
  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setShown((n) => n + PAGE), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, results.length]);

  const toggleCategory = (c: FontCategory) =>
    set("categories", prefs.categories.includes(c) ? prefs.categories.filter((x) => x !== c) : [...prefs.categories, c]);

  const copy = (text: string, what: string) =>
    copyText(text)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  const filtered = query || prefs.categories.length || prefs.variableOnly || prefs.italicOnly || prefs.subset || prefs.hasWeight;

  return (
    <div className="page">
      <PageHead section={section} />

      <div className="font-controls">
        <input
          className="text-input font-search"
          type="search"
          placeholder="Search families"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search font families"
        />
        <input
          className="text-input font-sample"
          placeholder={DEFAULT_TEXT}
          value={prefs.text}
          onChange={(e) => set("text", e.target.value)}
          aria-label="Preview text"
          maxLength={200}
        />
        <label className="inline-field">
          Size
          <input type="range" min={12} max={96} value={prefs.size} onChange={(e) => set("size", Number(e.target.value))} aria-label="Preview size" />
          <span className="mono">{prefs.size}px</span>
        </label>
        <label className="inline-field">
          Weight
          <select value={prefs.weight} onChange={(e) => set("weight", Number(e.target.value))} aria-label="Preview weight">
            {WEIGHTS.map((w) => (
              <option key={w} value={w}>
                {w} {WEIGHT_NAMES[w]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="font-filters">
        <div className="font-cats" role="group" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={`chip-btn${prefs.categories.includes(c.id) ? " on" : ""}`} aria-pressed={prefs.categories.includes(c.id)} onClick={() => toggleCategory(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <label className="inline-field">
          <input type="checkbox" checked={prefs.variableOnly} onChange={(e) => set("variableOnly", e.target.checked)} />
          Variable
        </label>
        <label className="inline-field">
          <input type="checkbox" checked={prefs.italicOnly} onChange={(e) => set("italicOnly", e.target.checked)} />
          Has italics
        </label>
        <label className="inline-field">
          Script
          <select value={prefs.subset} onChange={(e) => set("subset", e.target.value)}>
            <option value="">Any</option>
            {subsets.map((s) => (
              <option key={s.id} value={s.id}>
                {subsetLabel(s.id)} ({s.count})
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          Has weight
          <select value={prefs.hasWeight} onChange={(e) => set("hasWeight", Number(e.target.value))}>
            <option value={0}>Any</option>
            {WEIGHTS.map((w) => (
              <option key={w} value={w}>
                {w} {WEIGHT_NAMES[w]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          Sort
          <select value={sort} onChange={(e) => set("sort", e.target.value as FontSort)}>
            {hasRank && <option value="popular">Most popular</option>}
            <option value="name">Name</option>
            <option value="newest">Recently updated</option>
            <option value="styles">Most styles</option>
          </select>
        </label>
      </div>

      <p className="help" role="status">
        {status ??
          (catalog
            ? `${results.length.toLocaleString()} of ${catalog.families.length.toLocaleString()} families. ${
                catalog.origin === "api" ? `Catalog refreshed from Google Fonts on ${catalog.updated}.` : `Built-in catalog (Google Fonts as of ${catalog.updated}); add an API key in Settings to refresh it and sort by popularity.`
              } Previews load from Google Fonts as you scroll.`
            : "Loading the catalog…")}
        {filtered ? (
          <>
            {" "}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setQuery("");
                setPrefs((p) => ({ ...p, categories: [], variableOnly: false, italicOnly: false, subset: "", hasWeight: 0 }));
              }}
            >
              Clear filters
            </button>
          </>
        ) : null}
      </p>

      {catalog && results.length === 0 && <p className="note">No family matches these filters.</p>}

      <ul className="font-grid">
        {results.slice(0, shown).map((f) => (
          <FontCard
            key={f.family}
            font={f}
            text={prefs.text}
            size={prefs.size}
            weight={prefs.weight}
            starred={isStarred(f.family)}
            onStar={() => toggle(f.family)}
            onCopy={copy}
          />
        ))}
      </ul>
      {results.length > shown && (
        <div ref={more} className="font-more">
          <button type="button" className="secondary-btn" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({(results.length - shown).toLocaleString()} left)
          </button>
        </div>
      )}
    </div>
  );
}
