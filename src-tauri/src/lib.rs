use tauri::Manager;

mod commands;
mod db;
mod credential_vault;
mod error;
mod models;
mod protocols;
mod terminal;

pub use db::Database;
pub use error::AppError;
use commands::connections::ConnectionManager;
use terminal::{NativeSshManager, TelnetManager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");

            let db_path = app_data_dir.join("sessiondock.db");
            let database = Database::new(&db_path)
                .expect("Failed to initialize database");

            app.manage(database);
            app.manage(ConnectionManager::new());
            app.manage(NativeSshManager::new());
            app.manage(TelnetManager::new());

            log::info!("SessionDock initialized. DB: {:?}", db_path);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sessions::create_session,
            commands::sessions::get_sessions,
            commands::sessions::get_session,
            commands::sessions::update_session,
            commands::sessions::delete_session,
            commands::sessions::search_sessions,
            commands::folders::create_folder,
            commands::folders::get_folders,
            commands::folders::update_folder,
            commands::folders::delete_folder,
            commands::credentials::store_credential,
            commands::credentials::get_credential_profiles,
            commands::credentials::delete_credential,
            commands::serial::list_serial_ports,
            commands::connections::connect_ssh,
            commands::connections::connect_telnet,
            commands::connections::terminal_write,
            commands::connections::terminal_resize,
            commands::connections::disconnect_terminal,
            commands::known_hosts::get_known_hosts,
            commands::known_hosts::verify_host_key,
            commands::known_hosts::trust_host_key,
            commands::known_hosts::remove_known_host,
            commands::data::export_sessions_json,
            commands::data::export_sessions_csv,
            commands::data::import_sessions_json,
            commands::terminal::spawn_terminal,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::close_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
