//! The color picker session: freeze every monitor, cover each one with a
//! full-screen overlay window showing its still, and collect picks until the
//! user presses Esc.
//!
//! Overlay windows (`overlay-0`, `overlay-1`, ...) are created on the first
//! pick and then hidden and reused, so later picks open instantly. The page
//! (overlay.html) pulls its frame with `overlay_frame`, draws it, and calls
//! `overlay_ready`, which shows the window. Picks go out as `PICKED_EVENT` to
//! every window.

use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::capture::{self, Frame, MonitorInfo, XcapSource};
use crate::{MAIN_WINDOW, toolbar};

/// Overlay windows are `overlay-<monitor index>`.
pub const OVERLAY_PREFIX: &str = "overlay-";

/// Sent to an overlay window when a new session has a frame for it.
pub const OPEN_EVENT: &str = "huetype://overlay-open";

/// Broadcast for every picked color (payload: [`Pick`]).
pub const PICKED_EVENT: &str = "huetype://picked";

/// Sent when a pick session could not open (payload: message). The main
/// window is shown on Picker home, which displays it.
pub const ERROR_EVENT: &str = "huetype://picker-error";

/// Broadcast when a pick session ends, with or without picks (Esc, right-click,
/// Alt+F4 or a failed start), so pages waiting for a pick can stop waiting.
pub const FINISHED_EVENT: &str = "huetype://picker-finished";

/// Time for Windows to repaint after we hide our own windows, so they are
/// not in the frozen frame.
const HIDE_SETTLE: Duration = Duration::from_millis(150);

/// Bytes before the RGBA pixels in an `overlay_frame` response:
/// width u32, height u32, x i32, y i32, scale f32 (all little-endian).
pub const FRAME_HEADER: usize = 20;

#[derive(Default)]
struct Session {
    active: bool,
    /// Frame per overlay window label.
    frames: Vec<(String, Frame)>,
    restore_toolbar: bool,
    restore_main: bool,
    /// Why the last session failed to open, until Picker home reads it.
    last_error: Option<String>,
}

/// Managed state for the picker session.
#[derive(Default)]
pub struct Picker(Mutex<Session>);

/// A picked color, as sent by the overlay page and broadcast to every window.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pick {
    pub hex: String,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    /// Physical virtual-desktop pixels (top-left of the area for an average).
    pub x: i32,
    pub y: i32,
    /// Size of the averaged area in physical pixels (1x1 for a single pixel).
    pub width: u32,
    pub height: u32,
}

pub fn overlay_label(index: usize) -> String {
    format!("{OVERLAY_PREFIX}{index}")
}

pub fn is_overlay(label: &str) -> bool {
    label.starts_with(OVERLAY_PREFIX)
}

/// `overlay_frame` payload: [`FRAME_HEADER`] then the raw RGBA rows.
pub fn encode_frame(frame: &Frame) -> Vec<u8> {
    let m = &frame.monitor;
    let raw = frame.image.as_raw();
    let mut out = Vec::with_capacity(FRAME_HEADER + raw.len());
    out.extend_from_slice(&frame.image.width().to_le_bytes());
    out.extend_from_slice(&frame.image.height().to_le_bytes());
    out.extend_from_slice(&m.x.to_le_bytes());
    out.extend_from_slice(&m.y.to_le_bytes());
    out.extend_from_slice(&m.scale_factor.to_le_bytes());
    out.extend_from_slice(raw);
    out
}

/// Start a pick session (shortcut, tray, toolbar or Picker home). Does
/// nothing if one is already open.
pub fn start(app: &AppHandle) {
    let state = app.state::<Picker>();
    {
        let mut s = state.0.lock().unwrap();
        if s.active {
            return;
        }
        s.active = true;
        s.last_error = None;
        s.restore_toolbar = is_visible(app, toolbar::TOOLBAR_WINDOW);
        s.restore_main = is_visible(app, MAIN_WINDOW);
    }
    let app = app.clone();
    // Off the calling thread: we wait for the desktop to repaint, and the
    // capture itself takes tens of milliseconds per monitor.
    std::thread::spawn(move || {
        if let Err(e) = open(&app) {
            eprintln!("picker: {e}");
            finish(&app);
            report_error(&app, e);
        }
    });
}

fn is_visible(app: &AppHandle, label: &str) -> bool {
    app.get_webview_window(label)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

fn open(app: &AppHandle) -> Result<(), String> {
    let (hide_toolbar, hide_main) = {
        let s = app.state::<Picker>();
        let s = s.0.lock().unwrap();
        (s.restore_toolbar, s.restore_main)
    };
    if hide_toolbar {
        toolbar::hide(app);
    }
    if hide_main && let Some(w) = app.get_webview_window(MAIN_WINDOW) {
        let _ = w.hide();
    }
    if hide_toolbar || hide_main {
        std::thread::sleep(HIDE_SETTLE);
    }

    let frames = capture::capture_all(&XcapSource)?;
    let monitors: Vec<MonitorInfo> = frames.iter().map(|f| f.monitor.clone()).collect();
    {
        let state = app.state::<Picker>();
        let mut s = state.0.lock().unwrap();
        s.frames = frames
            .into_iter()
            .enumerate()
            .map(|(i, f)| (overlay_label(i), f))
            .collect();
    }

    // Drop windows for monitors that have gone away.
    for (label, w) in app.webview_windows() {
        let index = label
            .strip_prefix(OVERLAY_PREFIX)
            .and_then(|n| n.parse::<usize>().ok());
        if index.is_some_and(|i| i >= monitors.len()) {
            let _ = w.destroy();
        }
    }

    for (i, m) in monitors.iter().enumerate() {
        let label = overlay_label(i);
        let window = match app.get_webview_window(&label) {
            Some(w) => {
                place(&w, m);
                // An existing page is listening: tell it to fetch the new frame.
                let _ = w.emit_to(&label, OPEN_EVENT, ());
                w
            }
            // A new page fetches its frame when it loads.
            None => {
                let w = create(app, &label).map_err(|e| e.to_string())?;
                place(&w, m);
                w
            }
        };
        let _ = window.set_always_on_top(true);
    }
    Ok(())
}

fn create(app: &AppHandle, label: &str) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("overlay.html".into()))
        .title("Huetype picker")
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()
}

/// Cover the monitor exactly, in physical pixels (each monitor may have its
/// own scale, so logical sizes would be wrong).
fn place(w: &WebviewWindow, m: &MonitorInfo) {
    let _ = w.set_position(PhysicalPosition::new(m.x, m.y));
    let _ = w.set_size(PhysicalSize::new(m.width, m.height));
}

/// Hide the overlays, free the frames and bring back what we hid.
pub fn finish(app: &AppHandle) {
    let (restore_toolbar, restore_main) = {
        let state = app.state::<Picker>();
        let mut s = state.0.lock().unwrap();
        if !s.active {
            return;
        }
        s.active = false;
        s.frames.clear();
        (s.restore_toolbar, s.restore_main)
    };
    for (label, w) in app.webview_windows() {
        if is_overlay(&label) {
            let _ = w.hide();
        }
    }
    if restore_toolbar {
        toolbar::show(app);
    }
    if restore_main {
        crate::show_main_window(app);
    }
    let _ = app.emit(FINISHED_EVENT, ());
}

/// Tell the user why no picker opened, wherever the pick was started from
/// (shortcut, tray, toolbar or Picker home): keep the message for Picker home
/// to read when it mounts, show it there, and broadcast it to a mounted page.
fn report_error(app: &AppHandle, message: String) {
    app.state::<Picker>().0.lock().unwrap().last_error = Some(message.clone());
    crate::open_section(app, "picker");
    let _ = app.emit(ERROR_EVENT, message);
}

/// The last start-up error, if any, cleared once read.
#[tauri::command]
pub fn take_picker_error(state: State<'_, Picker>) -> Option<String> {
    state.0.lock().unwrap().last_error.take()
}

#[tauri::command]
pub fn start_pick(app: AppHandle) {
    start(&app);
}

/// The frozen frame for the calling overlay window (binary, see [`encode_frame`]).
#[tauri::command]
pub fn overlay_frame(
    window: WebviewWindow,
    state: State<'_, Picker>,
) -> Result<tauri::ipc::Response, String> {
    let s = state.0.lock().unwrap();
    let frame = s
        .frames
        .iter()
        .find(|(label, _)| label == window.label())
        .map(|(_, f)| f)
        .ok_or_else(|| "No picker session".to_string())?;
    Ok(tauri::ipc::Response::new(encode_frame(frame)))
}

/// The overlay has drawn its frame: show it, and give keyboard focus to the
/// one under the mouse so arrows and Esc work straight away.
#[tauri::command]
pub fn overlay_ready(app: AppHandle, window: WebviewWindow, state: State<'_, Picker>) {
    let monitor = {
        let s = state.0.lock().unwrap();
        if !s.active {
            return;
        }
        s.frames
            .iter()
            .find(|(label, _)| label == window.label())
            .map(|(_, f)| f.monitor.clone())
    };
    // Place again before showing: moving a window onto a monitor with a
    // different scale makes Windows resize it, which could undo our size.
    if let Some(m) = &monitor {
        place(&window, m);
    }
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    let under_cursor = match (app.cursor_position(), monitor) {
        (Ok(p), Some(m)) => m.contains(p.x.floor() as i32, p.y.floor() as i32),
        _ => false,
    };
    if under_cursor {
        let _ = window.set_focus();
    }
}

/// Screenshot of the monitor the main window is on, taken with our own
/// windows hidden (Image palette's "Grab screen"). Binary, see [`encode_frame`].
#[tauri::command]
pub async fn grab_screen(app: AppHandle) -> Result<tauri::ipc::Response, String> {
    let main = app
        .get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| "No main window".to_string())?;
    let pos = main.outer_position().map_err(|e| e.to_string())?;
    let size = main.outer_size().map_err(|e| e.to_string())?;
    let (cx, cy) = (
        pos.x + (size.width / 2) as i32,
        pos.y + (size.height / 2) as i32,
    );
    let restore_toolbar = is_visible(&app, toolbar::TOOLBAR_WINDOW);
    let _ = main.hide();
    if restore_toolbar {
        toolbar::hide(&app);
    }
    let result = tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(HIDE_SETTLE);
        capture::capture_monitor_at(&XcapSource, cx, cy)
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    crate::show_main_window(&app);
    if restore_toolbar {
        toolbar::show(&app);
    }
    result.map(|frame| tauri::ipc::Response::new(encode_frame(&frame)))
}

#[tauri::command]
pub fn overlay_pick(app: AppHandle, pick: Pick) {
    let _ = app.emit(PICKED_EVENT, pick);
}

#[tauri::command]
pub fn overlay_finish(app: AppHandle) {
    finish(&app);
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    #[test]
    fn labels_round_trip() {
        assert_eq!(overlay_label(2), "overlay-2");
        assert!(is_overlay("overlay-0"));
        assert!(!is_overlay("toolbar"));
    }

    #[test]
    fn frame_header_then_pixels() {
        let frame = Frame {
            monitor: MonitorInfo {
                name: "Left".into(),
                x: -2880,
                y: -200,
                width: 2,
                height: 1,
                scale_factor: 1.5,
            },
            image: RgbaImage::from_fn(2, 1, |x, _| Rgba([x as u8, 2, 3, 255])),
        };
        let bytes = encode_frame(&frame);
        assert_eq!(bytes.len(), FRAME_HEADER + 8);
        assert_eq!(u32::from_le_bytes(bytes[0..4].try_into().unwrap()), 2);
        assert_eq!(u32::from_le_bytes(bytes[4..8].try_into().unwrap()), 1);
        assert_eq!(i32::from_le_bytes(bytes[8..12].try_into().unwrap()), -2880);
        assert_eq!(i32::from_le_bytes(bytes[12..16].try_into().unwrap()), -200);
        assert_eq!(f32::from_le_bytes(bytes[16..20].try_into().unwrap()), 1.5);
        assert_eq!(&bytes[20..], &[0, 2, 3, 255, 1, 2, 3, 255]);
    }
}
