import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getDb } from "./db";
import { isTauri } from "./env";
import { formatColor, getCopyFormat, nearestName } from "./colors";
import type { Pick } from "./picker";

/**
 * Pick history in the SQLite `picks` table (migration 2). The main window
 * records every pick (see `usePickRecorder`); other windows read it.
 */
export interface HistoryPick {
  id: number;
  hex: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** ISO 8601, UTC. */
  pickedAt: string;
}

/** Oldest picks beyond this are dropped. */
export const HISTORY_LIMIT = 500;
/** Broadcast after the history changes (a pick was saved, or it was cleared). */
export const HISTORY_EVENT = "huetype://history-changed";

/** Browser preview has no SQLite: keep picks in memory. */
const memory: HistoryPick[] = [];

export async function recordPick(p: Pick): Promise<void> {
  if (!isTauri()) {
    memory.unshift({ id: memory.length + 1, ...p, pickedAt: new Date().toISOString() });
    return;
  }
  const db = await getDb();
  await db.execute("INSERT INTO picks (hex, x, y, width, height) VALUES ($1, $2, $3, $4, $5)", [
    p.hex,
    p.x,
    p.y,
    p.width,
    p.height,
  ]);
  await db.execute("DELETE FROM picks WHERE id NOT IN (SELECT id FROM picks ORDER BY id DESC LIMIT $1)", [
    HISTORY_LIMIT,
  ]);
}

export async function recentPicks(limit: number): Promise<HistoryPick[]> {
  if (!isTauri()) return memory.slice(0, limit);
  const db = await getDb();
  return db.select<HistoryPick[]>(
    "SELECT id, hex, x, y, width, height, picked_at AS pickedAt FROM picks ORDER BY id DESC LIMIT $1",
    [limit],
  );
}

export async function clearHistory(): Promise<void> {
  if (!isTauri()) {
    memory.length = 0;
    return;
  }
  const db = await getDb();
  await db.execute("DELETE FROM picks");
  await historyChanged();
}

export async function historyChanged(): Promise<void> {
  if (isTauri()) await emit(HISTORY_EVENT);
}

export function onHistoryChanged(handler: () => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let cancelled = false;
  listen(HISTORY_EVENT, () => handler()).then((fn) => (cancelled ? fn() : (unlisten = fn)));
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** Refresh the tray's "Recent colors" menu from the history. */
export async function pushRecentToTray(): Promise<void> {
  if (!isTauri()) return;
  const [picks, format] = await Promise.all([recentPicks(8), getCopyFormat()]);
  const items = picks.map((p) => ({
    label: `${p.hex}   ${nearestName(p.hex).name}`,
    copy: formatColor(p.hex, format),
  }));
  await invoke("set_recent_picks", { items });
}
