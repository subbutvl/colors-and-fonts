//! Huetype app entry point.
//!
//! A single main window that hides to the system tray on close, a tray icon
//! with a menu, single-instance enforcement so a second launch just brings the
//! existing window forward, SQLite storage, launch-at-startup, global
//! shortcuts, the floating picker toolbar and screen color sampling.

mod capture;
mod db;
mod fontid;
mod picker;
mod shortcuts;
mod toolbar;
mod tray;

use tauri::{Emitter, Manager, WindowEvent};

/// Passed by the autostart entry so a login launch stays in the tray.
pub const HIDDEN_ARG: &str = "--hidden";

/// Frontend event that switches the main window to a section (payload: section id).
pub const NAVIGATE_EVENT: &str = "huetype://navigate";

/// Label of the one and only app window (see `tauri.conf.json`).
pub const MAIN_WINDOW: &str = "main";

/// Show, un-minimize and focus the main window.
pub fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// The main window's fixed size in logical pixels (also in `tauri.conf.json`).
pub const MAIN_SIZE: (f64, f64) = (1400.0, 1000.0);

/// The fixed window size, shrunk to fit a work area smaller than it
/// (a 1366 x 768 laptop, say), so the window is never cut off.
fn fit_size(size: (f64, f64), area: (f64, f64)) -> (f64, f64) {
    (size.0.min(area.0), size.1.min(area.1))
}

/// Shrink the main window when its monitor's work area cannot hold 1400 x 1000.
fn fit_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else { return };
    let Ok(Some(monitor)) = window.current_monitor().or_else(|_| window.primary_monitor()) else { return };
    let scale = monitor.scale_factor();
    let area = monitor.work_area().size;
    let (w, h) = fit_size(MAIN_SIZE, (area.width as f64 / scale, area.height as f64 / scale));
    if (w, h) != MAIN_SIZE {
        let _ = window.set_size(tauri::LogicalSize::new(w, h));
        let _ = window.center();
    }
}

/// Show the main window on a given section, e.g. "settings".
pub fn open_section(app: &tauri::AppHandle, section: &str) {
    show_main_window(app);
    let _ = app.emit_to(MAIN_WINDOW, NAVIGATE_EVENT, section);
}

/// Hide the main window if it is visible, otherwise show it.
pub fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let visible = window.is_visible().unwrap_or(false);
        let minimized = window.is_minimized().unwrap_or(false);
        if visible && !minimized {
            let _ = window.hide();
        } else {
            show_main_window(app);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch focuses the running app instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::DB_URL, db::migrations())
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_ARG]),
        ))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Position only: the main window has a fixed size (1400 x 1000)
                // and visibility is ours to decide at launch.
                .with_state_flags(tauri_plugin_window_state::StateFlags::POSITION)
                .build(),
        )
        .plugin(shortcuts::plugin())
        .manage(picker::Picker::default())
        .invoke_handler(tauri::generate_handler![
            capture::color_at_point,
            capture::color_at_cursor,
            picker::start_pick,
            picker::take_picker_error,
            picker::overlay_frame,
            picker::overlay_ready,
            picker::overlay_pick,
            picker::overlay_finish,
            picker::grab_screen,
            picker::start_font_pick,
            picker::overlay_mode,
            picker::overlay_font_region,
            picker::font_capture,
            picker::font_capture_image,
            shortcuts::shortcut_status,
            shortcuts::set_shortcut,
            toolbar::hide_toolbar,
            toolbar::toggle_toolbar,
            toolbar::open_main_window,
            toolbar::toolbar_popover,
            toolbar::open_history,
            toolbar::open_color,
            tray::set_recent_picks,
        ])
        .setup(|app| {
            toolbar::create(app.handle())?;
            shortcuts::register_defaults(app.handle());
            tray::create(app.handle())?;
            // The window starts hidden (see tauri.conf.json) so a login launch
            // never flashes it; show it unless we were started with --hidden.
            fit_main_window(app.handle());
            if !std::env::args().any(|a| a == HIDDEN_ARG) {
                show_main_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window hides it to the tray (Quit lives in the
            // tray menu); closing the toolbar (e.g. Alt+F4) just hides it.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == MAIN_WINDOW {
                    api.prevent_close();
                    let _ = window.hide();
                } else if label == toolbar::TOOLBAR_WINDOW {
                    // Alt+F4: hide through the helper so an open popover is
                    // closed and the window shrinks back.
                    api.prevent_close();
                    toolbar::hide(window.app_handle());
                } else if picker::is_overlay(label) {
                    // Alt+F4 on a picker overlay ends the session.
                    api.prevent_close();
                    picker::finish(window.app_handle());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Huetype");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fit_size_shrinks_only_when_needed() {
        assert_eq!(fit_size(MAIN_SIZE, (1920.0, 1040.0)), (1400.0, 1000.0));
        // 1080p at 125% scale: the width fits, the height shrinks.
        assert_eq!(fit_size(MAIN_SIZE, (1536.0, 824.0)), (1400.0, 824.0));
        assert_eq!(fit_size(MAIN_SIZE, (1366.0, 728.0)), (1366.0, 728.0));
    }
}
