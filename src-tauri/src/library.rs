//! App-data storage for designs: `designs/<id>/design.json` plus the images
//! the design uses under `designs/<id>/media`, and each workspace's brand kit
//! under `brands/<workspace id>/` (`brand.json` and copied `logos/`).
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// A linked project folder the AI can research (read-only; nothing is written into it).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: u64,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DesignMeta {
    pub id: String,
    pub name: String,
    pub width: u64,
    pub height: u64,
    pub updated_at: u64,
    /// Bytes on disk: design file plus imported images.
    pub size: u64,
    /// Small PNG data URI saved with the design.
    pub thumb: Option<String>,
    pub workspace_id: Option<String>,
}

const IMAGE_EXTS: [&str; 6] = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

/// Total size of all files under `dir`.
pub fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
    entries
        .flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => dir_size(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

pub struct Library {
    root: PathBuf,
    lock: Mutex<()>,
}

fn now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn valid_id(id: &str) -> AppResult<&str> {
    if !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        Ok(id)
    } else {
        Err(AppError::msg("Invalid id"))
    }
}

fn modified_ms(path: &Path) -> u64 {
    path.metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl Library {
    pub fn new(root: PathBuf) -> Self {
        Self { root, lock: Mutex::new(()) }
    }

    fn workspaces_file(&self) -> PathBuf {
        self.root.join("workspaces.json")
    }

    pub fn workspaces(&self) -> AppResult<Vec<Workspace>> {
        match std::fs::read_to_string(self.workspaces_file()) {
            Ok(s) => Ok(serde_json::from_str(&s)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
            Err(e) => Err(e.into()),
        }
    }

    fn write_workspaces(&self, list: &[Workspace]) -> AppResult<()> {
        std::fs::create_dir_all(&self.root)?;
        write_atomic(&self.workspaces_file(), &serde_json::to_string_pretty(list)?)
    }

    pub fn add_workspace(&self, path: &str, name: Option<String>) -> AppResult<Workspace> {
        let _g = self.lock.lock().unwrap();
        let canon = Path::new(path).canonicalize().map_err(|_| AppError::msg("Folder not found"))?;
        if !canon.is_dir() {
            return Err(AppError::msg("Choose a folder"));
        }
        let path = canon.to_string_lossy().into_owned();
        let mut list = self.workspaces()?;
        if let Some(existing) = list.iter().find(|w| w.path == path) {
            return Ok(existing.clone());
        }
        let ws = Workspace {
            id: format!("ws_{}", &uuid::Uuid::new_v4().simple().to_string()[..10]),
            name: name
                .filter(|n| !n.trim().is_empty())
                .unwrap_or_else(|| canon.file_name().and_then(|n| n.to_str()).unwrap_or("Project").to_string()),
            path,
            created_at: now(),
        };
        list.push(ws.clone());
        self.write_workspaces(&list)?;
        Ok(ws)
    }

    pub fn rename_workspace(&self, id: &str, name: &str) -> AppResult<()> {
        let _g = self.lock.lock().unwrap();
        let mut list = self.workspaces()?;
        let ws = list.iter_mut().find(|w| w.id == id).ok_or_else(|| AppError::msg("Workspace not found"))?;
        ws.name = name.to_string();
        self.write_workspaces(&list)
    }

    /// Unlinks a project folder. Designs made from it are kept; the folder itself is untouched.
    pub fn remove_workspace(&self, id: &str) -> AppResult<()> {
        let _g = self.lock.lock().unwrap();
        let list: Vec<Workspace> = self.workspaces()?.into_iter().filter(|w| w.id != id).collect();
        self.write_workspaces(&list)
    }

    pub fn workspace(&self, id: &str) -> AppResult<Workspace> {
        self.workspaces()?.into_iter().find(|w| w.id == id).ok_or_else(|| AppError::msg("Workspace not found"))
    }

    fn brand_dir(&self, workspace_id: &str) -> AppResult<PathBuf> {
        self.workspace(workspace_id)?;
        Ok(self.root.join("brands").join(valid_id(workspace_id)?))
    }

    /// The workspace's brand kit as JSON, or None when it has none yet.
    pub fn brand(&self, workspace_id: &str) -> AppResult<Option<String>> {
        match std::fs::read_to_string(self.brand_dir(workspace_id)?.join("brand.json")) {
            Ok(s) => Ok(Some(s)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Stores the brand kit; the frontend owns its fields, so any JSON object is accepted.
    pub fn save_brand(&self, workspace_id: &str, json: &str) -> AppResult<()> {
        if json.len() > 256 * 1024 || !serde_json::from_str::<Value>(json)?.is_object() {
            return Err(AppError::msg("Brand kit must be a JSON object under 256 KB"));
        }
        let dir = self.brand_dir(workspace_id)?;
        std::fs::create_dir_all(&dir)?;
        write_atomic(&dir.join("brand.json"), json)
    }

    /// Copies a logo into the brand kit's folder; returns the stored path.
    pub fn import_brand_logo(&self, workspace_id: &str, source: &str) -> AppResult<String> {
        let src = Path::new(source);
        let ext = src.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).unwrap_or_default();
        if !IMAGE_EXTS.contains(&ext.as_str()) {
            return Err(AppError::msg("Not a supported image file"));
        }
        let dir = self.brand_dir(workspace_id)?.join("logos");
        std::fs::create_dir_all(&dir)?;
        let out = dir.join(format!("{}.{ext}", &uuid::Uuid::new_v4().simple().to_string()[..12]));
        std::fs::copy(src, &out)?;
        Ok(out.to_string_lossy().into_owned())
    }

    /// Copies an image from inside the project folder into the brand kit.
    pub fn import_brand_logo_from_workspace(&self, workspace_id: &str, rel: &str) -> AppResult<String> {
        let root = self.workspace(workspace_id)?.path;
        let src = crate::workspace::resolve(&root, rel)?;
        self.import_brand_logo(workspace_id, &src.to_string_lossy())
    }

    /// Copies a workspace image into a design's media folder.
    pub fn import_workspace_image(&self, design_id: &str, workspace_id: &str, rel: &str) -> AppResult<String> {
        let root = self.workspace(workspace_id)?.path;
        let src = crate::workspace::resolve(&root, rel)?;
        self.import_media(design_id, &src.to_string_lossy())
    }

    fn designs_dir(&self) -> PathBuf {
        self.root.join("designs")
    }

    pub fn design_dir(&self, id: &str) -> AppResult<PathBuf> {
        Ok(self.designs_dir().join(valid_id(id)?))
    }

    pub fn designs(&self) -> AppResult<Vec<DesignMeta>> {
        let Ok(entries) = std::fs::read_dir(self.designs_dir()) else { return Ok(vec![]) };
        let mut out = Vec::new();
        for e in entries.flatten() {
            let file = e.path().join("design.json");
            let Ok(text) = std::fs::read_to_string(&file) else { continue };
            let Ok(v) = serde_json::from_str::<Value>(&text) else { continue };
            out.push(DesignMeta {
                id: v["id"].as_str().unwrap_or("").to_string(),
                name: v["name"].as_str().unwrap_or("").to_string(),
                width: v["width"].as_u64().unwrap_or(0),
                height: v["height"].as_u64().unwrap_or(0),
                updated_at: modified_ms(&file),
                size: dir_size(&e.path()),
                thumb: v["thumb"].as_str().map(str::to_string),
                workspace_id: v["workspaceId"].as_str().map(str::to_string),
            });
        }
        out.sort_by_key(|d| std::cmp::Reverse(d.updated_at));
        Ok(out)
    }

    pub fn save_design(&self, id: &str, json: &str) -> AppResult<()> {
        let dir = self.design_dir(id)?;
        std::fs::create_dir_all(&dir)?;
        write_atomic(&dir.join("design.json"), json)
    }

    pub fn load_design(&self, id: &str) -> AppResult<String> {
        Ok(std::fs::read_to_string(self.design_dir(id)?.join("design.json"))?)
    }

    pub fn delete_design(&self, id: &str) -> AppResult<()> {
        let dir = self.design_dir(id)?;
        if dir.exists() {
            std::fs::remove_dir_all(dir)?;
        }
        Ok(())
    }

    pub fn import_media(&self, id: &str, source: &str) -> AppResult<String> {
        let src = Path::new(source);
        let ext = src.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).unwrap_or_default();
        if !IMAGE_EXTS.contains(&ext.as_str()) {
            return Err(AppError::msg("Not a supported image file"));
        }
        let out = self.new_media_path(id, &ext)?;
        std::fs::copy(src, &out)?;
        Ok(out.to_string_lossy().into_owned())
    }

    /// Images stored with the design (uploaded, dropped or copied from a project folder), newest first.
    pub fn list_media(&self, id: &str) -> AppResult<Vec<String>> {
        let Ok(entries) = std::fs::read_dir(self.design_dir(id)?.join("media")) else { return Ok(vec![]) };
        let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|e| e.to_str()).is_some_and(|e| IMAGE_EXTS.contains(&e.to_ascii_lowercase().as_str())))
            .map(|p| (p.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), p))
            .collect();
        files.sort_by_key(|f| std::cmp::Reverse(f.0));
        Ok(files.into_iter().map(|(_, p)| p.to_string_lossy().into_owned()).collect())
    }

    fn new_media_path(&self, id: &str, ext: &str) -> AppResult<PathBuf> {
        let dir = self.design_dir(id)?.join("media");
        std::fs::create_dir_all(&dir)?;
        Ok(dir.join(format!("{}.{ext}", &uuid::Uuid::new_v4().simple().to_string()[..12])))
    }
}

fn write_atomic(path: &Path, contents: &str) -> AppResult<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, contents)?;
    std::fs::rename(tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn design_roundtrip_and_media() {
        let root = std::env::temp_dir().join(format!("klikdesign-lib-{}", uuid::Uuid::new_v4().simple()));
        let lib = Library::new(root.clone());
        lib.save_design("dsn_1", r#"{"id":"dsn_1","name":"Poster","width":1080,"height":1350,"thumb":"data:x"}"#).unwrap();
        let list = lib.designs().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].width, 1080);
        assert_eq!(list[0].thumb.as_deref(), Some("data:x"));
        assert!(lib.design_dir("../x").is_err());

        let img = root.join("a.PNG");
        std::fs::write(&img, b"png").unwrap();
        let stored = lib.import_media("dsn_1", img.to_str().unwrap()).unwrap();
        assert!(stored.ends_with(".png") && Path::new(&stored).is_file());
        let txt = root.join("a.txt");
        std::fs::write(&txt, b"x").unwrap();
        assert!(lib.import_media("dsn_1", txt.to_str().unwrap()).is_err());
        assert_eq!(lib.list_media("dsn_1").unwrap(), vec![stored.clone()]);
        assert!(lib.list_media("dsn_none").unwrap().is_empty());

        let ws = lib.add_workspace(root.to_str().unwrap(), None).unwrap();
        assert_eq!(lib.add_workspace(root.to_str().unwrap(), None).unwrap().id, ws.id);
        assert!(lib.import_workspace_image("dsn_1", &ws.id, "a.PNG").unwrap().ends_with(".png"));
        assert!(lib.import_workspace_image("dsn_1", &ws.id, "../x.png").is_err());
        assert_eq!(lib.brand(&ws.id).unwrap(), None);
        lib.save_brand(&ws.id, r##"{"colors":["#111"]}"##).unwrap();
        assert_eq!(lib.brand(&ws.id).unwrap().as_deref(), Some(r##"{"colors":["#111"]}"##));
        assert!(lib.save_brand(&ws.id, "[1]").is_err());
        assert!(lib.save_brand("ws_missing", "{}").is_err());
        let logo = lib.import_brand_logo_from_workspace(&ws.id, "a.PNG").unwrap();
        assert!(logo.contains("brands") && Path::new(&logo).is_file());
        assert!(lib.import_brand_logo(&ws.id, txt.to_str().unwrap()).is_err());
        lib.remove_workspace(&ws.id).unwrap();
        assert!(lib.workspaces().unwrap().is_empty());

        lib.delete_design("dsn_1").unwrap();
        assert!(lib.designs().unwrap().is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }
}
