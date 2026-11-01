import { emit, listen } from "@tauri-apps/api/event";
import { getDb } from "./db";
import { isTauri } from "./env";
import { listPalettes } from "./palettes";

/**
 * The saved library: starred colors in the SQLite `saved_colors` table
 * (migration 4) and saved palettes (`palettes.ts`). Any window may star a
 * color; every change is broadcast so open pages refresh.
 */
export interface StarredColor {
  id: number;
  hex: string;
  note: string;
  /** ISO 8601, UTC. */
  createdAt: string;
}

/** Broadcast after any library change (colors or palettes). */
export const LIBRARY_EVENT = "huetype://library-changed";

const norm = (hex: string) => hex.trim().toUpperCase();

/** Browser preview and tests have no SQLite: keep the library in memory. */
const memory: StarredColor[] = [];
let nextId = 1;
const localListeners = new Set<() => void>();

export async function libraryChanged(): Promise<void> {
  localListeners.forEach((fn) => fn());
  if (isTauri()) await emit(LIBRARY_EVENT);
}

export function onLibraryChanged(handler: () => void): () => void {
  if (!isTauri()) {
    localListeners.add(handler);
    return () => localListeners.delete(handler);
  }
  let unlisten: (() => void) | undefined;
  let cancelled = false;
  listen(LIBRARY_EVENT, () => handler()).then((fn) => (cancelled ? fn() : (unlisten = fn)));
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

export async function listStarred(): Promise<StarredColor[]> {
  if (!isTauri()) return memory.map((c) => ({ ...c }));
  const db = await getDb();
  return db.select<StarredColor[]>("SELECT id, hex, note, created_at AS createdAt FROM saved_colors ORDER BY id DESC");
}

export async function isStarred(hex: string): Promise<boolean> {
  const h = norm(hex);
  if (!isTauri()) return memory.some((c) => c.hex === h);
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM saved_colors WHERE hex = $1", [h]);
  return (rows[0]?.n ?? 0) > 0;
}

export async function starColor(hex: string, note = ""): Promise<void> {
  const h = norm(hex);
  if (!isTauri()) {
    if (!memory.some((c) => c.hex === h)) memory.unshift({ id: nextId++, hex: h, note, createdAt: new Date().toISOString() });
  } else {
    const db = await getDb();
    await db.execute("INSERT OR IGNORE INTO saved_colors (hex, note) VALUES ($1, $2)", [h, note]);
  }
  await libraryChanged();
}

export async function unstarColor(hex: string): Promise<void> {
  const h = norm(hex);
  if (!isTauri()) {
    const i = memory.findIndex((c) => c.hex === h);
    if (i >= 0) memory.splice(i, 1);
  } else {
    const db = await getDb();
    await db.execute("DELETE FROM saved_colors WHERE hex = $1", [h]);
  }
  await libraryChanged();
}

/** Star or unstar; returns the new state. */
export async function toggleStar(hex: string): Promise<boolean> {
  if (await isStarred(hex)) {
    await unstarColor(hex);
    return false;
  }
  await starColor(hex);
  return true;
}

export async function setColorNote(hex: string, note: string): Promise<void> {
  const h = norm(hex);
  const clean = note.trim().slice(0, 200);
  if (!isTauri()) {
    const c = memory.find((m) => m.hex === h);
    if (c) c.note = clean;
  } else {
    const db = await getDb();
    await db.execute("UPDATE saved_colors SET note = $1 WHERE hex = $2", [clean, h]);
  }
  await libraryChanged();
}

/** The whole library as JSON, for backup or for use elsewhere. */
export async function exportLibrary(): Promise<string> {
  const [colors, palettes] = await Promise.all([listStarred(), listPalettes()]);
  return JSON.stringify(
    {
      app: "Huetype",
      version: 1,
      colors: colors.map((c) => ({ hex: c.hex, note: c.note || undefined, saved: c.createdAt })),
      palettes: palettes.map((p) => ({ name: p.name, colors: p.colors, saved: p.createdAt })),
    },
    null,
    2,
  );
}
