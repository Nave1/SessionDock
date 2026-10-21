use std::collections::HashSet;

use crate::db::Database;
use crate::error::AppError;
use crate::models::{CreateSessionGroupRequest, SessionGroup, SetSessionGroupMembersRequest};
use tauri::State;

const MAX_GROUP_NAME_LENGTH: usize = 100;
const MAX_GROUP_MEMBERS: usize = 10_000;

fn validate_group_name(name: &str) -> Result<&str, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("Group name is required".into()));
    }
    if trimmed.chars().count() > MAX_GROUP_NAME_LENGTH {
        return Err(AppError::Validation(format!(
            "Group name must be {MAX_GROUP_NAME_LENGTH} characters or fewer"
        )));
    }
    Ok(trimmed)
}

fn validate_identifier(id: &str, label: &str) -> Result<(), AppError> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| AppError::Validation(format!("Invalid {label} identifier")))
}

fn get_group_by_id(conn: &rusqlite::Connection, id: &str) -> Result<SessionGroup, AppError> {
    conn.query_row(
        "SELECT g.id, g.name, COUNT(m.session_id), g.created_at, g.updated_at
         FROM session_groups g
         LEFT JOIN session_group_members m ON m.group_id = g.id
         WHERE g.id = ?1
         GROUP BY g.id",
        rusqlite::params![id],
        |row| {
            Ok(SessionGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                member_count: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound(format!("Session group not found: {id}"))
        }
        other => AppError::Database(other),
    })
}

#[tauri::command]
pub fn create_session_group(
    db: State<'_, Database>,
    request: CreateSessionGroupRequest,
) -> Result<SessionGroup, AppError> {
    let name = validate_group_name(&request.name)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let conn = db.conn();
    let duplicate: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM session_groups WHERE name = ?1 COLLATE NOCASE)",
        rusqlite::params![name],
        |row| row.get(0),
    )?;
    if duplicate {
        return Err(AppError::Validation(
            "A group with this name already exists".into(),
        ));
    }
    conn.execute(
        "INSERT INTO session_groups (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, name, now, now],
    )?;
    get_group_by_id(&conn, &id)
}

#[tauri::command]
pub fn get_session_groups(db: State<'_, Database>) -> Result<Vec<SessionGroup>, AppError> {
    let conn = db.conn();
    let mut statement = conn.prepare(
        "SELECT g.id, g.name, COUNT(m.session_id), g.created_at, g.updated_at
         FROM session_groups g
         LEFT JOIN session_group_members m ON m.group_id = g.id
         GROUP BY g.id
         ORDER BY g.name COLLATE NOCASE",
    )?;
    let groups = statement.query_map([], |row| {
        Ok(SessionGroup {
            id: row.get(0)?,
            name: row.get(1)?,
            member_count: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    groups
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::Database)
}

#[tauri::command]
pub fn update_session_group(
    db: State<'_, Database>,
    id: String,
    name: String,
) -> Result<SessionGroup, AppError> {
    validate_identifier(&id, "group")?;
    let name = validate_group_name(&name)?;
    let conn = db.conn();
    get_group_by_id(&conn, &id)?;
    let duplicate: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM session_groups WHERE name = ?1 COLLATE NOCASE AND id != ?2)",
        rusqlite::params![name, id],
        |row| row.get(0),
    )?;
    if duplicate {
        return Err(AppError::Validation(
            "A group with this name already exists".into(),
        ));
    }
    conn.execute(
        "UPDATE session_groups SET name = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![name, chrono::Utc::now().to_rfc3339(), id],
    )?;
    get_group_by_id(&conn, &id)
}

#[tauri::command]
pub fn delete_session_group(db: State<'_, Database>, id: String) -> Result<(), AppError> {
    validate_identifier(&id, "group")?;
    let conn = db.conn();
    let deleted = conn.execute(
        "DELETE FROM session_groups WHERE id = ?1",
        rusqlite::params![id],
    )?;
    if deleted == 0 {
        return Err(AppError::NotFound(format!("Session group not found: {id}")));
    }
    Ok(())
}

#[tauri::command]
pub fn get_session_group_members(
    db: State<'_, Database>,
    group_id: String,
) -> Result<Vec<String>, AppError> {
    validate_identifier(&group_id, "group")?;
    let conn = db.conn();
    get_group_by_id(&conn, &group_id)?;
    let mut statement = conn.prepare(
        "SELECT session_id FROM session_group_members WHERE group_id = ?1 ORDER BY session_id",
    )?;
    let ids = statement.query_map(rusqlite::params![group_id], |row| row.get(0))?;
    ids.collect::<Result<Vec<_>, _>>()
        .map_err(AppError::Database)
}

#[tauri::command]
pub fn set_session_group_members(
    db: State<'_, Database>,
    request: SetSessionGroupMembersRequest,
) -> Result<SessionGroup, AppError> {
    let mut conn = db.conn();
    set_group_members(&mut conn, &request.group_id, request.session_ids)
}

fn set_group_members(
    conn: &mut rusqlite::Connection,
    group_id: &str,
    session_ids: Vec<String>,
) -> Result<SessionGroup, AppError> {
    validate_identifier(group_id, "group")?;
    if session_ids.len() > MAX_GROUP_MEMBERS {
        return Err(AppError::Validation(format!(
            "A group cannot contain more than {MAX_GROUP_MEMBERS} sessions"
        )));
    }
    let mut unique_ids = Vec::with_capacity(session_ids.len());
    let mut seen = HashSet::with_capacity(session_ids.len());
    for session_id in session_ids {
        validate_identifier(&session_id, "session")?;
        if seen.insert(session_id.clone()) {
            unique_ids.push(session_id);
        }
    }

    get_group_by_id(conn, group_id)?;
    let transaction = conn.transaction()?;
    for session_id in &unique_ids {
        let exists: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ?1)",
            rusqlite::params![session_id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound(format!(
                "Session not found: {session_id}"
            )));
        }
    }
    transaction.execute(
        "DELETE FROM session_group_members WHERE group_id = ?1",
        rusqlite::params![group_id],
    )?;
    for session_id in unique_ids {
        transaction.execute(
            "INSERT INTO session_group_members (group_id, session_id) VALUES (?1, ?2)",
            rusqlite::params![group_id, session_id],
        )?;
    }
    transaction.commit()?;
    get_group_by_id(conn, group_id)
}

#[cfg(test)]
mod tests {
    use super::{set_group_members, validate_group_name, validate_identifier};
    use rusqlite::Connection;

    #[test]
    fn group_name_is_trimmed_and_bounded() {
        assert_eq!(
            validate_group_name("  Core switches  ").unwrap(),
            "Core switches"
        );
        assert!(validate_group_name("   ").is_err());
        assert!(validate_group_name(&"x".repeat(101)).is_err());
        assert!(validate_identifier("not-a-uuid", "group").is_err());
    }

    #[test]
    fn group_members_are_replaced_and_counted() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(include_str!("../migrations/001_initial.sql"))
            .unwrap();
        conn.execute_batch(include_str!("../migrations/007_session_groups.sql"))
            .unwrap();
        let group_id = uuid::Uuid::new_v4().to_string();
        let session_ids = [
            uuid::Uuid::new_v4().to_string(),
            uuid::Uuid::new_v4().to_string(),
        ];
        conn.execute(
            "INSERT INTO session_groups (id, name) VALUES (?1, 'Core')",
            rusqlite::params![group_id],
        )
        .unwrap();
        for id in &session_ids {
            conn.execute(
                "INSERT INTO sessions (id, name, host) VALUES (?1, ?1, '192.0.2.1')",
                rusqlite::params![id],
            )
            .unwrap();
        }

        let group = set_group_members(
            &mut conn,
            &group_id,
            vec![
                session_ids[0].clone(),
                session_ids[1].clone(),
                session_ids[0].clone(),
            ],
        )
        .unwrap();
        assert_eq!(group.member_count, 2);

        let group = set_group_members(&mut conn, &group_id, vec![session_ids[1].clone()]).unwrap();
        assert_eq!(group.member_count, 1);
        assert_eq!(
            conn.query_row(
                "SELECT session_id FROM session_group_members WHERE group_id = ?1",
                rusqlite::params![group_id],
                |row| row.get::<_, String>(0),
            )
            .unwrap(),
            session_ids[1]
        );
    }
}
