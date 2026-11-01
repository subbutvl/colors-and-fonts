import { useEffect, useMemo, useRef, useState } from "react";
import { PageHead } from "../components/PageHead";
import { DEFAULT_TEXT, FontCard } from "../components/FontCard";
import { requestPairing } from "../lib/fontSets";
import { copyText } from "../lib/colors";
import {
  CATEGORIES,
  filterFonts,
  sortFonts,
  subsetLabel,
  subsetsByUse,
  WEIGHT_NAMES,
  type FontCategory,
  type FontSort,
} from "../lib/fonts";
import type { Section } from "../sections";
import { useFontCatalog } from "../useFontCatalog";
import { useStarredFonts } from "../useStarredFonts";

const PAGE = 48;
const STORE_KEY = "huetype.fonts.listing";
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

/** Font listing (15): every Google Fonts family with live previews. */
export function FontListingPage({ section }: { section: Section }) {
  const { catalog, error } = useFontCatalog();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [status, setStatus] = useState<string | null>(null);
  const { isStarred, toggle } = useStarredFonts();
  const more = useRef<HTMLDivElement>(null);

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
        {error ??
          status ??
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
            onPair={() => requestPairing(f.family)}
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
