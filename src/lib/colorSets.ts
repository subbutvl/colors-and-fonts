import brandData from "../data/brand-colors.json";
import curatedData from "../data/curated-colors.json";

/**
 * Curated colors (7) and Brand colors (8): our own JSON in src/data/.
 * Hex values are uppercase #RRGGBB (checked by tests).
 */

export interface CuratedPalette {
  name: string;
  colors: string[];
}

export interface ColorCollection {
  id: string;
  title: string;
  blurb: string;
  palettes: CuratedPalette[];
}

export const CURATED_NOTE = curatedData.note;
export const COLOR_COLLECTIONS: ColorCollection[] = curatedData.collections;

export interface BrandColor {
  name: string;
  hex: string;
}

export interface Brand {
  name: string;
  category: string;
  colors: BrandColor[];
  /** The brand's own guidelines page, when it publishes one. */
  guide?: string;
  /** Otherwise its website. */
  site?: string;
}

export const BRAND_NOTE = brandData.note;
export const BRANDS: Brand[] = brandData.brands;
/** Categories in the order they first appear alphabetically by name. */
export const BRAND_CATEGORIES: string[] = [...new Set(BRANDS.map((b) => b.category))].sort();

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9#]/g, "");

/** Brands matching a name, color name or hex fragment, optionally in one category. */
export function searchBrands(query: string, category: string | null = null): Brand[] {
  const q = norm(query);
  return BRANDS.filter((b) => {
    if (category && b.category !== category) return false;
    if (!q) return true;
    if (norm(b.name).includes(q)) return true;
    return b.colors.some((c) => norm(c.name).includes(q) || norm(c.hex).includes(q.startsWith("#") ? q : `#${q}`) || norm(c.hex).includes(q));
  });
}

/** Palettes in a collection (or every collection) containing a hex fragment or name match. */
export function searchPalettes(query: string, collection: string | null = null): { collection: ColorCollection; palette: CuratedPalette }[] {
  const q = norm(query);
  return COLOR_COLLECTIONS.filter((c) => !collection || c.id === collection).flatMap((c) =>
    c.palettes
      .filter((p) => !q || norm(p.name).includes(q) || norm(c.title).includes(q) || p.colors.some((h) => norm(h).includes(q)))
      .map((palette) => ({ collection: c, palette })),
  );
}

/** Brand colors as CSS custom properties: --brand-<brand>-<color>. */
export function brandCss(b: Brand): string {
  const slug = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return b.colors.map((c) => `--${slug(b.name)}-${slug(c.name)}: ${c.hex};`).join("\n");
}
