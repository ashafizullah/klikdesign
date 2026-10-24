//! The macOS menu bar. Tauri's default Edit menu sends Undo/Redo (⌘Z, ⇧⌘Z)
//! to the webview's own text undo, which knows nothing about design edits;
//! here they are app items the editor handles (see "menu-edit" in the webview).
use tauri::menu::{Menu, MenuItem};
use tauri::{AppHandle, Runtime};

pub const UNDO: &str = "undo";
pub const REDO: &str = "redo";

/// The default menu with Edit's Undo and Redo replaced.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    for item in menu.items()? {
        let Some(edit) = item.as_submenu() else { continue };
        if edit.text()? != "Edit" {
            continue;
        }
        // Undo and Redo are its first two items.
        edit.remove_at(0)?;
        edit.remove_at(0)?;
        edit.insert(&MenuItem::with_id(app, UNDO, "Undo", true, Some("CmdOrCtrl+Z"))?, 0)?;
        edit.insert(&MenuItem::with_id(app, REDO, "Redo", true, Some("Shift+CmdOrCtrl+Z"))?, 1)?;
    }
    Ok(menu)
}
