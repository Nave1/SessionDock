use tauri::Manager;

mod commands;
mod credential_vault;
mod db;
mod error;
mod models;
mod protocols;
mod terminal;
mod updater_proxy;

use commands::diagnostics::DiagnosticsManager;
use commands::multi_exec::MultiExecManager;
use commands::sftp::SftpTransferManager;
use commands::terminal_logging::TerminalLogManager;
use commands::tunnels::SshTunnelManager;
pub use db::Database;
pub use error::AppError;
use terminal::{NativeSshManager, SerialManager, TelnetManager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    updater_proxy::configure();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");

            let db_path = app_data_dir.join("sessiondock.db");
            let database = Database::new(&db_path).expect("Failed to initialize database");

            app.manage(database);
            app.manage(NativeSshManager::new());
            app.manage(SftpTransferManager::new());
            app.manage(SshTunnelManager::new());
            app.manage(DiagnosticsManager::new());
            app.manage(MultiExecManager::new());
            app.manage(TerminalLogManager::new());
            app.manage(TelnetManager::new());
            app.manage(SerialManager::new());

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
            commands::groups::create_session_group,
            commands::groups::get_session_groups,
            commands::groups::update_session_group,
            commands::groups::delete_session_group,
            commands::groups::get_session_group_members,
            commands::groups::set_session_group_members,
            commands::credentials::store_credential,
            commands::credentials::update_credential,
            commands::credentials::get_credential_secret,
            commands::credentials::get_credential_profiles,
            commands::credentials::delete_credential,
            commands::serial::list_serial_ports,
            commands::known_hosts::get_known_hosts,
            commands::known_hosts::verify_host_key,
            commands::known_hosts::trust_host_key,
            commands::known_hosts::remove_known_host,
            commands::data::export_sessions_json,
            commands::data::export_sessions_csv,
            commands::data::import_sessions_json,
            commands::data::write_text_file_to_path,
            commands::data::read_text_file_from_path,
            commands::data::clear_recent_sessions,
            commands::data::reset_application_data,
            commands::terminal::spawn_terminal,
            commands::terminal::inspect_ssh_host_key,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::close_terminal,
            commands::terminal_logging::start_terminal_logging,
            commands::terminal_logging::stop_terminal_logging,
            commands::terminal_logging::get_terminal_logging_status,
            commands::sftp::list_sftp_directory,
            commands::sftp::create_sftp_directory,
            commands::sftp::rename_sftp_entry,
            commands::sftp::delete_sftp_entry,
            commands::sftp::start_sftp_upload,
            commands::sftp::start_sftp_download,
            commands::sftp::pause_sftp_transfer,
            commands::sftp::resume_sftp_transfer,
            commands::sftp::cancel_sftp_transfer,
            commands::scp::start_scp_upload,
            commands::scp::start_scp_download,
            commands::tunnels::start_local_tunnel,
            commands::tunnels::start_remote_tunnel,
            commands::tunnels::start_dynamic_tunnel,
            commands::tunnels::list_ssh_tunnels,
            commands::tunnels::stop_ssh_tunnel,
            commands::diagnostics::start_ssh_diagnostic,
            commands::diagnostics::cancel_ssh_diagnostic,
            commands::multi_exec::classify_multi_exec_command,
            commands::multi_exec::start_multi_exec,
            commands::multi_exec::cancel_multi_exec,
            commands::snippets::get_snippets,
            commands::snippets::create_snippet,
            commands::snippets::update_snippet,
            commands::snippets::delete_snippet,
            commands::bmc::create_bmc_webview,
            commands::bmc::set_bmc_webview_bounds,
            commands::bmc::set_bmc_webview_visible,
            commands::bmc::reload_bmc_webview,
            commands::bmc::close_bmc_webview,
            commands::bmc::test_bmc_connection,
            commands::vnc::launch_vnc_viewer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
