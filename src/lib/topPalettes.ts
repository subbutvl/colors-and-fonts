import data from "../data/top-palettes.json";

/** One of our ready-made palettes on the Palettes page (`src/data/top-palettes.json`). */
export interface TopPalette {
  id: string;
  name: string;
  tags: string[];
  colors: string[];
}

export const TOP_PALETTES_NOTE: string = data.note;
export const TOP_PALETTES: TopPalette[] = data.palettes;

/** Filter chips, in this order. */
export const TOP_PALETTE_TAGS = ["warm", "cool", "pastel", "vibrant", "earthy", "dark", "neutral", "retro"] as const;

/** Palettes matching a tag (null = all) and a search over names and hex values. */
export function filterTopPalettes(query: string, tag: string | null = null): TopPalette[] {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  return TOP_PALETTES.filter(
    (p) =>
      (!tag || p.tags.includes(tag)) &&
      (!q || p.name.toLowerCase().includes(q) || p.colors.some((c) => c.toLowerCase().includes(q))),
  );
}
