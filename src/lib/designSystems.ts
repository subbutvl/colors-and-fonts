import { formatHex, parse } from "culori";
import data from "../data/curated-design-systems.json";
import { getDb } from "./db";
import { isTauri } from "./env";
import { libraryChanged } from "./library";

/**
 * Design systems (19 to 21). Curated systems are our own JSON; "my design
 * systems" are rows in the SQLite `design_systems` table (migration 7) with
 * JSON arrays for links, tags, colors and fonts. References only: links,
 * notes and attached colors and fonts, not a system builder.
 */
export interface DsLink {
  label: string;
  url: string;
}

export interface CuratedDesignSystem {
  id: string;
  name: string;
  org: string;
  description: string;
  platforms: string[];
  tags: string[];
  links: DsLink[];
}

export interface DsDraft {
  name: string;
  description: string;
  links: DsLink[];
  tags: string[];
  notes: string;
  colors: string[];
  fonts: string[];
  /** Curated id this entry was copied from, if any. */
  source: string;
}

export interface MyDesignSystem extends DsDraft {
  id: number;
  createdAt: string;
  updatedAt: string;
}

export const CURATED_DS_NOTE: string = data.note;
export const CURATED_DS: CuratedDesignSystem[] = data.systems;

/** Tags and platforms of the curated list, most used first. */
export const CURATED_DS_TAGS: string[] = (() => {
  const count = new Map<string, number>();
  for (const s of CURATED_DS) for (const t of [...s.platforms, ...s.tags]) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
})();

export const LIMITS = { name: 80, description: 300, notes: 2000, links: 20, label: 60, tags: 12, tag: 30, colors: 24, fonts: 12 };

export const EMPTY_DRAFT: DsDraft = { name: "", description: "", links: [], tags: [], notes: "", colors: [], fonts: [], source: "" };

/**
 * A web address we are willing to open: http or https only. A bare host
 * like `example.com/docs` gets https. Returns null for anything else.
 */
export function normalizeUrl(input: string): string | null {
  let text = input.trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    if (!/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(text)) return null;
    text = `https://${text}`;
  }
  try {
    const u = new URL(text);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** A short label for a link without one: the host without `www.`. */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Split "a, b; c" into tags. */
export function parseTags(text: string): string[] {
  return text.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
}

function uniqueBy<T>(list: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return list.filter((t) => {
    const k = key(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const clip = (s: string, n: number) => s.trim().slice(0, n);

/** A clean draft: trimmed, limited, valid links and colors only, no duplicates. Throws without a name. */
export function cleanDraft(d: DsDraft): DsDraft {
  const name = clip(d.name, LIMITS.name);
  if (!name) throw new Error("A design system needs a name");
  const links = uniqueBy(
    d.links
      .map((l) => {
        const url = normalizeUrl(l.url);
        return url ? { label: clip(l.label, LIMITS.label) || hostLabel(url), url } : null;
      })
      .filter((l): l is DsLink => !!l),
    (l) => l.url,
  ).slice(0, LIMITS.links);
  const tags = uniqueBy(
    d.tags.map((t) => clip(t, LIMITS.tag)).filter(Boolean),
    (t) => t.toLowerCase(),
  ).slice(0, LIMITS.tags);
  const colors = uniqueBy(
    d.colors
      .map((c) => {
        const p = parse(c.trim());
        return p ? formatHex(p).toUpperCase() : null;
      })
      .filter((c): c is string => !!c),
    (c) => c,
  ).slice(0, LIMITS.colors);
  const fonts = uniqueBy(d.fonts.map((f) => clip(f, 80)).filter(Boolean), (f) => f.toLowerCase()).slice(0, LIMITS.fonts);
  return {
    name,
    description: clip(d.description, LIMITS.description),
    links,
    tags,
    notes: d.notes.trim().slice(0, LIMITS.notes),
    colors,
    fonts,
    source: d.source.trim(),
  };
}

/** A curated system as a draft for "Add to my design systems". */
export function draftFromCurated(c: CuratedDesignSystem): DsDraft {
  return {
    name: c.name,
    description: c.description,
    links: c.links.map((l) => ({ ...l })),
    tags: [...c.platforms, ...c.tags],
    notes: "",
    colors: [],
    fonts: [],
    source: c.id,
  };
}

interface Searchable {
  name: string;
  description: string;
  tags: string[];
  org?: string;
  platforms?: string[];
  notes?: string;
  links: DsLink[];
}

/** Every word of the query must appear in the name, org, description, tags, notes or a link. */
export function matchesQuery(s: Searchable, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [s.name, s.org ?? "", s.description, s.notes ?? "", ...s.tags, ...(s.platforms ?? []), ...s.links.flatMap((l) => [l.label, l.url])]
    .join(" ")
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function searchCurated(query: string, tag: string | null): CuratedDesignSystem[] {
  return CURATED_DS.filter((s) => (!tag || s.tags.includes(tag) || s.platforms.includes(tag)) && matchesQuery(s, query));
}

// ------------------------------------------------------------- storage

/** Browser preview and tests have no SQLite: keep entries in memory. */
const memory: MyDesignSystem[] = [];
let nextId = 1;

interface Row {
  id: number;
  name: string;
  description: string;
  links: string;
  tags: string;
  notes: string;
  colors: string;
  fonts: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

function jsonArray<T>(text: string, ok: (v: unknown) => v is T): T[] {
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? v.filter(ok) : [];
  } catch {
    return [];
  }
}

const isString = (v: unknown): v is string => typeof v === "string";
const isLink = (v: unknown): v is DsLink => !!v && typeof v === "object" && isString((v as DsLink).label) && isString((v as DsLink).url);

function fromRow(r: Row): MyDesignSystem {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    links: jsonArray(r.links, isLink),
    tags: jsonArray(r.tags, isString),
    notes: r.notes,
    colors: jsonArray(r.colors, isString),
    fonts: jsonArray(r.fonts, isString),
    source: r.source,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const copy = (m: MyDesignSystem): MyDesignSystem => ({ ...m, links: m.links.map((l) => ({ ...l })), tags: [...m.tags], colors: [...m.colors], fonts: [...m.fonts] });

export async function listMyDesignSystems(): Promise<MyDesignSystem[]> {
  if (!isTauri()) return memory.map(copy);
  const db = await getDb();
  const rows = await db.select<Row[]>(
    "SELECT id, name, description, links, tags, notes, colors, fonts, source, created_at AS createdAt, updated_at AS updatedAt FROM design_systems ORDER BY updated_at DESC, id DESC",
  );
  return rows.map(fromRow);
}

export async function createDesignSystem(draft: DsDraft): Promise<number> {
  const d = cleanDraft(draft);
  if (!isTauri()) {
    const now = new Date().toISOString();
    const id = nextId++;
    memory.unshift({ ...d, id, createdAt: now, updatedAt: now });
    await libraryChanged();
    return id;
  }
  const db = await getDb();
  const res = await db.execute(
    "INSERT INTO design_systems (name, description, links, tags, notes, colors, fonts, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [d.name, d.description, JSON.stringify(d.links), JSON.stringify(d.tags), d.notes, JSON.stringify(d.colors), JSON.stringify(d.fonts), d.source],
  );
  await libraryChanged();
  return res.lastInsertId ?? 0;
}

export async function updateDesignSystem(id: number, draft: DsDraft): Promise<void> {
  const d = cleanDraft(draft);
  if (!isTauri()) {
    const i = memory.findIndex((m) => m.id === id);
    if (i >= 0) {
      const updated = { ...memory[i], ...d, updatedAt: new Date().toISOString() };
      memory.splice(i, 1);
      memory.unshift(updated);
    }
  } else {
    const db = await getDb();
    await db.execute(
      "UPDATE design_systems SET name = $1, description = $2, links = $3, tags = $4, notes = $5, colors = $6, fonts = $7, source = $8, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $9",
      [d.name, d.description, JSON.stringify(d.links), JSON.stringify(d.tags), d.notes, JSON.stringify(d.colors), JSON.stringify(d.fonts), d.source, id],
    );
  }
  await libraryChanged();
}

export async function deleteDesignSystem(id: number): Promise<void> {
  if (!isTauri()) {
    const i = memory.findIndex((m) => m.id === id);
    if (i >= 0) memory.splice(i, 1);
  } else {
    const db = await getDb();
    await db.execute("DELETE FROM design_systems WHERE id = $1", [id]);
  }
  forgetOpened(`my:${id}`);
  await libraryChanged();
}

// ------------------------------------------------------ recently opened

/** `curated:<id>` or `my:<id>`. */
export type DsRef = `curated:${string}` | `my:${number}`;

const RECENT_KEY = "huetype.ds.recent";
export const RECENT_MAX = 8;

export function recentOpened(): DsRef[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((r): r is DsRef => typeof r === "string" && /^(curated:.+|my:\d+)$/.test(r)).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: DsRef[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // ignore
  }
}

/** Remember that a system was opened (a link followed or an entry edited); newest first. */
export function recordOpened(ref: DsRef): void {
  writeRecent([ref, ...recentOpened().filter((r) => r !== ref)]);
}

export function forgetOpened(ref: DsRef): void {
  writeRecent(recentOpened().filter((r) => r !== ref));
}

/** Other pages to My design systems: an entry to open in the editor, read once. */
const EDIT_KEY = "huetype.ds.edit";

export function requestEdit(id: number): void {
  try {
    localStorage.setItem(EDIT_KEY, String(id));
  } catch {
    // ignore
  }
}

export function takeEditRequest(): number | null {
  try {
    const raw = localStorage.getItem(EDIT_KEY);
    localStorage.removeItem(EDIT_KEY);
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}
