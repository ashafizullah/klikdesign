//! Font families installed on this computer, so text can use them by name
//! (the webview resolves installed fonts itself; nothing is copied).
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SystemFont {
    pub family: String,
    pub weights: Vec<u16>,
    pub italic: bool,
}

static CACHE: OnceLock<Vec<SystemFont>> = OnceLock::new();

/// Installed families, sorted by name; scanned once per session.
pub fn list() -> Vec<SystemFont> {
    CACHE
        .get_or_init(|| {
            let mut db = fontdb::Database::new();
            db.load_system_fonts();
            group(db.faces().filter_map(|f| {
                let family = f.families.first()?.0.clone();
                Some((family, f.weight.0, f.style != fontdb::Style::Normal))
            }))
        })
        .clone()
}

fn group(faces: impl Iterator<Item = (String, u16, bool)>) -> Vec<SystemFont> {
    let mut by_family: BTreeMap<String, (BTreeSet<u16>, bool)> = BTreeMap::new();
    for (family, weight, italic) in faces {
        // Dot-prefixed families are private system UI fonts (macOS ".SF NS").
        if family.is_empty() || family.starts_with('.') {
            continue;
        }
        let entry = by_family.entry(family).or_default();
        entry.0.insert((weight.clamp(100, 900) / 100) * 100);
        entry.1 |= italic;
    }
    let mut out: Vec<SystemFont> = by_family
        .into_iter()
        .map(|(family, (weights, italic))| SystemFont { family, weights: weights.into_iter().collect(), italic })
        .collect();
    out.sort_by_key(|f| f.family.to_lowercase());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_faces_by_family() {
        let faces = [("Avenir", 400, false), ("Avenir", 850, false), ("Avenir", 400, true), (".SF NS", 400, false), ("arial", 400, false)];
        let fonts = group(faces.into_iter().map(|(f, w, i)| (f.to_string(), w, i)));
        assert_eq!(
            fonts,
            vec![
                SystemFont { family: "arial".into(), weights: vec![400], italic: false },
                SystemFont { family: "Avenir".into(), weights: vec![400, 800], italic: true },
            ]
        );
    }

    /// Scans the real machine; run with `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn lists_installed_fonts() {
        let start = std::time::Instant::now();
        let fonts = list();
        println!(
            "{} families in {:?}; first: {:?}",
            fonts.len(),
            start.elapsed(),
            fonts.iter().take(5).map(|f| &f.family).collect::<Vec<_>>()
        );
        assert!(!fonts.is_empty());
    }
}
