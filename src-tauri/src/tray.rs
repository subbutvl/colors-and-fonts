//! System tray icon and menu.

use tauri::{
    AppHandle, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use crate::shortcuts::{self, Action};

const OPEN: &str = "open";
const TOOLBAR: &str = "toolbar";
const PICK_COLOR: &str = "pick_color";
const IDENTIFY_FONT: &str = "identify_font";
const SETTINGS: &str = "settings";
const QUIT: &str = "quit";

/// Menu items whose text shows a shortcut, kept so a rebind can update them.
struct TrayItems {
    toolbar: MenuItem<tauri::Wry>,
    pick: MenuItem<tauri::Wry>,
}

fn pick_text(app: &AppHandle) -> String {
    format!(
        "Pick color\t{}",
        shortcuts::pretty(&shortcuts::current(app, Action::PickColor))
    )
}

fn toolbar_text(app: &AppHandle) -> String {
    format!(
        "Show or hide toolbar\t{}",
        shortcuts::pretty(&shortcuts::current(app, Action::ToggleToolbar))
    )
}

/// Re-read shortcut labels after a rebind.
pub fn refresh_labels(app: &AppHandle) {
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.toolbar.set_text(toolbar_text(app));
        let _ = items.pick.set_text(pick_text(app));
    }
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, OPEN, "Open Huetype", true, None::<&str>)?;
    let toolbar = MenuItem::with_id(app, TOOLBAR, toolbar_text(app), true, None::<&str>)?;
    let pick = MenuItem::with_id(app, PICK_COLOR, pick_text(app), true, None::<&str>)?;
    // Enabled in Phase 3 (font identify).
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
            &toolbar,
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
            TOOLBAR => crate::toolbar::toggle(app),
            PICK_COLOR => crate::picker::start(app),
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
    app.manage(TrayItems {
        toolbar: toolbar.clone(),
        pick: pick.clone(),
    });
    builder.build(app)?;
    Ok(())
}
