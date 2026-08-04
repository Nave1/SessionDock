DROP TRIGGER IF EXISTS sessions_ai;
DROP TRIGGER IF EXISTS sessions_ad;
DROP TRIGGER IF EXISTS sessions_au;
DROP TABLE IF EXISTS sessions_fts;

CREATE VIRTUAL TABLE sessions_fts USING fts5(
    name,
    host,
    username,
    device_type,
    vendor,
    model,
    description,
    notes,
    bmc_server_hostname,
    bmc_server_serial_number,
    bmc_site,
    bmc_rack,
    bmc_rack_unit,
    content='sessions',
    content_rowid='rowid'
);

CREATE TRIGGER sessions_ai AFTER INSERT ON sessions BEGIN
    INSERT INTO sessions_fts(
        rowid, name, host, username, device_type, vendor, model, description, notes,
        bmc_server_hostname, bmc_server_serial_number, bmc_site, bmc_rack, bmc_rack_unit
    ) VALUES (
        new.rowid, new.name, new.host, new.username, new.device_type, new.vendor, new.model,
        new.description, new.notes, new.bmc_server_hostname, new.bmc_server_serial_number,
        new.bmc_site, new.bmc_rack, new.bmc_rack_unit
    );
END;

CREATE TRIGGER sessions_ad AFTER DELETE ON sessions BEGIN
    INSERT INTO sessions_fts(
        sessions_fts, rowid, name, host, username, device_type, vendor, model, description,
        notes, bmc_server_hostname, bmc_server_serial_number, bmc_site, bmc_rack, bmc_rack_unit
    ) VALUES (
        'delete', old.rowid, old.name, old.host, old.username, old.device_type, old.vendor,
        old.model, old.description, old.notes, old.bmc_server_hostname,
        old.bmc_server_serial_number, old.bmc_site, old.bmc_rack, old.bmc_rack_unit
    );
END;

CREATE TRIGGER sessions_au AFTER UPDATE ON sessions BEGIN
    INSERT INTO sessions_fts(
        sessions_fts, rowid, name, host, username, device_type, vendor, model, description,
        notes, bmc_server_hostname, bmc_server_serial_number, bmc_site, bmc_rack, bmc_rack_unit
    ) VALUES (
        'delete', old.rowid, old.name, old.host, old.username, old.device_type, old.vendor,
        old.model, old.description, old.notes, old.bmc_server_hostname,
        old.bmc_server_serial_number, old.bmc_site, old.bmc_rack, old.bmc_rack_unit
    );
    INSERT INTO sessions_fts(
        rowid, name, host, username, device_type, vendor, model, description, notes,
        bmc_server_hostname, bmc_server_serial_number, bmc_site, bmc_rack, bmc_rack_unit
    ) VALUES (
        new.rowid, new.name, new.host, new.username, new.device_type, new.vendor, new.model,
        new.description, new.notes, new.bmc_server_hostname, new.bmc_server_serial_number,
        new.bmc_site, new.bmc_rack, new.bmc_rack_unit
    );
END;

INSERT INTO sessions_fts(sessions_fts) VALUES ('rebuild');