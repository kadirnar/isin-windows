//! Plain JSON files under the data directory (`%APPDATA%\Isin`, or `ISIN_DATA_DIR` for tests).
//! The frontend owns the shape of each store; Rust only reads and writes whole files atomically.

use std::fs;
use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("ISIN_DATA_DIR") {
        if !dir.is_empty() {
            let path = PathBuf::from(dir);
            let _ = fs::create_dir_all(&path);
            return path;
        }
    }
    let base = std::env::var("APPDATA").map(PathBuf::from).unwrap_or_else(|_| std::env::temp_dir());
    let path = base.join("Isin");
    let _ = fs::create_dir_all(&path);
    path
}

/// Cache files that can be rebuilt (app icons).
pub fn cache_dir() -> PathBuf {
    let path = data_dir().join("cache");
    let _ = fs::create_dir_all(&path);
    path
}

fn valid_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn read(name: &str) -> Option<String> {
    if !valid_name(name) {
        return None;
    }
    fs::read_to_string(data_dir().join(format!("{name}.json"))).ok()
}

pub fn write(name: &str, content: &str) -> Result<(), String> {
    if !valid_name(name) {
        return Err(format!("invalid store name: {name}"));
    }
    let dir = data_dir();
    let target = dir.join(format!("{name}.json"));
    let temp = dir.join(format!(".{name}.json.tmp"));
    fs::write(&temp, content).map_err(|e| e.to_string())?;
    fs::rename(&temp, &target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_store(name: String) -> Option<String> {
    read(&name)
}

#[tauri::command]
pub fn write_store(name: String, content: String) -> Result<(), String> {
    write(&name, &content)
}

#[tauri::command]
pub fn data_dir_path() -> String {
    data_dir().to_string_lossy().into_owned()
}
