import curated from "../data/curated-fonts.json";
import pairsData from "../data/font-pairs.json";
import topData from "../data/top-fonts.json";
import { cssUrl, fallbackFor, type FontCategory, type FontFamily } from "./fonts";

/**
 * Top fonts, curated collections and font pairing. The lists are our own
 * JSON in `src/data/`; every family in them must exist in the catalog
 * (checked by tests), and lookups skip any that a refreshed catalog drops.
 */

export interface CuratedFont {
  family: string;
  why: string;
}

export interface Collection {
  id: string;
  title: string;
  blurb: string;
  fonts: CuratedFont[];
}

export interface Pair {
  heading: string;
  body: string;
  style: string;
  why: string;
}

export const COLLECTIONS: Collection[] = curated.collections;
export const PAIRS: Pair[] = pairsData.pairs;
export const BODY_FONTS: string[] = pairsData.body;
export const TOP_NOTE = topData.note;
export const TOP_FALLBACK: string[] = topData.families;

export function byFamily(list: FontFamily[]): Map<string, FontFamily> {
  return new Map(list.map((f) => [f.family, f]));
}

/** Most popular families: live API order when the catalog has it, else the curated list. */
export function topFonts(list: FontFamily[], n = 60): { fonts: FontFamily[]; live: boolean } {
  const live = list.some((f) => f.rank);
  if (live) return { fonts: [...list].filter((f) => f.rank).sort((a, b) => a.rank! - b.rank!).slice(0, n), live };
  const map = byFamily(list);
  return { fonts: TOP_FALLBACK.flatMap((name) => map.get(name) ?? []).slice(0, n), live };
}

/** Trending families (API only), else the most recently updated ones. */
export function trendingFonts(list: FontFamily[], n = 30): { fonts: FontFamily[]; live: boolean } {
  const live = list.some((f) => f.trend);
  if (live) return { fonts: [...list].filter((f) => f.trend).sort((a, b) => a.trend! - b.trend!).slice(0, n), live };
  return { fonts: [...list].sort((a, b) => b.modified.localeCompare(a.modified) || a.family.localeCompare(b.family)).slice(0, n), live };
}

// ---------------------------------------------------------------- pairing

export interface Suggestion {
  body: FontFamily;
  /** Why this body works with the heading. */
  reason: string;
  /** Set when the pair is one of our curated pairs. */
  pair?: Pair;
}

const isSerif = (c: FontCategory) => c === "serif";
const isSans = (c: FontCategory) => c === "sans-serif";

/** How well a family can carry body text: weights for bold, and real italics. */
function bodyScore(f: FontFamily): number {
  const wght = f.axes.find((a) => a.tag === "wght");
  const hasRegular = wght ? wght.min <= 400 && wght.max >= 400 : f.weights.includes(400);
  const hasBold = wght ? wght.max >= 600 : f.weights.some((w) => w >= 600);
  return (hasRegular ? 2 : 0) + (hasBold ? 2 : 0) + (f.italic ? 1 : 0);
}

function ruleReason(heading: FontFamily, body: FontFamily): string {
  if (heading.family === body.family) return "One family for both: contrast comes from size and weight.";
  if (isSerif(heading.category) && isSans(body.category)) return "Serif headings with a sans body: classic contrast, easy reading on screens.";
  if (isSans(heading.category) && isSerif(body.category)) return "Sans headings with a serif body: modern titles, bookish text.";
  if (heading.category === "display" || heading.category === "handwriting") return `A ${body.category === "serif" ? "quiet serif" : "neutral sans"} lets the expressive heading lead.`;
  if (heading.category === "monospace") return "Monospace headings feel technical; a plain sans keeps paragraphs readable.";
  return "Two sans serifs with different shapes: keep the body the calmer one.";
}

/**
 * Body fonts for a heading font: our curated pairs first (in either
 * direction), then rule-based picks from BODY_FONTS that contrast with the
 * heading's category and can carry long text.
 */
export function suggestBodies(heading: FontFamily, list: FontFamily[], n = 8): Suggestion[] {
  const map = byFamily(list);
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (s: Suggestion) => {
    if (seen.has(s.body.family) || out.length >= n) return;
    seen.add(s.body.family);
    out.push(s);
  };

  for (const p of PAIRS) {
    if (p.heading === heading.family) {
      const body = map.get(p.body);
      if (body) push({ body, reason: p.why, pair: p });
    }
  }
  for (const p of PAIRS) {
    if (p.body === heading.family && p.heading !== heading.family) {
      const body = map.get(p.heading);
      if (body && bodyScore(body) >= 4) push({ body, reason: `Often paired the other way round: ${p.why}`, pair: p });
    }
  }

  const want: FontCategory[] = isSerif(heading.category)
    ? ["sans-serif"]
    : isSans(heading.category)
      ? ["serif", "sans-serif"]
      : ["sans-serif", "serif"];
  const candidates = BODY_FONTS.flatMap((name) => map.get(name) ?? [])
    .filter((f) => f.family !== heading.family && want.includes(f.category))
    .sort((a, b) => want.indexOf(a.category) - want.indexOf(b.category) || bodyScore(b) - bodyScore(a));
  for (const body of candidates) push({ body, reason: ruleReason(heading, body) });

  // A big text family can pair with itself.
  if (bodyScore(heading) >= 5 && (isSans(heading.category) || isSerif(heading.category))) push({ body: heading, reason: ruleReason(heading, heading) });
  return out;
}

/** One stylesheet URL for both families, plus the font-family rules. */
export function pairCss(heading: FontFamily, body: FontFamily): string {
  const families = heading.family === body.family ? [heading] : [heading, body];
  const params = families.map((f) => cssUrl(f).split("?")[1].split("&")[0]).join("&");
  return [
    `@import url('https://fonts.googleapis.com/css2?${params}&display=swap');`,
    "",
    `h1, h2, h3 { font-family: "${heading.family}", ${fallbackFor(heading.category)}; }`,
    `body { font-family: "${body.family}", ${fallbackFor(body.category)}; }`,
  ].join("\n");
}

/** Font listing to Font pairing handoff: the heading family to open with. */
export const PAIR_KEY = "huetype.pairing.heading";

export function requestPairing(family: string): void {
  try {
    localStorage.setItem(PAIR_KEY, family);
  } catch {
    // ignore
  }
  window.location.hash = "/font-pairing";
}
