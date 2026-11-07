//! Clipboard history (text), paste into the previous app, and reading the selected text via a synthetic Ctrl+C.
//! Copies that password managers mark with `ExcludeClipboardContentFromMonitorProcessing` are never recorded.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use windows::core::w;
use windows::Win32::System::DataExchange::{GetClipboardSequenceNumber, IsClipboardFormatAvailable, RegisterClipboardFormatW};

use crate::{store, win32};

const STORE: &str = "clipboard";
const MAX_ENTRIES: usize = 1000;
const MAX_TEXT: usize = 200_000;

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClipEntry {
    pub id: String,
    pub text: String,
    pub first_copied: u64,
    pub last_copied: u64,
    pub count: u32,
    #[serde(default)]
    pub pinned: bool,
}

static HISTORY: Mutex<Vec<ClipEntry>> = Mutex::new(Vec::new());
static PAUSED: AtomicBool = AtomicBool::new(false);
/// Set while Işın itself borrows the clipboard (reading the selection) so the borrowed text isn't recorded.
static SUPPRESS: AtomicBool = AtomicBool::new(false);

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn save(history: &[ClipEntry]) {
    if let Ok(json) = serde_json::to_string(history) {
        let _ = store::write(STORE, &json);
    }
}

fn load() {
    if let Some(json) = store::read(STORE) {
        if let Ok(list) = serde_json::from_str::<Vec<ClipEntry>>(&json) {
            *HISTORY.lock().unwrap() = list;
        }
    }
}

fn is_excluded() -> bool {
    unsafe {
        let exclude = RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
        exclude != 0 && IsClipboardFormatAvailable(exclude).is_ok()
    }
}

fn record(text: String) -> bool {
    if text.trim().is_empty() || text.len() > MAX_TEXT {
        return false;
    }
    let now = now_ms();
    let mut history = HISTORY.lock().unwrap();
    if let Some(index) = history.iter().position(|e| e.text == text) {
        let mut entry = history.remove(index);
        entry.last_copied = now;
        entry.count += 1;
        history.insert(0, entry);
    } else {
        let id = format!("{now:x}-{}", history.len());
        history.insert(
            0,
            ClipEntry { id, text, first_copied: now, last_copied: now, count: 1, pinned: false },
        );
        // Drop the oldest unpinned entries past the limit.
        while history.len() > MAX_ENTRIES {
            if let Some(i) = history.iter().rposition(|e| !e.pinned) {
                history.remove(i);
            } else {
                break;
            }
        }
    }
    save(&history);
    true
}

pub fn start_monitor(app: AppHandle) {
    load();
    std::thread::spawn(move || {
        let mut clipboard = arboard::Clipboard::new().ok();
        let mut last_sequence = unsafe { GetClipboardSequenceNumber() };
        loop {
            std::thread::sleep(Duration::from_millis(400));
            let sequence = unsafe { GetClipboardSequenceNumber() };
            if sequence == last_sequence {
                continue;
            }
            last_sequence = sequence;
            if PAUSED.load(Ordering::SeqCst) || SUPPRESS.load(Ordering::SeqCst) || is_excluded() {
                continue;
            }
            if clipboard.is_none() {
                clipboard = arboard::Clipboard::new().ok();
            }
            let Some(cb) = clipboard.as_mut() else { continue };
            if let Ok(text) = cb.get_text() {
                if record(text) {
                    let _ = app.emit("clipboard-changed", ());
                }
            }
        }
    });
}

#[tauri::command]
pub fn clipboard_history() -> Vec<ClipEntry> {
    HISTORY.lock().unwrap().clone()
}

#[tauri::command]
pub fn clipboard_delete(id: String) {
    let mut history = HISTORY.lock().unwrap();
    history.retain(|e| e.id != id);
    save(&history);
}

#[tauri::command]
pub fn clipboard_clear() {
    let mut history = HISTORY.lock().unwrap();
    history.retain(|e| e.pinned);
    save(&history);
}

#[tauri::command]
pub fn clipboard_pin(id: String, pinned: bool) {
    let mut history = HISTORY.lock().unwrap();
    if let Some(entry) = history.iter_mut().find(|e| e.id == id) {
        entry.pinned = pinned;
    }
    save(&history);
}

#[tauri::command]
pub fn clipboard_set_paused(paused: bool) {
    PAUSED.store(paused, Ordering::SeqCst);
}

#[tauri::command]
pub fn copy_text(text: String) -> Result<(), String> {
    arboard::Clipboard::new().and_then(|mut c| c.set_text(text)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_clipboard_text() -> Option<String> {
    arboard::Clipboard::new().ok()?.get_text().ok()
}

fn hide_launcher(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("launcher") {
        let _ = window.hide();
    }
}

/// Puts `text` on the clipboard, returns to the previous window and presses Ctrl+V, then ← `cursor_back` times
/// (snippets' `{cursor}`).
#[tauri::command]
pub async fn paste_text(app: AppHandle, text: String, cursor_back: Option<u32>) -> Result<(), String> {
    copy_text(text)?;
    hide_launcher(&app);
    tauri::async_runtime::spawn_blocking(move || {
        win32::focus_previous();
        std::thread::sleep(Duration::from_millis(120));
        win32::send_chord(&[win32::VK_CONTROL, 0x56]);
        if let Some(n) = cursor_back.filter(|n| *n > 0) {
            std::thread::sleep(Duration::from_millis(60));
            win32::tap(win32::VK_LEFT, n);
        }
    })
    .await
    .map_err(|e| e.to_string())
}

/// Text selected in the previous window: hides the launcher, presses Ctrl+C there, reads the clipboard and
/// restores what was on it. The launcher is shown again by the caller.
#[tauri::command]
pub async fn get_selected_text(app: AppHandle) -> Result<Option<String>, String> {
    hide_launcher(&app);
    let result = tauri::async_runtime::spawn_blocking(move || {
        SUPPRESS.store(true, Ordering::SeqCst);
        let mut clipboard = arboard::Clipboard::new().ok();
        let saved = clipboard.as_mut().and_then(|c| c.get_text().ok());
        let before = unsafe { GetClipboardSequenceNumber() };
        win32::focus_previous();
        std::thread::sleep(Duration::from_millis(120));
        win32::send_chord(&[win32::VK_CONTROL, 0x43]);
        let mut selected = None;
        for _ in 0..12 {
            std::thread::sleep(Duration::from_millis(40));
            if unsafe { GetClipboardSequenceNumber() } != before {
                std::thread::sleep(Duration::from_millis(30));
                selected = clipboard.as_mut().and_then(|c| c.get_text().ok());
                break;
            }
        }
        if selected.is_some() {
            if let (Some(cb), Some(saved)) = (clipboard.as_mut(), saved) {
                let _ = cb.set_text(saved);
            }
        }
        // Let the monitor see (and skip) both clipboard changes before recording again.
        std::thread::spawn(|| {
            std::thread::sleep(Duration::from_millis(900));
            SUPPRESS.store(false, Ordering::SeqCst);
        });
        selected.filter(|s| !s.trim().is_empty())
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Some(window) = app.get_webview_window("launcher") {
        crate::show_launcher_window(&app, &window, false);
    }
    Ok(result)
}
