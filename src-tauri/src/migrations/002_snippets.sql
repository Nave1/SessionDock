-- Migration 002: Command Snippets

CREATE TABLE IF NOT EXISTS command_snippets (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    description TEXT,
    category TEXT,
    vendor TEXT,
    device_type TEXT,
    favorite INTEGER NOT NULL DEFAULT 0,
    destructive INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_snippets_name ON command_snippets(name);
CREATE INDEX IF NOT EXISTS idx_snippets_vendor ON command_snippets(vendor);
CREATE INDEX IF NOT EXISTS idx_snippets_category ON command_snippets(category);
CREATE INDEX IF NOT EXISTS idx_snippets_favorite ON command_snippets(favorite);
