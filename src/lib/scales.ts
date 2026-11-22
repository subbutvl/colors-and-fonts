import { getDb } from "./db";
import { isTauri } from "./env";
import { libraryChanged } from "./library";
import { STEPS, type ScaleStep } from "./scale";

/** One saved step: 50 to 950 and its hex. */
export type SavedStep = Pick<ScaleStep, "step" | "hex">;

/**
 * Saved scales in the SQLite `scales` table (migration 8). `steps` keeps the
 * eleven hex values as saved, so a saved scale never shifts if the scale
 * maker changes later; `base` is the color it was made from.
 */
export interface SavedScale {
  id: number;
  name: string;
  base: string;
  /** 50 to 950, in order. */
  steps: SavedStep[];
  /** ISO 8601, UTC. */
  createdAt: string;
}

const HEX = /^#[0-9A-F]{6}$/;

/** Name and steps as stored: the name trimmed to 40 characters, hex uppercase. */
export function cleanScale(name: string, scale: SavedStep[]): { name: string; steps: SavedStep[] } | null {
  const steps = scale.map((s) => ({ step: s.step, hex: s.hex.toUpperCase() }));
  if (steps.length !== STEPS.length || steps.some((s, i) => s.step !== STEPS[i] || !HEX.test(s.hex))) return null;
  return { name: name.trim().slice(0, 40) || "Untitled scale", steps };
}

/** Steps JSON from the database, or null when it is not a full scale. */
export function parseSteps(raw: string): SavedStep[] | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return null;
    const steps = v.map((s) => ({ step: Number(s?.step), hex: String(s?.hex ?? "").toUpperCase() }));
    return cleanScale("x", steps as SavedStep[])?.steps ?? null;
  } catch {
    return null;
  }
}

/** Browser preview has no SQLite: keep scales in memory. */
const memory: SavedScale[] = [];
let nextId = 1;

interface Row {
  id: number;
  name: string;
  base: string;
  steps: string;
  createdAt: string;
}

export async function saveScale(name: string, base: string, scale: SavedStep[]): Promise<number> {
  const clean = cleanScale(name, scale);
  if (!clean) throw new Error("not a full 50 to 950 scale");
  const b = base.toUpperCase();
  if (!isTauri()) {
    const id = nextId++;
    memory.unshift({ id, name: clean.name, base: b, steps: clean.steps, createdAt: new Date().toISOString() });
    await libraryChanged();
    return id;
  }
  const db = await getDb();
  const res = await db.execute("INSERT INTO scales (name, base, steps) VALUES ($1, $2, $3)", [clean.name, b, JSON.stringify(clean.steps)]);
  await libraryChanged();
  return res.lastInsertId ?? 0;
}

export async function listScales(): Promise<SavedScale[]> {
  if (!isTauri()) return memory.map((m) => ({ ...m, steps: m.steps.map((s) => ({ ...s })) }));
  const db = await getDb();
  const rows = await db.select<Row[]>("SELECT id, name, base, steps, created_at AS createdAt FROM scales ORDER BY id DESC");
  return rows.flatMap((r) => {
    const steps = parseSteps(r.steps);
    return steps ? [{ id: r.id, name: r.name, base: r.base, steps, createdAt: r.createdAt }] : [];
  });
}

export async function deleteScale(id: number): Promise<void> {
  if (!isTauri()) {
    const i = memory.findIndex((m) => m.id === id);
    if (i >= 0) memory.splice(i, 1);
  } else {
    const db = await getDb();
    await db.execute("DELETE FROM scales WHERE id = $1", [id]);
  }
  await libraryChanged();
}

export async function renameScale(id: number, name: string): Promise<void> {
  const clean = name.trim().slice(0, 40) || "Untitled scale";
  if (!isTauri()) {
    const m = memory.find((s) => s.id === id);
    if (m) m.name = clean;
  } else {
    const db = await getDb();
    await db.execute("UPDATE scales SET name = $1 WHERE id = $2", [clean, id]);
  }
  await libraryChanged();
}

/** Saved page to Scales handoff: a base color and name to open next, read once. */
const OPEN_KEY = "huetype.scales.open";

export function requestOpenScale(base: string, name: string): void {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify({ base, name }));
  } catch {
    // ignore
  }
}

export function takeOpenScale(): { base: string; name: string } | null {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    localStorage.removeItem(OPEN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { base?: unknown; name?: unknown };
    return typeof v.base === "string" && HEX.test(v.base.toUpperCase()) ? { base: v.base.toUpperCase(), name: typeof v.name === "string" ? v.name : "" } : null;
  } catch {
    return null;
  }
}
