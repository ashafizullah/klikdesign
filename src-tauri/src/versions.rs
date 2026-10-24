//! Version history of a design: snapshots under `designs/<id>/versions/`, one
//! `<version>.json` (the design) and `<version>.meta.json` (label, kind,
//! thumbnail) each. Automatic snapshots are pruned past a limit; versions the
//! user saved by hand are kept longer.
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Automatic snapshots kept per design (on open, before AI edits, while editing, before a restore).
const AUTO_LIMIT: usize = 40;
/// Versions saved by hand kept per design.
const MANUAL_LIMIT: usize = 100;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VersionMeta {
    #[serde(default)]
    pub id: String,
    /// Milliseconds since the epoch.
    #[serde(default)]
    pub at: u64,
    pub label: String,
    /// "manual" for versions the user saved; anything else is automatic.
    pub kind: String,
    /// Hash of the design JSON, to skip saving the same state twice.
    pub hash: String,
    #[serde(default)]
    pub pages: u64,
    pub thumb: Option<String>,
}

fn valid_version(id: &str) -> AppResult<&str> {
    if id.len() > 1 && id.len() <= 32 && id.starts_with('v') && id[1..].chars().all(|c| c.is_ascii_digit()) {
        Ok(id)
    } else {
        Err(AppError::msg("Invalid version id"))
    }
}

/// Stores a snapshot made at `at` (ms) and prunes old automatic ones; returns its metadata.
pub fn save(dir: &Path, mut meta: VersionMeta, design: &str, at: u64) -> AppResult<VersionMeta> {
    if design.len() > 20 * 1024 * 1024 || meta.thumb.as_ref().is_some_and(|t| t.len() > 512 * 1024) {
        return Err(AppError::msg("Version is too large"));
    }
    serde_json::from_str::<serde_json::Value>(design)?;
    std::fs::create_dir_all(dir)?;
    // Two snapshots in the same millisecond get consecutive ids.
    let mut at = at;
    while dir.join(format!("v{at}.json")).exists() {
        at += 1;
    }
    meta.id = format!("v{at}");
    meta.at = at;
    meta.label = meta.label.chars().take(120).collect();
    std::fs::write(dir.join(format!("{}.json", meta.id)), design)?;
    std::fs::write(dir.join(format!("{}.meta.json", meta.id)), serde_json::to_string(&meta)?)?;
    prune(dir)?;
    Ok(meta)
}

/// Versions, newest first.
pub fn list(dir: &Path) -> AppResult<Vec<VersionMeta>> {
    let Ok(entries) = std::fs::read_dir(dir) else { return Ok(vec![]) };
    let mut out: Vec<VersionMeta> = entries
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().ends_with(".meta.json"))
        .filter_map(|e| serde_json::from_str(&std::fs::read_to_string(e.path()).ok()?).ok())
        .collect();
    out.sort_by_key(|m| std::cmp::Reverse(m.at));
    Ok(out)
}

pub fn load(dir: &Path, id: &str) -> AppResult<String> {
    Ok(std::fs::read_to_string(dir.join(format!("{}.json", valid_version(id)?)))?)
}

pub fn delete(dir: &Path, id: &str) -> AppResult<()> {
    let id = valid_version(id)?;
    for file in [format!("{id}.json"), format!("{id}.meta.json")] {
        match std::fs::remove_file(dir.join(file)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.into()),
            _ => {}
        }
    }
    Ok(())
}

fn prune(dir: &Path) -> AppResult<()> {
    let all = list(dir)?;
    let (manual, auto): (Vec<_>, Vec<_>) = all.iter().partition(|m| m.kind == "manual");
    for m in auto.iter().skip(AUTO_LIMIT).chain(manual.iter().skip(MANUAL_LIMIT)) {
        delete(dir, &m.id)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(kind: &str) -> VersionMeta {
        VersionMeta { id: String::new(), at: 0, label: "x".into(), kind: kind.into(), hash: "h".into(), pages: 1, thumb: None }
    }

    #[test]
    fn save_list_load_delete_and_prune() {
        let dir = std::env::temp_dir().join(format!("klikdesign-ver-{}", uuid::Uuid::new_v4().simple()));
        let a = save(&dir, meta("manual"), r#"{"id":"d"}"#, 1000).unwrap();
        let b = save(&dir, meta("auto"), r#"{"id":"d","n":2}"#, 1000).unwrap();
        assert_eq!((a.id.as_str(), b.id.as_str()), ("v1000", "v1001"));
        assert_eq!(list(&dir).unwrap().iter().map(|m| m.id.as_str()).collect::<Vec<_>>(), ["v1001", "v1000"]);
        assert_eq!(load(&dir, "v1001").unwrap(), r#"{"id":"d","n":2}"#);
        assert!(load(&dir, "../design").is_err());
        assert!(save(&dir, meta("auto"), "not json", 5).is_err());

        for i in 0..AUTO_LIMIT as u64 + 5 {
            save(&dir, meta("ai"), "{}", 2000 + i).unwrap();
        }
        let all = list(&dir).unwrap();
        assert_eq!(all.iter().filter(|m| m.kind != "manual").count(), AUTO_LIMIT);
        assert!(all.iter().any(|m| m.id == "v1000"), "versions saved by hand survive pruning");

        delete(&dir, "v1000").unwrap();
        assert!(load(&dir, "v1000").is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
