-- Migration 001: Initial schema

CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    parent_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    host TEXT NOT NULL DEFAULT '',
    port INTEGER NOT NULL DEFAULT 22,
    protocol TEXT NOT NULL DEFAULT 'ssh',
    username TEXT,
    credential_profile_id TEXT,
    authentication_method TEXT NOT NULL DEFAULT 'password',
    private_key_reference TEXT,
    folder_id TEXT,
    device_type TEXT,
    vendor TEXT,
    model TEXT,
    description TEXT,
    notes TEXT,
    favorite INTEGER NOT NULL DEFAULT 0,
    startup_command TEXT,
    connection_timeout INTEGER NOT NULL DEFAULT 30,
    keepalive_interval INTEGER NOT NULL DEFAULT 60,
    terminal_profile_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_connected_at TEXT,
    connection_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL,
    FOREIGN KEY (credential_profile_id) REFERENCES credential_profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS credential_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    authentication_method TEXT NOT NULL DEFAULT 'password',
    vault_reference TEXT NOT NULL DEFAULT '',
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_tags (
    session_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (session_id, tag_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS terminal_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    font_family TEXT NOT NULL DEFAULT 'JetBrains Mono, Consolas, monospace',
    font_size INTEGER NOT NULL DEFAULT 14,
    line_height REAL NOT NULL DEFAULT 1.2,
    theme TEXT NOT NULL DEFAULT 'dark',
    cursor_style TEXT NOT NULL DEFAULT 'block',
    cursor_blink INTEGER NOT NULL DEFAULT 1,
    scrollback_limit INTEGER NOT NULL DEFAULT 10000,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS known_hosts (
    id TEXT PRIMARY KEY NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    key_type TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    trusted_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(host, port)
);

CREATE TABLE IF NOT EXISTS application_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recently_closed_tabs (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    closed_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_name ON sessions(name);
CREATE INDEX IF NOT EXISTS idx_sessions_host ON sessions(host);
CREATE INDEX IF NOT EXISTS idx_sessions_protocol ON sessions(protocol);
CREATE INDEX IF NOT EXISTS idx_sessions_folder_id ON sessions(folder_id);
CREATE INDEX IF NOT EXISTS idx_sessions_favorite ON sessions(favorite);
CREATE INDEX IF NOT EXISTS idx_sessions_last_connected ON sessions(last_connected_at);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
    name,
    host,
    username,
    device_type,
    vendor,
    model,
    description,
    notes,
    content='sessions',
    content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
    INSERT INTO sessions_fts(rowid, name, host, username, device_type, vendor, model, description, notes)
    VALUES (new.rowid, new.name, new.host, new.username, new.device_type, new.vendor, new.model, new.description, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
    INSERT INTO sessions_fts(sessions_fts, rowid, name, host, username, device_type, vendor, model, description, notes)
    VALUES ('delete', old.rowid, old.name, old.host, old.username, old.device_type, old.vendor, old.model, old.description, old.notes);
END;

CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
    INSERT INTO sessions_fts(sessions_fts, rowid, name, host, username, device_type, vendor, model, description, notes)
    VALUES ('delete', old.rowid, old.name, old.host, old.username, old.device_type, old.vendor, old.model, old.description, old.notes);
    INSERT INTO sessions_fts(rowid, name, host, username, device_type, vendor, model, description, notes)
    VALUES (new.rowid, new.name, new.host, new.username, new.device_type, new.vendor, new.model, new.description, new.notes);
END;

-- Insert default terminal profile
INSERT OR IGNORE INTO terminal_profiles (id, name) VALUES ('default', 'Default');

-- Insert default settings
INSERT OR IGNORE INTO application_settings (key, value) VALUES ('theme', 'dark');
INSERT OR IGNORE INTO application_settings (key, value) VALUES ('language', 'en');
INSERT OR IGNORE INTO application_settings (key, value) VALUES ('default_protocol', 'ssh');
INSERT OR IGNORE INTO application_settings (key, value) VALUES ('confirm_close_active', 'true');
INSERT OR IGNORE INTO application_settings (key, value) VALUES ('restore_tabs', 'true');
