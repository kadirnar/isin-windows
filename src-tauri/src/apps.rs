//! Installed applications: Start Menu shortcuts (desktop apps) plus packaged Store apps from `Get-StartApps`.
//! Icons come from the shell (IShellItemImageFactory), are cached as PNG files and sent to the UI as data URLs.

use std::collections::{HashMap, HashSet};
use std::ffi::c_void;
use std::hash::{Hash, Hasher};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use windows::core::HSTRING;
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    HGDIOBJ,
};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::{
    IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
};

use crate::store;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppEntry {
    /// Stable id used for frecency and favorites: "app:" + lowercase name.
    pub id: String,
    pub name: String,
    /// What ShellExecute opens: a .lnk path or `shell:AppsFolder\<AUMID>`.
    pub target: String,
    /// Folder of the shortcut (for "Show in Explorer"), empty for Store apps.
    pub path: String,
    pub kind: String,
    pub icon: Option<String>,
}

struct Index {
    apps: Vec<AppEntry>,
    built: Option<Instant>,
}

static INDEX: Mutex<Index> = Mutex::new(Index { apps: Vec::new(), built: None });
static BUILDING: Mutex<bool> = Mutex::new(false);

fn start_menu_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(p) = std::env::var("ProgramData") {
        dirs.push(Path::new(&p).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    if let Ok(p) = std::env::var("APPDATA") {
        dirs.push(Path::new(&p).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    dirs
}

fn is_noise(name: &str) -> bool {
    let lower = name.to_lowercase();
    ["uninstall", "kaldır", "readme", "release notes", "website", "documentation", "help file", "license"]
        .iter()
        .any(|w| lower.contains(w))
}

fn scan_shortcuts() -> Vec<AppEntry> {
    let mut result = Vec::new();
    for dir in start_menu_dirs() {
        for entry in walkdir::WalkDir::new(&dir).max_depth(4).into_iter().flatten() {
            let path = entry.path();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
            if !matches!(ext.as_str(), "lnk" | "url" | "appref-ms") {
                continue;
            }
            let Some(name) = path.file_stem().and_then(|s| s.to_str()) else { continue };
            if is_noise(name) {
                continue;
            }
            result.push(AppEntry {
                id: format!("app:{}", name.to_lowercase()),
                name: name.to_string(),
                target: path.to_string_lossy().into_owned(),
                path: path.parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default(),
                kind: "shortcut".into(),
                icon: None,
            });
        }
    }
    result
}

#[derive(Deserialize)]
struct StartApp {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "AppID")]
    app_id: String,
}

/// Packaged (Store / UWP) apps; their AUMIDs contain `!`.
fn scan_packaged() -> Vec<AppEntry> {
    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | ConvertTo-Json -Compress",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    let Ok(output) = output else { return Vec::new() };
    let text = String::from_utf8_lossy(&output.stdout);
    let parsed: Vec<StartApp> = serde_json::from_str(text.trim())
        .or_else(|_| serde_json::from_str::<StartApp>(text.trim()).map(|a| vec![a]))
        .unwrap_or_default();
    parsed
        .into_iter()
        .filter(|a| a.app_id.contains('!') && !is_noise(&a.name))
        .map(|a| AppEntry {
            id: format!("app:{}", a.name.to_lowercase()),
            name: a.name,
            target: format!(r"shell:AppsFolder\{}", a.app_id),
            path: String::new(),
            kind: "store".into(),
            icon: None,
        })
        .collect()
}

fn icon_cache_path(target: &str) -> PathBuf {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    target.hash(&mut hasher);
    store::cache_dir().join("icons").join(format!("{:016x}.png", hasher.finish()))
}

/// Renders the shell icon of `target` at 64 px into PNG bytes.
fn render_icon(target: &str) -> Option<Vec<u8>> {
    unsafe {
        let factory: IShellItemImageFactory = SHCreateItemFromParsingName(&HSTRING::from(target), None).ok()?;
        let flags = SIIGBF(SIIGBF_ICONONLY.0 | SIIGBF_BIGGERSIZEOK.0);
        let bitmap = factory.GetImage(SIZE { cx: 64, cy: 64 }, flags).ok()?;
        let object = HGDIOBJ(bitmap.0);
        let mut info = BITMAP::default();
        if GetObjectW(object, std::mem::size_of::<BITMAP>() as i32, Some(&mut info as *mut BITMAP as *mut c_void)) == 0 {
            let _ = DeleteObject(object);
            return None;
        }
        let (width, height) = (info.bmWidth, info.bmHeight.abs());
        let mut header = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = vec![0u8; (width * height * 4) as usize];
        let dc = GetDC(None);
        let lines = GetDIBits(
            dc,
            bitmap,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut c_void),
            &mut header,
            DIB_RGB_COLORS,
        );
        ReleaseDC(None, dc);
        let _ = DeleteObject(object);
        if lines == 0 {
            return None;
        }
        // BGRA (premultiplied) → straight RGBA.
        let any_alpha = pixels.chunks(4).any(|p| p[3] != 0);
        for p in pixels.chunks_mut(4) {
            let (b, g, r, a) = (p[0], p[1], p[2], if any_alpha { p[3] } else { 255 });
            let un = |c: u8| if a == 0 { 0 } else { ((c as u32 * 255 + a as u32 / 2) / a as u32).min(255) as u8 };
            p[0] = un(r);
            p[1] = un(g);
            p[2] = un(b);
            p[3] = a;
        }
        let mut png_bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut png_bytes, width as u32, height as u32);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().ok()?;
            writer.write_image_data(&pixels).ok()?;
        }
        Some(png_bytes)
    }
}

fn data_url(bytes: &[u8]) -> String {
    format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
}

fn cached_icon(target: &str) -> Option<String> {
    std::fs::read(icon_cache_path(target)).ok().map(|b| data_url(&b))
}

fn build_index() -> Vec<AppEntry> {
    let mut seen = HashSet::new();
    let mut apps = Vec::new();
    for app in scan_shortcuts().into_iter().chain(scan_packaged()) {
        if seen.insert(app.id.clone()) {
            apps.push(app);
        }
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    for app in apps.iter_mut() {
        app.icon = cached_icon(&app.target);
    }
    apps
}

/// Rebuilds the index on a background thread (if not already running) and renders missing icons.
pub fn refresh(app: AppHandle) {
    {
        let mut building = BUILDING.lock().unwrap();
        if *building {
            return;
        }
        *building = true;
    }
    std::thread::spawn(move || {
        let apps = build_index();
        {
            let mut index = INDEX.lock().unwrap();
            index.apps = apps.clone();
            index.built = Some(Instant::now());
        }
        let _ = app.emit("apps-updated", ());

        let missing: Vec<String> = apps.iter().filter(|a| a.icon.is_none()).map(|a| a.target.clone()).collect();
        if !missing.is_empty() {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            }
            let _ = std::fs::create_dir_all(store::cache_dir().join("icons"));
            let mut rendered: HashMap<String, String> = HashMap::new();
            for target in missing {
                if let Some(bytes) = render_icon(&target) {
                    let _ = std::fs::write(icon_cache_path(&target), &bytes);
                    rendered.insert(target, data_url(&bytes));
                }
            }
            {
                let mut index = INDEX.lock().unwrap();
                for app in index.apps.iter_mut() {
                    if let Some(icon) = rendered.remove(&app.target) {
                        app.icon = Some(icon);
                    }
                }
            }
            let _ = app.emit("apps-updated", ());
        }
        *BUILDING.lock().unwrap() = false;
    });
}

#[tauri::command]
pub fn list_apps(app: AppHandle) -> Vec<AppEntry> {
    let (apps, stale) = {
        let index = INDEX.lock().unwrap();
        let stale = index.built.map_or(true, |t| t.elapsed() > Duration::from_secs(120));
        (index.apps.clone(), stale)
    };
    if stale {
        refresh(app);
    }
    apps
}

#[tauri::command]
pub fn shell_icon(target: String) -> Option<String> {
    if let Some(icon) = cached_icon(&target) {
        return Some(icon);
    }
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }
    let bytes = render_icon(&target)?;
    let _ = std::fs::create_dir_all(store::cache_dir().join("icons"));
    let _ = std::fs::write(icon_cache_path(&target), &bytes);
    Some(data_url(&bytes))
}
