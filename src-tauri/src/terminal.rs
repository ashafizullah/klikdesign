//! Interactive terminal sessions (a PTY running the user's login shell) for
//! the in-app terminal panel. The app only relays keystrokes and output; it
//! never drives what runs inside.
use crate::error::{AppError, AppResult};
use base64::Engine;
use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::ipc::Channel;

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TerminalEvent {
    /// Raw output bytes, base64-encoded.
    Data {
        data: String,
    },
    Exit {
        code: Option<u32>,
    },
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct Terminals(Mutex<HashMap<String, Session>>);

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 }
}

fn shell() -> CommandBuilder {
    if cfg!(windows) {
        return CommandBuilder::new(std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".into()));
    }
    let default = if cfg!(target_os = "macos") { "/bin/zsh" } else { "/bin/bash" };
    let mut cmd = CommandBuilder::new(std::env::var("SHELL").unwrap_or_else(|_| default.into()));
    // Login shell: GUI apps on macOS don't inherit the user's PATH.
    cmd.arg("-l");
    cmd
}

impl Terminals {
    pub fn open(&self, cwd: &str, cols: u16, rows: u16, on_event: Channel<TerminalEvent>) -> AppResult<String> {
        let pair = native_pty_system().openpty(size(cols, rows)).map_err(|e| AppError::msg(e.to_string()))?;
        let mut cmd = shell();
        if std::path::Path::new(cwd).is_dir() {
            cmd.cwd(cwd);
        } else if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
            cmd.cwd(home);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        if std::env::var_os("LANG").is_none() {
            cmd.env("LANG", "en_US.UTF-8");
        }
        let mut child = pair.slave.spawn_command(cmd).map_err(|e| AppError::msg(e.to_string()))?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(|e| AppError::msg(e.to_string()))?;
        let writer = pair.master.take_writer().map_err(|e| AppError::msg(e.to_string()))?;
        let killer = child.clone_killer();

        std::thread::spawn(move || {
            let mut buf = [0u8; 16 * 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let data = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                        if on_event.send(TerminalEvent::Data { data }).is_err() {
                            break;
                        }
                    }
                }
            }
            let code = child.wait().ok().map(|s| s.exit_code());
            let _ = on_event.send(TerminalEvent::Exit { code });
        });

        let id = uuid::Uuid::new_v4().to_string();
        self.0.lock().unwrap().insert(id.clone(), Session { master: pair.master, writer, killer });
        Ok(id)
    }

    pub fn write(&self, id: &str, data: &str) -> AppResult<()> {
        let mut map = self.0.lock().unwrap();
        let s = map.get_mut(id).ok_or_else(|| AppError::msg("Terminal session has ended"))?;
        s.writer.write_all(data.as_bytes())?;
        s.writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> AppResult<()> {
        if let Some(s) = self.0.lock().unwrap().get(id) {
            s.master.resize(size(cols, rows)).map_err(|e| AppError::msg(e.to_string()))?;
        }
        Ok(())
    }

    pub fn close(&self, id: &str) {
        if let Some(mut s) = self.0.lock().unwrap().remove(id) {
            let _ = s.killer.kill();
        }
    }
}

impl Drop for Terminals {
    fn drop(&mut self) {
        for (_, mut s) in self.0.lock().unwrap().drain() {
            let _ = s.killer.kill();
        }
    }
}
