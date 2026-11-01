//! Global keyboard shortcuts.
//!
//! Defaults use Ctrl+Alt rather than Ctrl+Shift because Ctrl+Shift+C opens
//! browser DevTools (inspect element) in Chrome and Edge, and a global hotkey
//! would steal it. Rebinding comes with a later settings step.
//!
//! A shortcut another app already owns fails to register; that is recorded
//! (not fatal) and shown on the Settings page.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    PickColor,
    IdentifyFont,
    ToggleToolbar,
}

struct Binding {
    action: Action,
    /// Human-readable, also shown in the tray menu and UI.
    label: &'static str,
    mods: Modifiers,
    key: Code,
}

const BINDINGS: [Binding; 3] = [
    Binding {
        action: Action::PickColor,
        label: "Ctrl+Alt+C",
        mods: Modifiers::CONTROL.union(Modifiers::ALT),
        key: Code::KeyC,
    },
    Binding {
        action: Action::IdentifyFont,
        label: "Ctrl+Alt+F",
        mods: Modifiers::CONTROL.union(Modifiers::ALT),
        key: Code::KeyF,
    },
    Binding {
        action: Action::ToggleToolbar,
        label: "Ctrl+Alt+Space",
        mods: Modifiers::CONTROL.union(Modifiers::ALT),
        key: Code::Space,
    },
];

impl Binding {
    fn shortcut(&self) -> Shortcut {
        Shortcut::new(Some(self.mods), self.key)
    }
}

/// Label for an action's shortcut, for menus.
pub fn label(action: Action) -> &'static str {
    BINDINGS
        .iter()
        .find(|b| b.action == action)
        .map(|b| b.label)
        .unwrap_or("")
}

#[derive(Clone, Debug, Serialize)]
pub struct ShortcutStatus {
    pub action: Action,
    pub label: &'static str,
    pub registered: bool,
    /// Why registration failed, e.g. another app already uses the keys.
    pub error: Option<String>,
}

#[derive(Default)]
pub struct ShortcutRegistry(pub Mutex<Vec<ShortcutStatus>>);

/// Plugin with the dispatch handler. Register the keys with [`register_all`] in setup.
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event: ShortcutEvent| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            if let Some(b) = BINDINGS.iter().find(|b| &b.shortcut() == shortcut) {
                crate::toolbar::handle_action(app, b.action);
            }
        })
        .build()
}

pub fn register_all(app: &AppHandle) {
    let statuses = BINDINGS
        .iter()
        .map(|b| {
            let result = app.global_shortcut().register(b.shortcut());
            ShortcutStatus {
                action: b.action,
                label: b.label,
                registered: result.is_ok(),
                error: result.err().map(|e| e.to_string()),
            }
        })
        .collect();
    app.manage(ShortcutRegistry(Mutex::new(statuses)));
}

#[tauri::command]
pub fn shortcut_status(state: tauri::State<'_, ShortcutRegistry>) -> Vec<ShortcutStatus> {
    state.0.lock().map(|s| s.clone()).unwrap_or_default()
}
