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

// ---------------------------------------------------------------- fonts

export interface StarredFont {
  id: number;
  family: string;
  note: string;
  createdAt: string;
}

const fontMemory: StarredFont[] = [];

export async function listStarredFonts(): Promise<StarredFont[]> {
  if (!isTauri()) return fontMemory.map((f) => ({ ...f }));
  const db = await getDb();
  return db.select<StarredFont[]>("SELECT id, family, note, created_at AS createdAt FROM saved_fonts ORDER BY id DESC");
}

export async function starFont(family: string): Promise<void> {
  const name = family.trim();
  if (!name) return;
  if (!isTauri()) {
    if (!fontMemory.some((f) => f.family === name)) fontMemory.unshift({ id: nextId++, family: name, note: "", createdAt: new Date().toISOString() });
  } else {
    const db = await getDb();
    await db.execute("INSERT OR IGNORE INTO saved_fonts (family) VALUES ($1)", [name]);
  }
  await libraryChanged();
}

export async function unstarFont(family: string): Promise<void> {
  if (!isTauri()) {
    const i = fontMemory.findIndex((f) => f.family === family);
    if (i >= 0) fontMemory.splice(i, 1);
  } else {
    const db = await getDb();
    await db.execute("DELETE FROM saved_fonts WHERE family = $1", [family]);
  }
  await libraryChanged();
}

export async function setFontNote(family: string, note: string): Promise<void> {
  const clean = note.trim().slice(0, 200);
  if (!isTauri()) {
    const f = fontMemory.find((m) => m.family === family);
    if (f) f.note = clean;
  } else {
    const db = await getDb();
    await db.execute("UPDATE saved_fonts SET note = $1 WHERE family = $2", [clean, family]);
  }
  await libraryChanged();
}

/** The whole library as JSON, for backup or for use elsewhere. */
export async function exportLibrary(): Promise<string> {
  const [colors, palettes, fonts] = await Promise.all([listStarred(), listPalettes(), listStarredFonts()]);
  return JSON.stringify(
    {
      app: "Huetype",
      version: 1,
      colors: colors.map((c) => ({ hex: c.hex, note: c.note || undefined, saved: c.createdAt })),
      palettes: palettes.map((p) => ({ name: p.name, colors: p.colors, saved: p.createdAt })),
      fonts: fonts.map((f) => ({ family: f.family, note: f.note || undefined, saved: f.createdAt })),
    },
    null,
    2,
  );
}
