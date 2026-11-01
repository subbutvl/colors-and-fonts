//! System tray icon and menu.

use serde::Deserialize;
use tauri::{
    AppHandle, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use crate::shortcuts::{self, Action};

const OPEN: &str = "open";
const TOOLBAR: &str = "toolbar";
const PICK_COLOR: &str = "pick_color";
const IDENTIFY_FONT: &str = "identify_font";
const SETTINGS: &str = "settings";
const QUIT: &str = "quit";
const RECENT: &str = "recent";
/// Recent pick items are `recent:<text to copy>`.
const RECENT_PREFIX: &str = "recent:";
/// How many recent picks the tray lists.
pub const RECENT_MAX: usize = 8;

/// Menu items whose text shows a shortcut, kept so a rebind can update them.
struct TrayItems {
    toolbar: MenuItem<tauri::Wry>,
    pick: MenuItem<tauri::Wry>,
    recent: Submenu<tauri::Wry>,
}

/// One entry of the tray's Recent menu, sent by the main window.
#[derive(Debug, Clone, Deserialize)]
pub struct RecentItem {
    /// Menu text, e.g. `#5B6CFF  Royal blue`.
    pub label: String,
    /// What a click copies, in the user's chosen format.
    pub copy: String,
}

fn empty_recent(app: &AppHandle) -> tauri::Result<MenuItem<tauri::Wry>> {
    MenuItem::with_id(app, "recent-empty", "No picks yet", false, None::<&str>)
}

/// Replace the Recent submenu (newest first). The main window calls this on
/// load and after every pick, since it owns the history in SQLite.
#[tauri::command]
pub fn set_recent_picks(app: AppHandle, items: Vec<RecentItem>) -> Result<(), String> {
    let Some(tray) = app.try_state::<TrayItems>() else {
        return Ok(());
    };
    let menu = &tray.recent;
    let err = |e: tauri::Error| e.to_string();
    for item in menu.items().map_err(err)? {
        menu.remove(&item).map_err(err)?;
    }
    if items.is_empty() {
        menu.append(&empty_recent(&app).map_err(err)?)
            .map_err(err)?;
    }
    for item in items.iter().take(RECENT_MAX) {
        let id = format!("{RECENT_PREFIX}{}", item.copy);
        let entry = MenuItem::with_id(&app, id, &item.label, true, None::<&str>).map_err(err)?;
        menu.append(&entry).map_err(err)?;
    }
    Ok(())
}

fn copy_recent(app: &AppHandle, text: &str) {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    if let Err(e) = app.clipboard().write_text(text) {
        eprintln!("tray: copy failed: {e}");
    }
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
    let recent =
        Submenu::with_id_and_items(app, RECENT, "Recent colors", true, &[&empty_recent(app)?])?;
    let settings = MenuItem::with_id(app, SETTINGS, "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, "Quit Huetype", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &toolbar,
            &PredefinedMenuItem::separator(app)?,
            &pick,
            &recent,
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
            id => {
                if let Some(text) = id.strip_prefix(RECENT_PREFIX) {
                    copy_recent(app, text);
                }
            }
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
        recent: recent.clone(),
    });
    builder.build(app)?;
    Ok(())
}
