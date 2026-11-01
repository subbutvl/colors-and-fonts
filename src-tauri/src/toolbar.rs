//! The floating picker toolbar: a small frameless, always-on-top window.
//!
//! It is a helper surface, not an app window: no taskbar entry, and closing it
//! just hides it. Its position is remembered by tauri-plugin-window-state.

use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use crate::shortcuts::Action;

pub const TOOLBAR_WINDOW: &str = "toolbar";

/// Logical size of the toolbar pill plus room for its drop shadow.
pub const WIDTH: f64 = 420.0;
pub const HEIGHT: f64 = 72.0;

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
        let _ = w.hide();
    }
}

pub fn toggle(app: &AppHandle) {
    if let Some(w) = window(app) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show(app);
        }
    }
}

/// Entry point for shortcuts and tray items.
pub fn handle_action(app: &AppHandle, action: Action) {
    match action {
        Action::ToggleToolbar => toggle(app),
        // Picking arrives in Phase 1 and font identify in Phase 3; for now
        // show the toolbar and let it highlight the matching button.
        Action::PickColor | Action::IdentifyFont => {
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
pub fn open_main_window(app: AppHandle) {
    crate::show_main_window(&app);
}
