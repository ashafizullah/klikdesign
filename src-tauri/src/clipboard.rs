//! The system clipboard, for pasting images (screenshots, images copied in a
//! browser or files copied in the Finder/Explorer) and text into a design.
//! Copying elements writes their text here, so the clipboard always reflects
//! the latest copy, inside the app or out of it.
use crate::error::{AppError, AppResult};
use crate::library::IMAGE_EXTS;
use std::sync::Mutex;

#[derive(Debug, PartialEq)]
pub enum Clip {
    /// Image files copied in a file manager.
    Files {
        paths: Vec<String>,
    },
    /// Image pixels, encoded as PNG.
    Image(Vec<u8>),
    Text {
        text: String,
    },
    Empty,
}

/// One clipboard handle for the app: on Linux the copied text is served only while it is alive.
#[derive(Default)]
pub struct Clipboard(Mutex<Option<arboard::Clipboard>>);

impl Clipboard {
    fn with<T>(&self, f: impl FnOnce(&mut arboard::Clipboard) -> T) -> AppResult<T> {
        let mut guard = self.0.lock().map_err(|_| AppError::msg("Clipboard is busy"))?;
        if guard.is_none() {
            *guard = Some(arboard::Clipboard::new().map_err(|e| AppError::msg(format!("Clipboard unavailable: {e}")))?);
        }
        Ok(f(guard.as_mut().expect("set above")))
    }

    pub fn read(&self) -> AppResult<Clip> {
        self.with(|cb| {
            // A copied file comes with its icon as an image, so files are checked first.
            if let Ok(files) = cb.get().file_list()
                && !files.is_empty()
            {
                return Ok(image_files(files.iter().map(|p| p.to_string_lossy().into_owned())));
            }
            if let Ok(img) = cb.get().image() {
                return encode_png(img.width as u32, img.height as u32, img.bytes.into_owned()).map(Clip::Image);
            }
            match cb.get().text() {
                Ok(text) if !text.trim().is_empty() => Ok(Clip::Text { text }),
                _ => Ok(Clip::Empty),
            }
        })?
    }

    /// Replaces the clipboard with `text`, or clears it when `text` is empty.
    pub fn write_text(&self, text: &str) -> AppResult<()> {
        self.with(|cb| if text.is_empty() { cb.clear() } else { cb.set_text(text) })?
            .map_err(|e| AppError::msg(format!("Could not write the clipboard: {e}")))
    }
}

/// The image files among `paths`; other files paste nothing.
fn image_files(paths: impl Iterator<Item = String>) -> Clip {
    let images: Vec<String> = paths
        .filter(|p| {
            let ext = p.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
            IMAGE_EXTS.contains(&ext.as_str())
        })
        .collect();
    if images.is_empty() { Clip::Empty } else { Clip::Files { paths: images } }
}

fn encode_png(width: u32, height: u32, rgba: Vec<u8>) -> AppResult<Vec<u8>> {
    let img = image::RgbaImage::from_raw(width, height, rgba).ok_or_else(|| AppError::msg("The copied image is malformed"))?;
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Png).map_err(|e| AppError::msg(format!("Could not encode the image: {e}")))?;
    Ok(out.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_image_files_paste() {
        let paths = ["/a/photo.JPG", "/a/notes.txt", "/a/logo.svg"].map(String::from);
        assert_eq!(image_files(paths.into_iter()), Clip::Files { paths: vec!["/a/photo.JPG".into(), "/a/logo.svg".into()] });
        assert_eq!(image_files(["/a/notes.txt".to_string()].into_iter()), Clip::Empty);
    }

    #[test]
    fn encodes_rgba_as_png() {
        let png = encode_png(2, 1, vec![255, 0, 0, 255, 0, 0, 255, 128]).unwrap();
        assert_eq!(&png[1..4], b"PNG");
        assert!(encode_png(2, 2, vec![0; 4]).is_err());
    }
}
