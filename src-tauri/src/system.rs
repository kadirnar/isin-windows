//! System commands (Windows counterparts of Işın's System Actions) and shell helpers.

use std::os::windows::process::CommandExt;
use std::process::Command;
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::win32;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn run(program: &str, args: &[&str]) -> Result<(), String> {
    Command::new(program)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("{program}: {e}"))
}

fn powershell(script: &str) -> Result<(), String> {
    run("powershell.exe", &["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script])
}

fn reg_dword(key: &str, value: &str) -> Option<u32> {
    let output = Command::new("reg").args(["query", key, "/v", value]).creation_flags(CREATE_NO_WINDOW).output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let hex = text.split_whitespace().find(|t| t.starts_with("0x"))?;
    u32::from_str_radix(hex.trim_start_matches("0x"), 16).ok()
}

const PERSONALIZE: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";

fn set_dark_mode(dark: bool) -> Result<(), String> {
    let value = if dark { "0" } else { "1" };
    for name in ["AppsUseLightTheme", "SystemUsesLightTheme"] {
        Command::new("reg")
            .args(["add", PERSONALIZE, "/v", name, "/t", "REG_DWORD", "/d", value, "/f"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Virtual-key codes for media keys.
const VK_VOLUME_MUTE: u16 = 0xAD;
const VK_VOLUME_DOWN: u16 = 0xAE;
const VK_VOLUME_UP: u16 = 0xAF;
const VK_MEDIA_NEXT: u16 = 0xB0;
const VK_MEDIA_PREV: u16 = 0xB1;
const VK_MEDIA_PLAY_PAUSE: u16 = 0xB3;
const VK_OEM_PERIOD: u16 = 0xBE;
const VK_D: u16 = 0x44;
const VK_V: u16 = 0x56;

fn hide_launcher(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("launcher") {
        let _ = w.hide();
    }
}

/// Runs a system command by id. Destructive ones (shutdown, restart, sign out, empty recycle bin) are
/// confirmed in the UI before this is called.
#[tauri::command]
pub async fn run_system(app: AppHandle, id: String) -> Result<Option<String>, String> {
    let message = match id.as_str() {
        "lock" => run("rundll32.exe", &["user32.dll,LockWorkStation"]).map(|_| None),
        "sleep" => powershell(
            "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)",
        )
        .map(|_| None),
        "hibernate" => run("shutdown.exe", &["/h"]).map(|_| None),
        "shutdown" => run("shutdown.exe", &["/s", "/t", "0"]).map(|_| None),
        "restart" => run("shutdown.exe", &["/r", "/t", "0"]).map(|_| None),
        "sign-out" => run("shutdown.exe", &["/l"]).map(|_| None),
        "empty-recycle-bin" => powershell("Clear-RecycleBin -Force -ErrorAction SilentlyContinue")
            .map(|_| Some("Recycle Bin emptied".to_string())),
        "toggle-dark-mode" => {
            let light = reg_dword(PERSONALIZE, "AppsUseLightTheme").unwrap_or(1) == 1;
            set_dark_mode(light).map(|_| Some(if light { "Dark mode on" } else { "Light mode on" }.to_string()))
        }
        "volume-mute" | "volume-up" | "volume-down" | "media-play-pause" | "media-next" | "media-previous" => {
            let vk = match id.as_str() {
                "volume-mute" => VK_VOLUME_MUTE,
                "volume-up" => VK_VOLUME_UP,
                "volume-down" => VK_VOLUME_DOWN,
                "media-play-pause" => VK_MEDIA_PLAY_PAUSE,
                "media-next" => VK_MEDIA_NEXT,
                _ => VK_MEDIA_PREV,
            };
            let times = if id.starts_with("volume-up") || id.starts_with("volume-down") { 5 } else { 1 };
            win32::tap(vk, times);
            Ok(None)
        }
        "show-desktop" | "emoji-panel" | "clipboard-panel" => {
            hide_launcher(&app);
            let id2 = id.clone();
            tauri::async_runtime::spawn_blocking(move || {
                std::thread::sleep(Duration::from_millis(150));
                match id2.as_str() {
                    "show-desktop" => win32::send_chord(&[win32::VK_LWIN, VK_D]),
                    "emoji-panel" => {
                        win32::focus_previous();
                        std::thread::sleep(Duration::from_millis(120));
                        win32::send_chord(&[win32::VK_LWIN, VK_OEM_PERIOD]);
                    }
                    _ => {
                        win32::focus_previous();
                        std::thread::sleep(Duration::from_millis(120));
                        win32::send_chord(&[win32::VK_LWIN, VK_V]);
                    }
                }
            })
            .await
            .map_err(|e| e.to_string())?;
            Ok(None)
        }
        "task-manager" => run("taskmgr.exe", &[]).map(|_| None),
        "file-explorer" => run("explorer.exe", &[]).map(|_| None),
        "control-panel" => run("control.exe", &[]).map(|_| None),
        "screen-snip" => win32::shell_execute("ms-screenclip:", None, "open").map(|_| None),
        other => Err(format!("Unknown system command: {other}")),
    }?;
    Ok(message)
}

/// Opens a file, folder, URL, shortcut or shell URI. `admin` asks for elevation (UAC prompt).
#[tauri::command]
pub fn shell_open(target: String, admin: Option<bool>) -> Result<(), String> {
    let verb = if admin.unwrap_or(false) { "runas" } else { "open" };
    win32::shell_execute(&target, None, verb)
}

#[tauri::command]
pub fn show_in_explorer(path: String) -> Result<(), String> {
    Command::new("explorer.exe").raw_arg(format!("/select,\"{path}\"")).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_layout(layout: String) -> Result<(), String> {
    win32::apply_layout(&layout)
}

/// Runs a user command line (Run Command in the launcher) in a new console window.
#[tauri::command]
pub fn run_command_line(command: String) -> Result<(), String> {
    Command::new("cmd.exe").raw_arg(format!("/K {command}")).spawn().map(|_| ()).map_err(|e| e.to_string())
}
