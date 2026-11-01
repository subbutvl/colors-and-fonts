//! SQLite schema. The database lives in the app config dir as `huetype.db`
//! and is opened from the frontend with `@tauri-apps/plugin-sql`.
//!
//! Migrations are append-only: never edit a released migration, add a new
//! version instead.

use tauri_plugin_sql::{Migration, MigrationKind};

pub const DB_URL: &str = "sqlite:huetype.db";

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create settings table",
        sql: "CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
              );",
        kind: MigrationKind::Up,
    }]
}
