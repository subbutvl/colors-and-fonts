import { getDb } from "./db";
import { isTauri } from "./env";
import { normalize, parseGradient, type Gradient } from "./gradient";
import { libraryChanged } from "./library";

/**
 * Saved gradients in the SQLite `gradients` table (migration 6). `data` is
 * the normalized gradient as JSON (see `gradient.ts`).
 */
export interface SavedGradient {
  id: number;
  name: string;
  gradient: Gradient;
  /** ISO 8601, UTC. */
  createdAt: string;
}

/** Browser preview has no SQLite: keep gradients in memory. */
const memory: SavedGradient[] = [];
let nextId = 1;

interface Row {
  id: number;
  name: string;
  data: string;
  createdAt: string;
}

function fromRow(r: Row): SavedGradient | null {
  try {
    const gradient = parseGradient(JSON.parse(r.data));
    return gradient ? { id: r.id, name: r.name, gradient, createdAt: r.createdAt } : null;
  } catch {
    return null;
  }
}

export async function saveGradient(name: string, gradient: Gradient): Promise<number> {
  const clean = name.trim().slice(0, 80) || "Untitled gradient";
  const g = normalize(gradient);
  if (!isTauri()) {
    const id = nextId++;
    memory.unshift({ id, name: clean, gradient: g, createdAt: new Date().toISOString() });
    await libraryChanged();
    return id;
  }
  const db = await getDb();
  const res = await db.execute("INSERT INTO gradients (name, data) VALUES ($1, $2)", [clean, JSON.stringify(g)]);
  await libraryChanged();
  return res.lastInsertId ?? 0;
}

export async function listGradients(): Promise<SavedGradient[]> {
  if (!isTauri()) return memory.map((m) => ({ ...m, gradient: { ...m.gradient, stops: m.gradient.stops.map((s) => ({ ...s })) } }));
  const db = await getDb();
  const rows = await db.select<Row[]>("SELECT id, name, data, created_at AS createdAt FROM gradients ORDER BY id DESC");
  return rows.map(fromRow).filter((g): g is SavedGradient => !!g);
}

export async function deleteGradient(id: number): Promise<void> {
  if (!isTauri()) {
    const i = memory.findIndex((m) => m.id === id);
    if (i >= 0) memory.splice(i, 1);
  } else {
    const db = await getDb();
    await db.execute("DELETE FROM gradients WHERE id = $1", [id]);
  }
  await libraryChanged();
}

export async function renameGradient(id: number, name: string): Promise<void> {
  const clean = name.trim().slice(0, 80) || "Untitled gradient";
  if (!isTauri()) {
    const m = memory.find((g) => g.id === id);
    if (m) m.name = clean;
  } else {
    const db = await getDb();
    await db.execute("UPDATE gradients SET name = $1 WHERE id = $2", [clean, id]);
  }
  await libraryChanged();
}

/** Saved page (or any page) to Gradients handoff: a gradient to open next, read once. */
const OPEN_KEY = "huetype.gradients.open";

export function requestOpenGradient(gradient: Gradient, name = ""): void {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify({ name, gradient: normalize(gradient) }));
  } catch {
    // ignore
  }
}

export function takeOpenGradient(): { name: string; gradient: Gradient } | null {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    localStorage.removeItem(OPEN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { name?: unknown; gradient?: unknown };
    const gradient = parseGradient(v.gradient);
    return gradient ? { name: typeof v.name === "string" ? v.name : "", gradient } : null;
  } catch {
    return null;
  }
}
