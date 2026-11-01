import data from "../data/pantone-coty.json";

/**
 * Pantone Color of the Year, 2002 to 2026: our own list in
 * src/data/pantone-coty.json. Hex values are approximations of the
 * printed colors, not official Pantone conversions.
 */

export interface CotyColor {
  name: string;
  /** Pantone TCX number, e.g. "17-1230". */
  code: string;
  hex: string;
  note: string;
}

export interface CotyYear {
  year: number;
  colors: CotyColor[];
}

export interface CotyEntry extends CotyColor {
  year: number;
}

export const COTY_NOTE = data.note;
export const COTY_YEARS: CotyYear[] = data.years;
export const FIRST_YEAR = COTY_YEARS[0].year;
export const LAST_YEAR = COTY_YEARS[COTY_YEARS.length - 1].year;

/** One entry per color, oldest first (2016 and 2021 have two). */
export const COTY: CotyEntry[] = COTY_YEARS.flatMap((y) => y.colors.map((c) => ({ ...c, year: y.year })));

export function cotyYear(year: number): CotyYear | undefined {
  return COTY_YEARS.find((y) => y.year === year);
}

/** "PANTONE 17-1230 Mocha Mousse" */
export function pantoneLabel(c: CotyColor): string {
  return `PANTONE ${c.code} ${c.name}`;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Every color as CSS custom properties, newest first. */
export function cotyCss(): string {
  const lines = [...COTY].reverse().map((c) => `  --coty-${c.year}-${slug(c.name)}: ${c.hex}; /* ${pantoneLabel(c)} */`);
  return `:root {\n${lines.join("\n")}\n}`;
}

/** Years grouped by decade, newest decade first. */
export function byDecade(): { decade: number; years: CotyYear[] }[] {
  const map = new Map<number, CotyYear[]>();
  for (const y of COTY_YEARS) {
    const d = Math.floor(y.year / 10) * 10;
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(y);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([decade, years]) => ({ decade, years: [...years].reverse() }));
}
