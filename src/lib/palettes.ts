import { getDb } from "./db";
import { isTauri } from "./env";
import { libraryChanged } from "./library";

/**
 * Saved palettes in the SQLite `palettes` table (migration 3). `colors` is a
 * JSON array of uppercase hex strings.
 */
export interface SavedPalette {
  id: number;
  name: string;
  colors: string[];
  /** ISO 8601, UTC. */
  createdAt: string;
}

/** Browser preview has no SQLite: keep palettes in memory. */
const memory: SavedPalette[] = [];
let nextId = 1;

interface Row {
  id: number;
  name: string;
  colors: string;
  createdAt: string;
}

function parseColors(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

export async function savePalette(name: string, colors: string[]): Promise<number> {
  const clean = name.trim() || "Untitled palette";
  if (!isTauri()) {
    const id = nextId++;
    memory.unshift({ id, name: clean, colors: [...colors], createdAt: new Date().toISOString() });
    await libraryChanged();
    return id;
  }
  const db = await getDb();
  const res = await db.execute("INSERT INTO palettes (name, colors) VALUES ($1, $2)", [clean, JSON.stringify(colors)]);
  await libraryChanged();
  return res.lastInsertId ?? 0;
}

export async function listPalettes(): Promise<SavedPalette[]> {
  if (!isTauri()) return memory.map((p) => ({ ...p, colors: [...p.colors] }));
  const db = await getDb();
  const rows = await db.select<Row[]>(
    "SELECT id, name, colors, created_at AS createdAt FROM palettes ORDER BY id DESC",
  );
  return rows.map((r) => ({ ...r, colors: parseColors(r.colors) }));
}

export async function deletePalette(id: number): Promise<void> {
  if (!isTauri()) {
    const i = memory.findIndex((p) => p.id === id);
    if (i >= 0) memory.splice(i, 1);
  } else {
    const db = await getDb();
    await db.execute("DELETE FROM palettes WHERE id = $1", [id]);
  }
  await libraryChanged();
}

export async function renamePalette(id: number, name: string): Promise<void> {
  const clean = name.trim() || "Untitled palette";
  if (!isTauri()) {
    const p = memory.find((m) => m.id === id);
    if (p) p.name = clean;
  } else {
    const db = await getDb();
    await db.execute("UPDATE palettes SET name = $1 WHERE id = $2", [clean, id]);
  }
  await libraryChanged();
}

/** Saved page to Palettes handoff: the id of the palette to open next. */
const OPEN_KEY = "huetype.palettes.open";

export function requestOpenPalette(id: number): void {
  try {
    localStorage.setItem(OPEN_KEY, String(id));
  } catch {
    // ignore
  }
}

/** The palette id the Saved page asked to open, if any (read once). */
export function takeOpenRequest(): number | null {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    localStorage.removeItem(OPEN_KEY);
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}
