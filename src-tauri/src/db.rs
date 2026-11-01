//! SQLite schema. The database lives in the app config dir as `huetype.db`
//! and is opened from the frontend with `@tauri-apps/plugin-sql`.
//!
//! Migrations are append-only: never edit a released migration, add a new
//! version instead.

use tauri_plugin_sql::{Migration, MigrationKind};

pub const DB_URL: &str = "sqlite:huetype.db";

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create settings table",
            sql: "CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
              );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create picks table (color pick history)",
            sql: "CREATE TABLE IF NOT EXISTS picks (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                hex       TEXT NOT NULL,
                x         INTEGER NOT NULL,
                y         INTEGER NOT NULL,
                width     INTEGER NOT NULL DEFAULT 1,
                height    INTEGER NOT NULL DEFAULT 1,
                picked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
              );
              CREATE INDEX IF NOT EXISTS picks_picked_at ON picks (picked_at DESC);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create palettes table (saved palettes)",
            sql: "CREATE TABLE IF NOT EXISTS palettes (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                colors     TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
              );",
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_are_unique_and_increasing() {
        let versions: Vec<i64> = migrations().iter().map(|m| m.version).collect();
        assert!(versions.windows(2).all(|w| w[0] < w[1]), "{versions:?}");
        assert_eq!(versions.first(), Some(&1));
    }
}
