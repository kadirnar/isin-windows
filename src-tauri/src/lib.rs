//! Işın for Windows: a keyboard launcher. Rust owns the OS side (global hotkey, launcher window, tray, apps,
//! clipboard, system and window commands); the web UI owns search, screens, settings and AI.

mod apps;
mod clipboard;
mod store;
mod system;
mod win32;

use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const DEFAULT_HOTKEY: &str = "Alt+Space";
static HOTKEY: Mutex<Option<String>> = Mutex::new(None);

fn hwnd_of(window: &WebviewWindow) -> Option<isize> {
    window.hwnd().ok().map(|h| h.0 as isize)
}

/// Shows the launcher centered on the monitor under the mouse, a fifth of the way down.
pub fn show_launcher_window(app: &AppHandle, window: &WebviewWindow, remember: bool) {
    if remember {
        win32::remember_foreground(hwnd_of(window));
    }
    if let Ok(cursor) = app.cursor_position() {
        if let Ok(Some(monitor)) = app.monitor_from_point(cursor.x, cursor.y) {
            let area = monitor.work_area();
            if let Ok(size) = window.outer_size() {
                let x = area.position.x + (area.size.width as i32 - size.width as i32) / 2;
                let y = area.position.y + (area.size.height as f64 * 0.2) as i32;
                let _ = window.set_position(PhysicalPosition::new(x, y));
            }
        }
    }
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = app.emit_to("launcher", "launcher-shown", ());
}

fn toggle_launcher(app: &AppHandle) {
    let Some(window) = app.get_webview_window("launcher") else { return };
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);
    if visible && focused {
        let _ = window.hide();
    } else {
        show_launcher_window(app, &window, true);
    }
}

fn read_hotkey_setting() -> String {
    store::read("settings")
        .and_then(|json| serde_json::from_str::<serde_json::Value>(&json).ok())
        .and_then(|v| v.get("hotkey").and_then(|h| h.as_str()).map(str::to_string))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_HOTKEY.to_string())
}

fn register_hotkey(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let shortcut: Shortcut = accelerator.parse().map_err(|e| format!("Invalid shortcut \"{accelerator}\": {e}"))?;
    let shortcuts = app.global_shortcut();
    let mut current = HOTKEY.lock().unwrap();
    if let Some(old) = current.as_deref() {
        if let Ok(old) = old.parse::<Shortcut>() {
            let _ = shortcuts.unregister(old);
        }
    }
    let result = shortcuts
        .on_shortcut(shortcut, |app, _, event| {
            if event.state() == ShortcutState::Pressed {
                toggle_launcher(app);
            }
        })
        .map_err(|e| format!("Could not register {accelerator}: {e}. Another app may be using it."));
    if result.is_ok() {
        *current = Some(accelerator.to_string());
    } else if let Some(old) = current.as_deref() {
        // Put the previous one back so the launcher stays reachable.
        if let Ok(old_shortcut) = old.parse::<Shortcut>() {
            let _ = shortcuts.on_shortcut(old_shortcut, |app, _, event| {
                if event.state() == ShortcutState::Pressed {
                    toggle_launcher(app);
                }
            });
        }
    }
    result
}

#[tauri::command]
fn set_hotkey(app: AppHandle, accelerator: String) -> Result<(), String> {
    register_hotkey(&app, &accelerator)
}

#[tauri::command]
fn current_hotkey() -> String {
    HOTKEY.lock().unwrap().clone().unwrap_or_else(|| DEFAULT_HOTKEY.to_string())
}

#[tauri::command]
fn hide_launcher(app: AppHandle) {
    if let Some(window) = app.get_webview_window("launcher") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn show_launcher(app: AppHandle) {
    if let Some(window) = app.get_webview_window("launcher") {
        show_launcher_window(&app, &window, false);
    }
}

#[tauri::command]
fn open_settings(app: AppHandle, page: Option<String>) -> Result<(), String> {
    if let Some(launcher) = app.get_webview_window("launcher") {
        let _ = launcher.hide();
    }
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(page) = page {
            let _ = app.emit_to("settings", "settings-page", page);
        }
        return Ok(());
    }
    let url = match page {
        Some(page) => format!("index.html#{page}"),
        None => "index.html".to_string(),
    };
    WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App(url.into()))
        .title("Işın Settings")
        .inner_size(920.0, 660.0)
        .min_inner_size(760.0, 520.0)
        .center()
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Işın", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Işın", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &settings, &PredefinedMenuItem::separator(app)?, &quit])?;
    let mut builder = TrayIconBuilder::with_id("isin")
        .tooltip("Işın")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => toggle_launcher(app),
            "settings" => {
                let _ = open_settings(app.clone(), None);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                toggle_launcher(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            toggle_launcher(app);
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("launcher") {
                let _ = window_vibrancy::apply_acrylic(&window, Some((0, 0, 0, 0)));
                let hidden = handle.clone();
                window.on_window_event(move |event| match event {
                    WindowEvent::Focused(false) => {
                        if let Some(w) = hidden.get_webview_window("launcher") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                                let _ = hidden.emit_to("launcher", "launcher-hidden", ());
                            }
                        }
                    }
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        if let Some(w) = hidden.get_webview_window("launcher") {
                            let _ = w.hide();
                        }
                    }
                    _ => {}
                });
            }
            build_tray(&handle)?;
            if let Err(error) = register_hotkey(&handle, &read_hotkey_setting()) {
                eprintln!("{error}");
                let _ = register_hotkey(&handle, DEFAULT_HOTKEY);
            }
            clipboard::start_monitor(handle.clone());
            apps::refresh(handle.clone());
            // First run (no settings yet) and not started at login: show the launcher so people see it.
            let started_hidden = std::env::args().any(|a| a == "--hidden");
            if !started_hidden && store::read("settings").is_none() {
                if let Some(window) = handle.get_webview_window("launcher") {
                    show_launcher_window(&handle, &window, true);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_hotkey,
            current_hotkey,
            hide_launcher,
            show_launcher,
            open_settings,
            quit_app,
            store::read_store,
            store::write_store,
            store::data_dir_path,
            apps::list_apps,
            apps::shell_icon,
            clipboard::clipboard_history,
            clipboard::clipboard_delete,
            clipboard::clipboard_clear,
            clipboard::clipboard_pin,
            clipboard::clipboard_set_paused,
            clipboard::copy_text,
            clipboard::read_clipboard_text,
            clipboard::paste_text,
            clipboard::get_selected_text,
            system::run_system,
            system::shell_open,
            system::show_in_explorer,
            system::window_layout,
            system::run_command_line,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Işın");
}
