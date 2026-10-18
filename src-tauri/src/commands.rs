//! Tauri command surface exposed to the webview.
use crate::ai::{self, ChatRequest, ChatResult};
use crate::error::{AppError, AppResult};
use crate::library::{DesignMeta, Library, Workspace};
use crate::{keys, workspace};
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;
use tauri::ipc::Channel;

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AiStreamEvent {
    TextDelta { text: String },
}

// ---- keys -----------------------------------------------------------------

#[tauri::command]
pub fn api_keys_status(profile_ids: Vec<String>) -> AppResult<HashMap<String, bool>> {
    keys::status(&profile_ids)
}

#[tauri::command]
pub fn api_key_set(profile_id: String, key: String) -> AppResult<()> {
    keys::set(&profile_id, &key)
}

#[tauri::command]
pub fn api_key_delete(profile_id: String) -> AppResult<()> {
    keys::delete(&profile_id)
}

// ---- AI -------------------------------------------------------------------

#[tauri::command]
pub async fn ai_chat(request: ChatRequest, on_event: Channel<AiStreamEvent>) -> AppResult<ChatResult> {
    let mut sink = move |t: &str| {
        let _ = on_event.send(AiStreamEvent::TextDelta { text: t.to_string() });
    };
    ai::chat(&request, &mut sink).await
}

// ---- library ----------------------------------------------------------------

#[tauri::command]
pub fn designs_list(lib: State<'_, Library>) -> AppResult<Vec<DesignMeta>> {
    lib.designs()
}

#[tauri::command]
pub fn design_store(id: String, json: String, lib: State<'_, Library>) -> AppResult<()> {
    lib.save_design(&id, &json)
}

#[tauri::command]
pub fn design_fetch(id: String, lib: State<'_, Library>) -> AppResult<String> {
    lib.load_design(&id)
}

#[tauri::command]
pub fn design_delete(id: String, lib: State<'_, Library>) -> AppResult<()> {
    lib.delete_design(&id)
}

/// Copies an image into the design's media folder; returns the stored path.
#[tauri::command]
pub fn media_import(id: String, path: String, lib: State<'_, Library>) -> AppResult<String> {
    lib.import_media(&id, &path)
}

/// Raw image bytes. Loading them as a blob keeps the canvas untainted, so it can be exported.
#[tauri::command]
pub async fn media_bytes(path: String) -> AppResult<tauri::ipc::Response> {
    const MAX: u64 = 60 * 1024 * 1024;
    if tokio::fs::metadata(&path).await?.len() > MAX {
        return Err(AppError::msg("File is too large to load into memory"));
    }
    Ok(tauri::ipc::Response::new(tokio::fs::read(&path).await?))
}

// ---- project folders (read-only, sandboxed) ----------------------------------

#[tauri::command]
pub fn workspaces_list(lib: State<'_, Library>) -> AppResult<Vec<Workspace>> {
    lib.workspaces()
}

#[tauri::command]
pub fn workspace_add(path: String, name: Option<String>, lib: State<'_, Library>) -> AppResult<Workspace> {
    lib.add_workspace(&path, name)
}

#[tauri::command]
pub fn workspace_rename(id: String, name: String, lib: State<'_, Library>) -> AppResult<()> {
    lib.rename_workspace(&id, &name)
}

#[tauri::command]
pub fn workspace_remove(id: String, lib: State<'_, Library>) -> AppResult<()> {
    lib.remove_workspace(&id)
}

fn ws_root(lib: &Library, workspace_id: &str) -> AppResult<String> {
    Ok(lib.workspace(workspace_id)?.path)
}

#[tauri::command]
pub fn ws_overview(workspace_id: String, lib: State<'_, Library>) -> AppResult<String> {
    workspace::overview(&ws_root(&lib, &workspace_id)?)
}

#[tauri::command]
pub fn ws_list_files(workspace_id: String, dir: String, depth: Option<usize>, lib: State<'_, Library>) -> AppResult<Vec<String>> {
    workspace::list_files(&ws_root(&lib, &workspace_id)?, &dir, depth.unwrap_or(2).clamp(1, 6), 400)
}

#[tauri::command]
pub fn ws_read_file(workspace_id: String, path: String, lib: State<'_, Library>) -> AppResult<String> {
    workspace::read_file(&ws_root(&lib, &workspace_id)?, &path, 60_000)
}

#[tauri::command]
pub fn ws_search(workspace_id: String, query: String, lib: State<'_, Library>) -> AppResult<Vec<String>> {
    workspace::search(&ws_root(&lib, &workspace_id)?, &query, 60)
}

#[tauri::command]
pub fn ws_images(workspace_id: String, lib: State<'_, Library>) -> AppResult<Vec<String>> {
    workspace::images(&ws_root(&lib, &workspace_id)?, 200)
}

#[tauri::command]
pub async fn ws_image_bytes(workspace_id: String, path: String, lib: State<'_, Library>) -> AppResult<tauri::ipc::Response> {
    let root = ws_root(&lib, &workspace_id)?;
    let bytes =
        tokio::task::spawn_blocking(move || workspace::image_bytes(&root, &path)).await.map_err(|e| AppError::msg(e.to_string()))??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn ws_image_import(design_id: String, workspace_id: String, path: String, lib: State<'_, Library>) -> AppResult<String> {
    lib.import_workspace_image(&design_id, &workspace_id, &path)
}
