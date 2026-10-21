CREATE TABLE IF NOT EXISTS session_groups (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_group_members (
    group_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    PRIMARY KEY (group_id, session_id),
    FOREIGN KEY (group_id) REFERENCES session_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_group_members_session_id
    ON session_group_members(session_id);