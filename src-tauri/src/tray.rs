//! System tray icon and menu.

use tauri::{
    AppHandle,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

const OPEN: &str = "open";
const PICK_COLOR: &str = "pick_color";
const IDENTIFY_FONT: &str = "identify_font";
const SETTINGS: &str = "settings";
const QUIT: &str = "quit";

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, OPEN, "Open Huetype", true, None::<&str>)?;
    // Enabled in Phase 1 (color picker) and Phase 3 (font identify).
    let pick = MenuItem::with_id(
        app,
        PICK_COLOR,
        "Pick color (coming soon)",
        false,
        None::<&str>,
    )?;
    let font = MenuItem::with_id(
        app,
        IDENTIFY_FONT,
        "Identify font (coming soon)",
        false,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, SETTINGS, "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, "Quit Huetype", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &PredefinedMenuItem::separator(app)?,
            &pick,
            &font,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &quit,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("Huetype")
        .menu(&menu)
        // Left click toggles the window; right click opens the menu.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            OPEN => crate::show_main_window(app),
            SETTINGS => crate::open_section(app, "settings"),
            QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::toggle_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}
