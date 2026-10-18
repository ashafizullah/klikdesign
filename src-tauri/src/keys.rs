//! API keys live in the OS keychain, one entry per AI profile; they never
//! travel to the webview.
//!
//! macOS asks the user before each keychain read by a binary it hasn't been
//! told to trust (every dev rebuild is a new binary), so reads are kept rare:
//! - which profiles have a key is tracked in a plain index file (no secrets),
//!   so listing key status never touches the keychain;
//! - a key read once is cached in memory for the rest of the session.
use crate::error::{AppError, AppResult};
use keyring::Entry;
use std::collections::{BTreeSet, HashMap};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const SERVICE: &str = "com.ashafizullah.klikdesign";

static INDEX_PATH: OnceLock<PathBuf> = OnceLock::new();
static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    CACHE.get_or_init(Default::default)
}

/// Sets where the key index is stored (the app data directory).
pub fn init(app_data: PathBuf) {
    let _ = INDEX_PATH.set(app_data.join("key-index.json"));
}

fn read_index() -> Option<BTreeSet<String>> {
    let text = std::fs::read_to_string(INDEX_PATH.get()?).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_index(ids: &BTreeSet<String>) -> AppResult<()> {
    let Some(path) = INDEX_PATH.get() else { return Ok(()) };
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(path, serde_json::to_string(ids)?)?;
    Ok(())
}

fn validate(profile_id: &str) -> AppResult<()> {
    let valid =
        !profile_id.is_empty() && profile_id.len() <= 64 && profile_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if valid { Ok(()) } else { Err(AppError::msg("Invalid profile id")) }
}

fn entry(profile_id: &str) -> AppResult<Entry> {
    validate(profile_id)?;
    Ok(Entry::new(SERVICE, &format!("profile:{profile_id}"))?)
}

fn read_keychain(profile_id: &str) -> AppResult<Option<String>> {
    match entry(profile_id)?.get_password() {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn get(profile_id: &str) -> AppResult<Option<String>> {
    validate(profile_id)?;
    if let Some(hit) = cache().lock().unwrap().get(profile_id) {
        return Ok(hit.clone());
    }
    // A profile the index says has no key needs no keychain prompt.
    if read_index().is_some_and(|ids| !ids.contains(profile_id)) {
        return Ok(None);
    }
    let key = read_keychain(profile_id)?;
    cache().lock().unwrap().insert(profile_id.to_string(), key.clone());
    Ok(key)
}

pub fn require(profile_id: &str) -> AppResult<String> {
    get(profile_id)?.ok_or_else(|| AppError::msg("This profile has no API key yet (AI Settings)"))
}

/// Which of `ids` have a stored key, without reading any secret.
pub fn status(ids: &[String]) -> AppResult<HashMap<String, bool>> {
    let index = match read_index() {
        Some(index) => index,
        None => {
            // First run with the index: probe once, then remember the answer.
            let mut found = BTreeSet::new();
            for id in ids {
                if get(id)?.is_some() {
                    found.insert(id.clone());
                }
            }
            write_index(&found)?;
            found
        }
    };
    Ok(ids.iter().map(|id| (id.clone(), index.contains(id))).collect())
}

pub fn set(profile_id: &str, key: &str) -> AppResult<()> {
    let key = key.trim();
    if key.is_empty() {
        return delete(profile_id);
    }
    entry(profile_id)?.set_password(key)?;
    cache().lock().unwrap().insert(profile_id.to_string(), Some(key.to_string()));
    let mut index = read_index().unwrap_or_default();
    index.insert(profile_id.to_string());
    write_index(&index)
}

pub fn delete(profile_id: &str) -> AppResult<()> {
    match entry(profile_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(e.into()),
    }
    cache().lock().unwrap().insert(profile_id.to_string(), None);
    let mut index = read_index().unwrap_or_default();
    index.remove(profile_id);
    write_index(&index)
}
