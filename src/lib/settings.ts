import { getDb } from "./db";
import { isTauri } from "./env";

/**
 * App settings, stored as key/value rows in the SQLite `settings` table.
 * Outside Tauri (browser preview) they fall back to localStorage.
 */
export type ThemePref = "system" | "light" | "dark";

export interface Settings {
  theme: ThemePref;
}

export const DEFAULT_SETTINGS: Settings = { theme: "system" };

const LS_PREFIX = "huetype.";

function parse(key: keyof Settings, raw: string | null | undefined): Settings[typeof key] | undefined {
  if (key === "theme" && (raw === "system" || raw === "light" || raw === "dark")) return raw;
  return undefined;
}

/** Synchronous best guess for first paint (avoids a theme flash before SQLite answers). */
export function cachedSettings(): Settings {
  const out = { ...DEFAULT_SETTINGS };
  try {
    out.theme = (parse("theme", localStorage.getItem(LS_PREFIX + "theme")) as ThemePref) ?? out.theme;
  } catch {
    // storage unavailable
  }
  return out;
}

export async function loadSettings(): Promise<Settings> {
  const out = cachedSettings();
  if (!isTauri()) return out;
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }[]>("SELECT key, value FROM settings");
  for (const row of rows) {
    if (row.key === "theme") out.theme = (parse("theme", row.value) as ThemePref) ?? out.theme;
  }
  return out;
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  try {
    localStorage.setItem(LS_PREFIX + key, String(value));
  } catch {
    // ignore
  }
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, String(value)],
  );
}

/**
 * Raw key/value access for settings that are not part of `Settings`
 * (e.g. `shortcut.pick_color`). Same storage and fallback as above.
 */
export async function getRawSettings(prefix: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!isTauri()) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(LS_PREFIX + prefix)) out[k.slice(LS_PREFIX.length)] = localStorage.getItem(k) ?? "";
      }
    } catch {
      // ignore
    }
    return out;
  }
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings WHERE key LIKE $1",
    [`${prefix}%`],
  );
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export async function setRawSetting(key: string, value: string | null): Promise<void> {
  if (!isTauri()) {
    try {
      if (value === null) localStorage.removeItem(LS_PREFIX + key);
      else localStorage.setItem(LS_PREFIX + key, value);
    } catch {
      // ignore
    }
    return;
  }
  const db = await getDb();
  if (value === null) await db.execute("DELETE FROM settings WHERE key = $1", [key]);
  else
    await db.execute(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
    );
}
