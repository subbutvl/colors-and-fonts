//! The floating picker toolbar: a small frameless, always-on-top window.
//!
//! It is a helper surface, not an app window: no taskbar entry, and closing it
//! just hides it. Its position is remembered by tauri-plugin-window-state.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::shortcuts::Action;

pub const TOOLBAR_WINDOW: &str = "toolbar";

/// Logical size of the toolbar pill plus room for its drop shadow.
pub const WIDTH: f64 = 420.0;
pub const HEIGHT: f64 = 72.0;

/// Extra logical height while a swatch popover is open. The window grows
/// upwards so the pill stays where the user put it.
pub const POPOVER_HEIGHT: f64 = 252.0;

/// Sent to the toolbar page when Rust closes the popover (e.g. on hide).
pub const POPOVER_CLOSED_EVENT: &str = "huetype://toolbar-popover-closed";

/// Whether the window is currently grown for the popover.
static POPOVER_OPEN: AtomicBool = AtomicBool::new(false);

/// Event sent to the toolbar when a pick/identify shortcut fires (payload: action).
pub const ACTION_EVENT: &str = "huetype://toolbar-action";

pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window =
        WebviewWindowBuilder::new(app, TOOLBAR_WINDOW, WebviewUrl::App("toolbar.html".into()))
            .title("Huetype toolbar")
            .inner_size(WIDTH, HEIGHT)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .always_on_top(true)
            .visible_on_all_workspaces(true)
            .skip_taskbar(true)
            .focused(false)
            .visible(false)
            .build()?;
    // Window-state may have saved a grown size (app quit with a popover
    // open); the toolbar is always this size when it starts.
    let _ = window.set_size(LogicalSize::new(WIDTH, HEIGHT));

    // First run: bottom centre of the primary monitor. A saved position from
    // window-state is restored over this on later runs.
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let size = monitor.size();
        let origin = monitor.position();
        let scale = monitor.scale_factor();
        let w = (WIDTH * scale) as i32;
        let h = (HEIGHT * scale) as i32;
        let x = origin.x + (size.width as i32 - w) / 2;
        let y = origin.y + size.height as i32 - h - (96.0 * scale) as i32;
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
    Ok(window)
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(TOOLBAR_WINDOW)
}

pub fn show(app: &AppHandle) {
    if let Some(w) = window(app) {
        let _ = w.show();
        let _ = w.set_always_on_top(true);
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(w) = window(app) {
        if set_popover(&w, false) {
            let _ = w.emit_to(TOOLBAR_WINDOW, POPOVER_CLOSED_EVENT, ());
        }
        let _ = w.hide();
    }
}

/// Grow (or shrink back) the window for the swatch popover, keeping the
/// pill's on-screen position. Returns whether anything changed.
fn set_popover(w: &WebviewWindow, open: bool) -> bool {
    if POPOVER_OPEN.swap(open, Ordering::SeqCst) == open {
        return false;
    }
    let scale = w.scale_factor().unwrap_or(1.0);
    let delta = (POPOVER_HEIGHT * scale).round() as i32;
    let pos = w.outer_position().ok();
    let height = if open {
        HEIGHT + POPOVER_HEIGHT
    } else {
        HEIGHT
    };
    // Move then grow, or shrink then move, so the pill never jumps.
    if !open {
        let _ = w.set_size(LogicalSize::new(WIDTH, height));
    }
    if let Some(pos) = pos {
        let y = if open { pos.y - delta } else { pos.y + delta };
        let _ = w.set_position(PhysicalPosition::new(pos.x, y));
    }
    if open {
        let _ = w.set_size(LogicalSize::new(WIDTH, height));
    }
    true
}

pub fn toggle(app: &AppHandle) {
    if let Some(w) = window(app) {
        if w.is_visible().unwrap_or(false) {
            hide(app);
        } else {
            show(app);
        }
    }
}

/// Entry point for shortcuts and tray items.
pub fn handle_action(app: &AppHandle, action: Action) {
    match action {
        Action::ToggleToolbar => toggle(app),
        Action::PickColor => crate::picker::start(app),
        // Font identify arrives in Phase 3; for now show the toolbar and let
        // it highlight the matching button.
        Action::IdentifyFont => {
            show(app);
            let _ = app.emit_to(TOOLBAR_WINDOW, ACTION_EVENT, action);
        }
    }
}

#[tauri::command]
pub fn hide_toolbar(app: AppHandle) {
    hide(&app);
}

#[tauri::command]
pub fn toggle_toolbar(app: AppHandle) {
    toggle(&app);
}

#[tauri::command]
pub fn toolbar_popover(app: AppHandle, open: bool) {
    if let Some(w) = window(&app) {
        set_popover(&w, open);
    }
}

/// The toolbar's history button: recent picks live on Picker home.
#[tauri::command]
pub fn open_history(app: AppHandle) {
    crate::open_section(&app, "picker");
}

#[tauri::command]
pub fn open_main_window(app: AppHandle) {
    crate::show_main_window(&app);
}
