//! Thin wrappers over Win32: the window that was in front before the launcher opened, synthetic key presses,
//! ShellExecute and window placement (the Windows counterpart of Işın's Accessibility-based window management).

use std::ffi::c_void;
use std::sync::atomic::{AtomicIsize, Ordering};

use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, MonitorFromWindow, HDC, HMONITOR, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP,
    VIRTUAL_KEY,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowRect, IsIconic, IsWindow, IsZoomed, SetForegroundWindow, SetWindowPos, ShowWindow,
    SWP_NOACTIVATE, SWP_NOZORDER, SW_MAXIMIZE, SW_MINIMIZE, SW_RESTORE, SW_SHOWNORMAL,
};
use windows::core::BOOL;
use windows::Win32::Foundation::LPARAM;

static PREVIOUS_WINDOW: AtomicIsize = AtomicIsize::new(0);

/// Remember the window the user was in, so paste and window commands can go back to it.
pub fn remember_foreground(own: Option<isize>) {
    let hwnd = unsafe { GetForegroundWindow() };
    let raw = hwnd.0 as isize;
    if raw != 0 && Some(raw) != own {
        PREVIOUS_WINDOW.store(raw, Ordering::SeqCst);
    }
}

pub fn previous_window() -> Option<HWND> {
    let raw = PREVIOUS_WINDOW.load(Ordering::SeqCst);
    if raw == 0 {
        return None;
    }
    let hwnd = HWND(raw as *mut c_void);
    if unsafe { IsWindow(Some(hwnd)) }.as_bool() { Some(hwnd) } else { None }
}

pub fn focus_previous() {
    if let Some(hwnd) = previous_window() {
        unsafe {
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            let _ = SetForegroundWindow(hwnd);
        }
    }
}

fn key_input(vk: u16, up: bool) -> INPUT {
    let extended = matches!(vk, 0x21..=0x2E | 0x5B | 0x5C | 0xA5 | 0xA3 | 0xAD..=0xB3);
    let mut flags = KEYBD_EVENT_FLAGS(0);
    if up {
        flags |= KEYEVENTF_KEYUP;
    }
    if extended {
        flags |= KEYEVENTF_EXTENDEDKEY;
    }
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VIRTUAL_KEY(vk), wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
    }
}

/// Press `keys` in order and release them in reverse: `send_chord(&[VK_CONTROL, 'V'])`.
pub fn send_chord(keys: &[u16]) {
    let mut inputs: Vec<INPUT> = keys.iter().map(|&k| key_input(k, false)).collect();
    inputs.extend(keys.iter().rev().map(|&k| key_input(k, true)));
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

pub const VK_CONTROL: u16 = 0x11;
pub const VK_LWIN: u16 = 0x5B;
pub const VK_LEFT: u16 = 0x25;

pub fn tap(vk: u16, times: u32) {
    for _ in 0..times {
        send_chord(&[vk]);
    }
}

/// ShellExecute: opens files, shortcuts, URLs, `ms-settings:` URIs and `shell:AppsFolder\<AUMID>` entries.
pub fn shell_execute(target: &str, args: Option<&str>, verb: &str) -> Result<(), String> {
    let result = unsafe {
        ShellExecuteW(
            None,
            &HSTRING::from(verb),
            &HSTRING::from(target),
            &HSTRING::from(args.unwrap_or("")),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if result.0 as isize > 32 { Ok(()) } else { Err(format!("Could not open {target} (error {})", result.0 as isize)) }
}

// MARK: Window management

fn frame_bounds(hwnd: HWND) -> Option<(RECT, RECT)> {
    let mut window = RECT::default();
    let mut frame = RECT::default();
    unsafe {
        GetWindowRect(hwnd, &mut window).ok()?;
        if DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut frame as *mut RECT as *mut c_void,
            std::mem::size_of::<RECT>() as u32,
        )
        .is_err()
        {
            frame = window;
        }
    }
    Some((window, frame))
}

fn work_area(monitor: HMONITOR) -> Option<RECT> {
    let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
    unsafe { GetMonitorInfoW(monitor, &mut info) }.as_bool().then_some(info.rcWork)
}

unsafe extern "system" fn collect_monitor(monitor: HMONITOR, _: HDC, _: *mut RECT, data: LPARAM) -> BOOL {
    let list = unsafe { &mut *(data.0 as *mut Vec<HMONITOR>) };
    list.push(monitor);
    BOOL(1)
}

fn monitors() -> Vec<HMONITOR> {
    let mut list: Vec<HMONITOR> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(collect_monitor), LPARAM(&mut list as *mut _ as isize));
    }
    list
}

/// Places a rectangle (visible frame, without the invisible resize border) on the window.
fn place(hwnd: HWND, x: i32, y: i32, w: i32, h: i32) -> Result<(), String> {
    unsafe {
        if IsZoomed(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }
    }
    let (window, frame) = frame_bounds(hwnd).ok_or("window is gone")?;
    let left = frame.left - window.left;
    let top = frame.top - window.top;
    let right = window.right - frame.right;
    let bottom = window.bottom - frame.bottom;
    unsafe {
        SetWindowPos(hwnd, None, x - left, y - top, w + left + right, h + top + bottom, SWP_NOZORDER | SWP_NOACTIVATE)
            .map_err(|e| e.to_string())
    }
}

/// Fractions of the work area: (x, y, width, height).
fn layout_fractions(layout: &str) -> Option<(f64, f64, f64, f64)> {
    let third = 1.0 / 3.0;
    Some(match layout {
        "left-half" => (0.0, 0.0, 0.5, 1.0),
        "right-half" => (0.5, 0.0, 0.5, 1.0),
        "top-half" => (0.0, 0.0, 1.0, 0.5),
        "bottom-half" => (0.0, 0.5, 1.0, 0.5),
        "center-half" => (0.25, 0.0, 0.5, 1.0),
        "top-left" => (0.0, 0.0, 0.5, 0.5),
        "top-right" => (0.5, 0.0, 0.5, 0.5),
        "bottom-left" => (0.0, 0.5, 0.5, 0.5),
        "bottom-right" => (0.5, 0.5, 0.5, 0.5),
        "first-third" => (0.0, 0.0, third, 1.0),
        "center-third" => (third, 0.0, third, 1.0),
        "last-third" => (2.0 * third, 0.0, third, 1.0),
        "first-two-thirds" => (0.0, 0.0, 2.0 * third, 1.0),
        "last-two-thirds" => (third, 0.0, 2.0 * third, 1.0),
        "first-fourth" => (0.0, 0.0, 0.25, 1.0),
        "second-fourth" => (0.25, 0.0, 0.25, 1.0),
        "third-fourth" => (0.5, 0.0, 0.25, 1.0),
        "last-fourth" => (0.75, 0.0, 0.25, 1.0),
        "almost-maximize" => (0.05, 0.05, 0.9, 0.9),
        "reasonable-size" => (0.2, 0.15, 0.6, 0.7),
        _ => return None,
    })
}

pub fn apply_layout(layout: &str) -> Result<(), String> {
    let hwnd = previous_window().ok_or("No window to arrange. Switch to a window, then open Işın.")?;
    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    let area = work_area(monitor).ok_or("no monitor")?;
    let (aw, ah) = ((area.right - area.left) as f64, (area.bottom - area.top) as f64);
    match layout {
        "maximize" => unsafe {
            let _ = ShowWindow(hwnd, SW_MAXIMIZE);
            Ok(())
        },
        "minimize" => unsafe {
            let _ = ShowWindow(hwnd, SW_MINIMIZE);
            Ok(())
        },
        "restore" => unsafe {
            let _ = ShowWindow(hwnd, SW_RESTORE);
            Ok(())
        },
        "center" => {
            let (_, frame) = frame_bounds(hwnd).ok_or("window is gone")?;
            let (w, h) = (frame.right - frame.left, frame.bottom - frame.top);
            let x = area.left + ((aw as i32 - w) / 2);
            let y = area.top + ((ah as i32 - h) / 2);
            place(hwnd, x, y, w, h)
        }
        "next-display" | "previous-display" => {
            let all = monitors();
            if all.len() < 2 {
                return Err("Only one display is connected.".into());
            }
            let index = all.iter().position(|m| *m == monitor).unwrap_or(0);
            let next = if layout == "next-display" { (index + 1) % all.len() } else { (index + all.len() - 1) % all.len() };
            let target = work_area(all[next]).ok_or("no monitor")?;
            let (_, frame) = frame_bounds(hwnd).ok_or("window is gone")?;
            // Keep the window's relative position and size.
            let rx = (frame.left - area.left) as f64 / aw;
            let ry = (frame.top - area.top) as f64 / ah;
            let rw = (frame.right - frame.left) as f64 / aw;
            let rh = (frame.bottom - frame.top) as f64 / ah;
            let (tw, th) = ((target.right - target.left) as f64, (target.bottom - target.top) as f64);
            place(
                hwnd,
                target.left + (rx * tw).round() as i32,
                target.top + (ry * th).round() as i32,
                (rw * tw).round() as i32,
                (rh * th).round() as i32,
            )
        }
        _ => {
            let (fx, fy, fw, fh) = layout_fractions(layout).ok_or_else(|| format!("unknown layout {layout}"))?;
            place(
                hwnd,
                area.left + (fx * aw).round() as i32,
                area.top + (fy * ah).round() as i32,
                (fw * aw).round() as i32,
                (fh * ah).round() as i32,
            )
        }
    }
}
