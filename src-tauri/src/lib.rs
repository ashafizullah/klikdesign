mod ai;
mod commands;
mod error;
mod keys;
mod library;
mod mcp;
mod terminal;
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(terminal::Terminals::default())
        .setup(|app| {
            use tauri::Manager;
            let dir = app.path().app_data_dir()?;
            keys::init(dir.clone());
            app.manage(mcp::Mcp::new(dir.clone()));
            app.manage(library::Library::new(dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::api_keys_status,
            commands::api_key_set,
            commands::api_key_delete,
            commands::ai_chat,
            commands::designs_list,
            commands::design_store,
            commands::design_fetch,
            commands::design_delete,
            commands::media_import,
            commands::media_bytes,
            commands::workspaces_list,
            commands::workspace_add,
            commands::workspace_rename,
            commands::workspace_remove,
            commands::ws_overview,
            commands::ws_list_files,
            commands::ws_read_file,
            commands::ws_search,
            commands::ws_images,
            commands::ws_image_bytes,
            commands::ws_image_import,
            commands::terminal_open,
            commands::terminal_write,
            commands::terminal_resize,
            commands::terminal_close,
            commands::mcp_start,
            commands::mcp_stop,
            commands::mcp_link,
            commands::mcp_reply,
            commands::export_write,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
