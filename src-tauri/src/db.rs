use rusqlite::{Connection, params};
use std::path::Path;
use std::sync::Mutex;

use crate::error::AppError;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &Path) -> Result<Self, AppError> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.run_migrations()?;
        Ok(db)
    }

    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().expect("Database mutex poisoned")
    }

    fn run_migrations(&self) -> Result<(), AppError> {
        let conn = self.conn();

        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            ",
        )?;

        let current_version: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if current_version < 1 {
            conn.execute_batch(include_str!("migrations/001_initial.sql"))?;
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                params![1],
            )?;
        }

        if current_version < 2 {
            conn.execute_batch(include_str!("migrations/002_snippets.sql"))?;
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                params![2],
            )?;
        }

        log::info!("Database migrations complete. Version: {}", 
            std::cmp::max(current_version, 2));
        Ok(())
    }
}
