//! Huetype app entry point.
//!
//! A single main window that hides to the system tray on close, a tray icon
//! with a menu, single-instance enforcement so a second launch just brings the
//! existing window forward, SQLite storage, launch-at-startup, global
//! shortcuts, the floating picker toolbar and screen color sampling.

mod capture;
mod db;
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
                // Position and size only; visibility is ours to decide at launch.
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .plugin(shortcuts::plugin())
        .invoke_handler(tauri::generate_handler![
            capture::color_at_point,
            capture::color_at_cursor,
            shortcuts::shortcut_status,
            shortcuts::set_shortcut,
            toolbar::hide_toolbar,
            toolbar::toggle_toolbar,
            toolbar::open_main_window,
        ])
        .setup(|app| {
            toolbar::create(app.handle())?;
            shortcuts::register_defaults(app.handle());
            tray::create(app.handle())?;
            // The window starts hidden (see tauri.conf.json) so a login launch
            // never flashes it; show it unless we were started with --hidden.
            if !std::env::args().any(|a| a == HIDDEN_ARG) {
                show_main_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window hides it to the tray (Quit lives in the
            // tray menu); closing the toolbar (e.g. Alt+F4) just hides it.
            if let WindowEvent::CloseRequested { api, .. } = event
                && (window.label() == MAIN_WINDOW || window.label() == toolbar::TOOLBAR_WINDOW)
            {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Huetype");
}
