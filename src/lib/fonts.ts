import bundled from "../data/google-fonts.json";
import { getDb } from "./db";
import { isTauri } from "./env";
import { getRawSettings } from "./settings";

/**
 * The Google Fonts catalog. A snapshot ships with the app
 * (`src/data/google-fonts.json`, built by `scripts/font-catalog.mjs`), so
 * the font pages work offline and without a key. With a Google Fonts
 * Developer API key (Settings) the catalog can be refreshed; the fresh copy
 * is cached in the SQLite `cache` table and also carries popularity order.
 */

export type FontCategory = "sans-serif" | "serif" | "display" | "handwriting" | "monospace";

export interface FontAxis {
  tag: string;
  min: number;
  max: number;
}

export interface FontFamily {
  family: string;
  category: FontCategory;
  /** Available weights, ascending (variable fonts: the named instances). */
  weights: number[];
  italic: boolean;
  subsets: string[];
  /** Variable axes; empty for static families. */
  axes: FontAxis[];
  /** Last update on Google Fonts, YYYY-MM-DD. */
  modified: string;
  /** 1 = most popular. Only in catalogs refreshed from the API. */
  rank?: number;
  /** 1 = trending most. Only in catalogs refreshed from the API. */
  trend?: number;
}

export interface Catalog {
  families: FontFamily[];
  /** "bundled" or "api". */
  origin: "bundled" | "api";
  /** Newest family update in the catalog (bundled) or when it was fetched (api). */
  updated: string;
}

export const CATEGORIES: { id: FontCategory; label: string }[] = [
  { id: "sans-serif", label: "Sans serif" },
  { id: "serif", label: "Serif" },
  { id: "display", label: "Display" },
  { id: "handwriting", label: "Handwriting" },
  { id: "monospace", label: "Monospace" },
];

export const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};

const CACHE_KEY = "fonts.catalog";
export const API_KEY_SETTING = "fonts.apiKey";

// ---------------------------------------------------------------- parsing

interface BundledEntry {
  f: string;
  c: string;
  w: number[];
  s: string[];
  m: string;
  i?: number;
  a?: string;
}

function parseAxes(a?: string): FontAxis[] {
  if (!a) return [];
  return a.split(",").map((part) => {
    const [tag, range] = part.split(":");
    const [min, max] = range.split("-").map(Number);
    return { tag, min, max };
  });
}

export function fromBundled(e: BundledEntry): FontFamily {
  return {
    family: e.f,
    category: e.c as FontCategory,
    weights: e.w,
    italic: !!e.i,
    subsets: e.s,
    axes: parseAxes(e.a),
    modified: e.m,
  };
}

/** One item of the Developer API's `webfonts` list (with capability=VF). */
export interface ApiItem {
  family: string;
  category: string;
  variants: string[];
  subsets: string[];
  lastModified: string;
  axes?: { tag: string; start: number; end: number }[];
}

export function fromApi(item: ApiItem, rank?: number): FontFamily {
  const weights = [...new Set(item.variants.map((v) => (v === "regular" || v === "italic" ? 400 : parseInt(v, 10))))]
    .filter((w) => Number.isFinite(w))
    .sort((a, b) => a - b);
  return {
    family: item.family,
    category: item.category as FontCategory,
    weights,
    italic: item.variants.some((v) => v.endsWith("italic")),
    subsets: item.subsets,
    axes: (item.axes ?? []).map((a) => ({ tag: a.tag, min: a.start, max: a.end })),
    modified: item.lastModified,
    rank,
  };
}

const isIconFont = (family: string) => /^Material (Icons|Symbols)/.test(family);

export function bundledCatalog(): Catalog {
  return {
    families: (bundled.families as BundledEntry[]).map(fromBundled),
    origin: "bundled",
    updated: bundled.updated,
  };
}

// ---------------------------------------------------------------- storage

const catalogListeners = new Set<() => void>();

/** Called after the catalog is refreshed or reset, so mounted pages reload it. */
export function onCatalogChanged(handler: () => void): () => void {
  catalogListeners.add(handler);
  return () => catalogListeners.delete(handler);
}

function catalogChanged(): void {
  catalogListeners.forEach((fn) => fn());
}

/** The cached API catalog if there is one, else the bundled snapshot. */
export async function getCatalog(): Promise<Catalog> {
  if (isTauri()) {
    try {
      const db = await getDb();
      const rows = await db.select<{ value: string }[]>("SELECT value FROM cache WHERE key = $1", [CACHE_KEY]);
      if (rows[0]) {
        const cached = JSON.parse(rows[0].value) as Catalog;
        if (Array.isArray(cached.families) && cached.families.length > 100) return cached;
      }
    } catch (e) {
      console.error("font catalog cache", e);
    }
  }
  return bundledCatalog();
}

async function fetchList(apiKey: string, sort: "popularity" | "trending"): Promise<ApiItem[]> {
  const url = `https://www.googleapis.com/webfonts/v1/webfonts?sort=${sort}&capability=VF&key=${encodeURIComponent(apiKey.trim())}`;
  const res = await fetch(url);
  if (!res.ok) {
    let reason = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) reason = body.error.message;
    } catch {
      // keep the status text
    }
    throw new Error(reason);
  }
  const body = (await res.json()) as { items?: ApiItem[] };
  const items = (body.items ?? []).filter((i) => !isIconFont(i.family));
  if (items.length < 100) throw new Error("The API answered with an unexpectedly short list.");
  return items;
}

/** Fetch the catalog (popularity and trending order) from the Developer API and cache it. */
export async function refreshCatalog(apiKey: string): Promise<Catalog> {
  const [popular, trending] = await Promise.all([fetchList(apiKey, "popularity"), fetchList(apiKey, "trending")]);
  const trend = new Map(trending.map((item, i) => [item.family, i + 1]));
  const catalog: Catalog = {
    families: popular.map((item, i) => ({ ...fromApi(item, i + 1), trend: trend.get(item.family) })),
    origin: "api",
    updated: new Date().toISOString().slice(0, 10),
  };
  if (isTauri()) {
    const db = await getDb();
    await db.execute(
      "INSERT INTO cache (key, value, updated_at) VALUES ($1, $2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [CACHE_KEY, JSON.stringify(catalog)],
    );
  }
  catalogChanged();
  return catalog;
}

/** Days after which a cached API catalog is refreshed in the background. */
export const REFRESH_DAYS = 7;

export function isStale(catalog: Catalog, now = new Date()): boolean {
  if (catalog.origin !== "api") return false;
  const age = now.getTime() - new Date(`${catalog.updated}T00:00:00Z`).getTime();
  return !(age < REFRESH_DAYS * 86_400_000);
}

/**
 * Weekly refresh: when a key is saved and the cached copy is older than
 * REFRESH_DAYS, fetch a new one. Quiet on failure (offline keeps the cache).
 */
export async function refreshIfStale(): Promise<void> {
  if (!isTauri()) return;
  const key = (await getRawSettings(API_KEY_SETTING))[API_KEY_SETTING];
  if (!key) return;
  const current = await getCatalog();
  if (current.origin === "api" && !isStale(current)) return;
  try {
    await refreshCatalog(key);
  } catch (e) {
    console.warn("font catalog refresh", e);
  }
}

/** Drop the cached API copy and go back to the bundled snapshot. */
export async function clearCatalogCache(): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute("DELETE FROM cache WHERE key = $1", [CACHE_KEY]);
  catalogChanged();
}

// ---------------------------------------------------------------- queries

export interface FontFilter {
  query?: string;
  categories?: FontCategory[];
  variableOnly?: boolean;
  subset?: string;
  /** Families that have this weight (variable fonts: inside the wght range). */
  weight?: number;
  italicOnly?: boolean;
}

export function hasWeight(f: FontFamily, w: number): boolean {
  const wght = f.axes.find((a) => a.tag === "wght");
  return wght ? w >= wght.min && w <= wght.max : f.weights.includes(w);
}

export function filterFonts(list: FontFamily[], filter: FontFilter): FontFamily[] {
  const q = filter.query?.trim().toLowerCase() ?? "";
  return list.filter(
    (f) =>
      (!q || f.family.toLowerCase().includes(q)) &&
      (!filter.categories?.length || filter.categories.includes(f.category)) &&
      (!filter.variableOnly || f.axes.length > 0) &&
      (!filter.subset || f.subsets.includes(filter.subset)) &&
      (!filter.weight || hasWeight(f, filter.weight)) &&
      (!filter.italicOnly || f.italic),
  );
}

export type FontSort = "popular" | "name" | "newest" | "styles";

export function sortFonts(list: FontFamily[], by: FontSort): FontFamily[] {
  const out = [...list];
  if (by === "popular") out.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.family.localeCompare(b.family));
  else if (by === "newest") out.sort((a, b) => b.modified.localeCompare(a.modified) || a.family.localeCompare(b.family));
  else if (by === "styles") out.sort((a, b) => styleCount(b) - styleCount(a) || a.family.localeCompare(b.family));
  else out.sort((a, b) => a.family.localeCompare(b.family));
  return out;
}

export function styleCount(f: FontFamily): number {
  return f.weights.length * (f.italic ? 2 : 1);
}

/** Scripts (subsets) in the catalog, most common first. */
export function subsetsByUse(list: FontFamily[]): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const f of list) for (const s of f.subsets) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export function subsetLabel(id: string): string {
  return id
    .split("-")
    .map((w) => (w === "ext" ? "Extended" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// ---------------------------------------------------------------- CSS

/** Generic fallback that matches the category, as Google's embed code does. */
export function fallbackFor(category: FontCategory): string {
  if (category === "serif") return "serif";
  if (category === "monospace") return "monospace";
  if (category === "handwriting") return "cursive";
  return "sans-serif";
}

export function fontFamilyCss(f: FontFamily): string {
  return `font-family: "${f.family}", ${fallbackFor(f.category)};`;
}

/**
 * css2 URL for a family. Variable families ask for their full wght range
 * (one file); static ones list their weights. `weights` narrows the request.
 */
export function cssUrl(f: FontFamily, opts: { weights?: number[]; italic?: boolean; text?: string } = {}): string {
  const name = encodeURIComponent(f.family).replace(/%20/g, "+");
  const wght = f.axes.find((a) => a.tag === "wght");
  const italic = (opts.italic ?? true) && f.italic;
  let spec = "";
  if (wght && !opts.weights) {
    const range = wght.min === wght.max ? `${wght.min}` : `${wght.min}..${wght.max}`;
    spec = italic ? `:ital,wght@0,${range};1,${range}` : `:wght@${range}`;
  } else {
    const ws = (opts.weights ?? f.weights).filter((w) => hasWeight(f, w));
    const list = ws.length ? ws : f.weights;
    const plain = list.length === 1 && list[0] === 400;
    if (italic) spec = `:ital,wght@${[...list.map((w) => `0,${w}`), ...list.map((w) => `1,${w}`)].join(";")}`;
    else if (!plain) spec = `:wght@${list.join(";")}`;
  }
  const text = opts.text ? `&text=${encodeURIComponent(opts.text)}` : "";
  return `https://fonts.googleapis.com/css2?family=${name}${spec}&display=swap${text}`;
}

export function linkTag(f: FontFamily): string {
  return [
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link href="${cssUrl(f)}" rel="stylesheet">`,
  ].join("\n");
}

export function importRule(f: FontFamily): string {
  return `@import url('${cssUrl(f)}');`;
}

export function googleFontsPage(f: FontFamily): string {
  return `https://fonts.google.com/specimen/${encodeURIComponent(f.family).replace(/%20/g, "+")}`;
}

/** The weight a preview uses: the requested one if the family has it, else the nearest. */
export function previewWeight(f: FontFamily, wanted: number): number {
  if (hasWeight(f, wanted)) return wanted;
  return f.weights.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), f.weights[0] ?? 400);
}

const loaded = new Set<string>();

/**
 * Load one family at one weight into the page for previews. Each request is
 * a small latin-first stylesheet; it is added once and kept.
 */
export function loadPreviewFont(f: FontFamily, weight: number): void {
  if (typeof document === "undefined") return;
  const url = cssUrl(f, { weights: [weight], italic: false });
  if (loaded.has(url)) return;
  loaded.add(url);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  document.head.appendChild(link);
}
