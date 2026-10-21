CREATE TABLE IF NOT EXISTS session_jump_hosts (
    session_id TEXT NOT NULL,
    jump_session_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (session_id, position),
    UNIQUE (session_id, jump_session_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (jump_session_id) REFERENCES sessions(id) ON DELETE RESTRICT,
    CHECK (position >= 0 AND position < 5),
    CHECK (session_id <> jump_session_id)
);

CREATE INDEX IF NOT EXISTS idx_session_jump_hosts_jump_session
ON session_jump_hosts(jump_session_id);