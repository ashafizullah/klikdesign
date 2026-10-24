//! Tauri command surface exposed to the webview.
use crate::ai::{self, ChatRequest, ChatResult, ModelsRequest};
use crate::clipboard::{Clip, Clipboard};
use crate::error::{AppError, AppResult};
use crate::library::{DesignMeta, Library, Workspace};
use crate::versions::{self, VersionMeta};
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

#[tauri::command]
pub async fn ai_models(request: ModelsRequest) -> AppResult<Vec<String>> {
    ai::models(&request).await
}

// ---- fonts ------------------------------------------------------------------

#[tauri::command]
pub async fn system_fonts() -> AppResult<Vec<crate::fonts::SystemFont>> {
    tokio::task::spawn_blocking(crate::fonts::list).await.map_err(|e| AppError::msg(e.to_string()))
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

#[tauri::command]
pub fn media_list(id: String, lib: State<'_, Library>) -> AppResult<Vec<String>> {
    lib.list_media(&id)
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

// ---- version history -------------------------------------------------------

#[tauri::command]
pub fn versions_list(id: String, lib: State<'_, Library>) -> AppResult<Vec<VersionMeta>> {
    versions::list(&lib.design_dir(&id)?.join("versions"))
}

#[tauri::command]
pub fn version_save(id: String, meta: VersionMeta, design: String, lib: State<'_, Library>) -> AppResult<VersionMeta> {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    versions::save(&lib.design_dir(&id)?.join("versions"), meta, &design, now)
}

#[tauri::command]
pub fn version_load(id: String, version: String, lib: State<'_, Library>) -> AppResult<String> {
    versions::load(&lib.design_dir(&id)?.join("versions"), &version)
}

#[tauri::command]
pub fn version_delete(id: String, version: String, lib: State<'_, Library>) -> AppResult<()> {
    versions::delete(&lib.design_dir(&id)?.join("versions"), &version)
}

// ---- clipboard ------------------------------------------------------------

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Pasted {
    /// Image files to import.
    Files {
        paths: Vec<String>,
    },
    /// A copied image, already stored in the design's media folder.
    Image {
        path: String,
    },
    Text {
        text: String,
    },
    Empty,
}

/// What the system clipboard holds, for pasting into design `id`.
#[tauri::command]
pub async fn clipboard_read(id: String, app: tauri::AppHandle) -> AppResult<Pasted> {
    use tauri::Manager;
    let handle = app.clone();
    let clip =
        tokio::task::spawn_blocking(move || handle.state::<Clipboard>().read()).await.map_err(|e| AppError::msg(e.to_string()))??;
    Ok(match clip {
        Clip::Files { paths } => Pasted::Files { paths },
        Clip::Image(png) => Pasted::Image { path: app.state::<Library>().store_media(&id, "png", &png)? },
        Clip::Text { text } => Pasted::Text { text },
        Clip::Empty => Pasted::Empty,
    })
}

#[tauri::command]
pub fn clipboard_write(text: String, clipboard: State<'_, Clipboard>) -> AppResult<()> {
    clipboard.write_text(&text)
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
pub fn brand_get(workspace_id: String, lib: State<'_, Library>) -> AppResult<Option<String>> {
    lib.brand(&workspace_id)
}

#[tauri::command]
pub fn brand_set(workspace_id: String, json: String, lib: State<'_, Library>) -> AppResult<()> {
    lib.save_brand(&workspace_id, &json)
}

/// Copies a logo (any file the user picked, or `rel` inside the project folder) into the brand kit.
#[tauri::command]
pub fn brand_logo_import(workspace_id: String, path: Option<String>, rel: Option<String>, lib: State<'_, Library>) -> AppResult<String> {
    match (path, rel) {
        (Some(path), None) => lib.import_brand_logo(&workspace_id, &path),
        (None, Some(rel)) => lib.import_brand_logo_from_workspace(&workspace_id, &rel),
        _ => Err(AppError::msg("give either path or rel")),
    }
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

// ---- terminal ---------------------------------------------------------------

use crate::terminal::{TerminalEvent, Terminals};

#[tauri::command]
pub fn terminal_open(
    cwd: String,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
    state: State<'_, Terminals>,
) -> AppResult<String> {
    state.open(&cwd, cols, rows, on_event)
}

#[tauri::command]
pub fn terminal_write(id: String, data: String, state: State<'_, Terminals>) -> AppResult<()> {
    state.write(&id, &data)
}

#[tauri::command]
pub fn terminal_resize(id: String, cols: u16, rows: u16, state: State<'_, Terminals>) -> AppResult<()> {
    state.resize(&id, cols, rows)
}

#[tauri::command]
pub fn terminal_close(id: String, state: State<'_, Terminals>) {
    state.close(&id);
}

// ---- MCP (Claude Code) -------------------------------------------------------

use crate::mcp::{Mcp, McpCall, McpInfo, McpLink};

#[tauri::command]
pub async fn mcp_start(
    tools: serde_json::Value,
    instructions: String,
    on_call: Channel<McpCall>,
    state: State<'_, Mcp>,
) -> AppResult<McpInfo> {
    state.start(tools, instructions, on_call).await
}

#[tauri::command]
pub fn mcp_stop(state: State<'_, Mcp>) {
    state.stop();
}

#[tauri::command]
pub fn mcp_link(state: State<'_, Mcp>) -> McpLink {
    state.link()
}

#[tauri::command]
pub fn mcp_reply(id: u64, result: serde_json::Value, state: State<'_, Mcp>) {
    state.reply(id, result);
}

/// Writes an export that Claude Code asked for (over MCP) to an absolute path.
#[tauri::command]
pub fn export_write(path: String, data: String) -> AppResult<()> {
    use base64::Engine;
    let p = std::path::Path::new(&path);
    let ext = p.extension().and_then(|e| e.to_str()).map(str::to_lowercase).unwrap_or_default();
    if !p.is_absolute() || !["png", "jpg", "jpeg", "pdf", "svg"].contains(&ext.as_str()) {
        return Err(AppError::msg("path must be absolute and end in .png, .jpg, .pdf or .svg"));
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| AppError::msg(e.to_string()))?;
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(p, bytes)?;
    Ok(())
}
