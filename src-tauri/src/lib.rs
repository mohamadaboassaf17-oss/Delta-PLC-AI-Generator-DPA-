//! Tauri application entry point.
//!
//! Wires the `commands`, `error`, `models`, and `paths` modules into a Tauri
//! v2 application, registers the dialog, opener, and clipboard plugins,
//! and manages the per-app `ActiveProject` state container.

mod commands;
mod error;
mod limits;
mod models;
mod paths;
mod prompts;
mod providers;

use tauri::Manager;

use crate::commands::project::ActiveProject;

/// Build, configure, and run the Tauri application.
///
/// The application is initialized with:
/// - The `tauri-plugin-dialog` plugin (file/folder pickers).
/// - The `tauri-plugin-opener` plugin (open URLs / files in the OS handler).
/// - The `tauri-plugin-clipboard-manager` plugin (used by `copy_il_to_clipboard`).
/// - Managed `ActiveProject` state for tracking the currently-open project.
/// - Thirty-two IPC commands covering project file I/O, settings persistence
///   (including `settings_set_api_key`/`has_api_key`/`test_connection` aliases),
///   I/O table models, code generation, Ladder Diagram rendering, AI-review
///   conflict scanning, DPA-ISPSoft / DOPSoft export, Trust-on-First-Use
///   domain gating, secure API-key storage, and recent-projects MRU
///   (`recent_projects_*` canonical + `project_list_recent` legacy alias).
///   See `commands::project`, `commands::recent_projects`,
///   `commands::settings`, `commands::io_table`, `commands::generation`,
///   `commands::ladder`, `commands::conflict`, `commands::export`,
///   `commands::trusted_domains`, and `commands::secrets`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(ActiveProject::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::project::project_new,
            commands::project::project_open,
            commands::project::project_save,
            commands::project::project_save_as,
            commands::project::project_list_recent,
            commands::project::project_clear_active,
            commands::recent_projects::recent_projects_list,
            commands::recent_projects::recent_projects_push,
            commands::recent_projects::recent_projects_remove,
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::settings::settings_set_api_key,
            commands::settings::settings_has_api_key,
            commands::settings::settings_test_connection,
            commands::secrets::secret_set,
            commands::secrets::secret_get,
            commands::secrets::secret_delete,
            commands::secrets::secret_test,
            commands::io_table::dvp_list_models,
            commands::io_table::dvp_validate_address,
            commands::generation::generate_code,
            commands::generation::modify_code,
            commands::ladder::render_ladder,
            commands::conflict::scan_code_conflicts,
            commands::conflict::check_model_limits,
            commands::export::export_xml,
            commands::export::export_csv,
            commands::export::copy_il_to_clipboard,
            commands::trusted_domains::trusted_domains_list,
            commands::trusted_domains::trusted_domains_add,
            commands::trusted_domains::trusted_domains_remove,
            commands::trusted_domains::trusted_domains_is_trusted,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use crate::commands::project::ActiveProject;

    #[test]
    fn active_project_default_is_none() {
        let active = ActiveProject::default();
        let guard = active.0.lock().expect("mutex poisoned");
        assert!(guard.is_none());
    }
}
