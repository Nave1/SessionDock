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

        if current_version < 3 {
            add_bmc_columns(&conn)?;
            conn.execute_batch(include_str!("migrations/003_bmc_sessions.sql"))?;
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                params![3],
            )?;
        }

        log::info!("Database migrations complete. Version: {}", 
            std::cmp::max(current_version, 3));
        Ok(())
    }
}

fn add_bmc_columns(conn: &Connection) -> Result<(), AppError> {
    let columns = [
        ("bmc_use_https", "INTEGER NOT NULL DEFAULT 1"),
        ("bmc_web_path", "TEXT"),
        ("bmc_console_url", "TEXT"),
        ("bmc_viewer_mode", "TEXT NOT NULL DEFAULT 'web'"),
        ("bmc_ignore_tls_errors", "INTEGER NOT NULL DEFAULT 0"),
        ("bmc_open_console_automatically", "INTEGER NOT NULL DEFAULT 0"),
        ("bmc_open_fullscreen", "INTEGER NOT NULL DEFAULT 0"),
        ("bmc_timeout_seconds", "INTEGER NOT NULL DEFAULT 30"),
        ("bmc_server_hostname", "TEXT"),
        ("bmc_server_serial_number", "TEXT"),
        ("bmc_rack", "TEXT"),
        ("bmc_rack_unit", "TEXT"),
        ("bmc_site", "TEXT"),
        ("bmc_redfish_enabled", "INTEGER NOT NULL DEFAULT 1"),
        ("bmc_cookie_persistence", "TEXT NOT NULL DEFAULT 'application'"),
    ];

    for (name, definition) in columns {
        let exists = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('sessions') WHERE name = ?1)",
            params![name],
            |row| row.get::<_, bool>(0),
        )?;
        if !exists {
            conn.execute_batch(&format!("ALTER TABLE sessions ADD COLUMN {name} {definition};"))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::Database;
    use rusqlite::Connection;

    #[test]
    fn migrates_v2_database_without_changing_existing_session() {
        let path = std::env::temp_dir().join(format!(
            "sessiondock-bmc-migration-{}.db",
            uuid::Uuid::new_v4()
        ));
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(include_str!("migrations/001_initial.sql")).unwrap();
        conn.execute_batch(include_str!("migrations/002_snippets.sql")).unwrap();
        conn.execute_batch(
            "CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
             INSERT INTO schema_version(version) VALUES (1), (2);
             INSERT INTO sessions (id, name, host, port, protocol, authentication_method, created_at, updated_at)
             VALUES ('legacy-session', 'Legacy SSH', '192.0.2.10', 22, 'ssh', 'password', datetime('now'), datetime('now'));",
        ).unwrap();
        drop(conn);

        let db = Database::new(&path).unwrap();
        let conn = db.conn();
        let row: (String, String, i64, String) = conn.query_row(
            "SELECT name, protocol, bmc_use_https, bmc_viewer_mode FROM sessions WHERE id = 'legacy-session'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        ).unwrap();
        assert_eq!(row, ("Legacy SSH".into(), "ssh".into(), 1, "web".into()));
        assert_eq!(conn.query_row("SELECT MAX(version) FROM schema_version", [], |row| row.get::<_, i64>(0)).unwrap(), 3);
        conn.execute(
            "UPDATE sessions SET protocol = 'bmc', bmc_site = 'North Campus', bmc_server_serial_number = 'SN-700' WHERE id = 'legacy-session'",
            [],
        ).unwrap();
        assert_eq!(conn.query_row(
            "SELECT COUNT(*) FROM sessions_fts WHERE sessions_fts MATCH 'North'",
            [],
            |row| row.get::<_, i64>(0),
        ).unwrap(), 1);
        drop(conn);
        drop(db);
        std::fs::remove_file(path).unwrap();
    }
}
