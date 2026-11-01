import Database from "@tauri-apps/plugin-sql";

/** Must match `DB_URL` in src-tauri/src/db.rs, where the migrations live. */
export const DB_URL = "sqlite:huetype.db";

let dbPromise: Promise<Database> | null = null;

/** Shared connection; migrations run on first load. */
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL).catch((err) => {
      dbPromise = null; // allow a retry on the next call
      throw err;
    });
  }
  return dbPromise;
}
