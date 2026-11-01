//! Global keyboard shortcuts.
//!
//! Defaults use Ctrl+Alt rather than Ctrl+Shift because Ctrl+Shift+C opens
//! browser DevTools (inspect element) in Chrome and Edge, and a global hotkey
//! would steal it.
//!
//! Accelerators are strings like `Ctrl+Alt+KeyC` (modifiers, then a
//! `KeyboardEvent.code` name), which `global-hotkey` parses. Defaults are
//! registered in `setup`; the user's saved choices live in SQLite and the main
//! window re-applies them through [`set_shortcut`] when it loads.
//!
//! A shortcut another app already owns fails to register; that is recorded
//! (not fatal) and shown on the Settings page.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    PickColor,
    IdentifyFont,
    ToggleToolbar,
}

pub const ACTIONS: [Action; 3] = [
    Action::PickColor,
    Action::IdentifyFont,
    Action::ToggleToolbar,
];

pub fn default_accelerator(action: Action) -> &'static str {
    match action {
        Action::PickColor => "Ctrl+Alt+KeyC",
        Action::IdentifyFont => "Ctrl+Alt+KeyF",
        Action::ToggleToolbar => "Ctrl+Alt+Space",
    }
}

/// `Ctrl+Alt+KeyC` -> `Ctrl+Alt+C`, for menus.
pub fn pretty(accelerator: &str) -> String {
    accelerator
        .split('+')
        .map(|t| {
            t.strip_prefix("Key")
                .or_else(|| t.strip_prefix("Digit"))
                .unwrap_or(t)
        })
        .collect::<Vec<_>>()
        .join("+")
}

#[derive(Clone, Debug, Serialize)]
pub struct ShortcutStatus {
    pub action: Action,
    pub accelerator: String,
    pub default_accelerator: &'static str,
    pub registered: bool,
    /// Why registration failed, e.g. another app already uses the keys.
    pub error: Option<String>,
}

struct Entry {
    status: ShortcutStatus,
    shortcut: Option<Shortcut>,
}

#[derive(Default)]
pub struct ShortcutRegistry(Mutex<Vec<Entry>>);

fn parse(accelerator: &str) -> Result<Shortcut, String> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|e| format!("\"{accelerator}\" is not a valid shortcut ({e})"))?;
    if shortcut.mods.is_empty() {
        return Err(
            "Add Ctrl, Alt, Shift or Win so the shortcut doesn't block normal typing.".into(),
        );
    }
    Ok(shortcut)
}

/// Plugin with the dispatch handler. Register the keys with [`register_defaults`] in setup.
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event: ShortcutEvent| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let action = app.try_state::<ShortcutRegistry>().and_then(|reg| {
                reg.0.lock().ok().and_then(|entries| {
                    entries
                        .iter()
                        .find(|e| e.shortcut.as_ref() == Some(shortcut))
                        .map(|e| e.status.action)
                })
            });
            if let Some(action) = action {
                crate::toolbar::handle_action(app, action);
            }
        })
        .build()
}

pub fn register_defaults(app: &AppHandle) {
    let entries = ACTIONS
        .iter()
        .map(|&action| {
            let accelerator = default_accelerator(action);
            let parsed = parse(accelerator);
            let result = parsed
                .clone()
                .and_then(|s| app.global_shortcut().register(s).map_err(|e| e.to_string()));
            Entry {
                status: ShortcutStatus {
                    action,
                    accelerator: accelerator.to_string(),
                    default_accelerator: accelerator,
                    registered: result.is_ok(),
                    error: result.err(),
                },
                shortcut: parsed.ok(),
            }
        })
        .collect();
    app.manage(ShortcutRegistry(Mutex::new(entries)));
}

/// Accelerator currently bound to an action (for the tray menu).
pub fn current(app: &AppHandle, action: Action) -> String {
    app.try_state::<ShortcutRegistry>()
        .and_then(|reg| {
            reg.0.lock().ok().and_then(|entries| {
                entries
                    .iter()
                    .find(|e| e.status.action == action)
                    .map(|e| e.status.accelerator.clone())
            })
        })
        .unwrap_or_else(|| default_accelerator(action).to_string())
}

#[tauri::command]
pub fn shortcut_status(state: tauri::State<'_, ShortcutRegistry>) -> Vec<ShortcutStatus> {
    state
        .0
        .lock()
        .map(|entries| entries.iter().map(|e| e.status.clone()).collect())
        .unwrap_or_default()
}

/// Rebind an action. On failure the previous binding stays in place and the
/// error says why (invalid, used by another Huetype action, or taken by another app).
#[tauri::command]
pub fn set_shortcut(
    app: AppHandle,
    state: tauri::State<'_, ShortcutRegistry>,
    action: Action,
    accelerator: String,
) -> Result<ShortcutStatus, String> {
    let new = parse(&accelerator)?;
    let status = {
        let mut entries = state
            .0
            .lock()
            .map_err(|_| "Shortcut state is unavailable.")?;
        if let Some(other) = entries
            .iter()
            .find(|e| e.status.action != action && e.shortcut.as_ref() == Some(&new))
        {
            return Err(format!(
                "{} is already used by another Huetype action ({:?}).",
                pretty(&accelerator),
                other.status.action
            ));
        }
        let entry = entries
            .iter_mut()
            .find(|e| e.status.action == action)
            .ok_or("Unknown action.")?;

        if entry.shortcut.as_ref() == Some(&new) && entry.status.registered {
            entry.status.accelerator = accelerator;
            return Ok(entry.status.clone());
        }

        let gs = app.global_shortcut();
        if let (Some(old), true) = (entry.shortcut, entry.status.registered) {
            let _ = gs.unregister(old);
        }
        match gs.register(new) {
            Ok(()) => {
                entry.shortcut = Some(new);
                entry.status.accelerator = accelerator;
                entry.status.registered = true;
                entry.status.error = None;
                entry.status.clone()
            }
            Err(e) => {
                // Put the previous binding back so the action keeps working.
                if let (Some(old), true) = (entry.shortcut, entry.status.registered) {
                    let _ = gs.register(old);
                }
                return Err(format!(
                    "{} is already in use by another app. Try a different combination. ({e})",
                    pretty(&accelerator)
                ));
            }
        }
    };
    crate::tray::refresh_labels(&app);
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_parse() {
        for a in ACTIONS {
            assert!(parse(default_accelerator(a)).is_ok(), "{a:?}");
        }
    }

    #[test]
    fn rejects_bare_keys_and_garbage() {
        assert!(parse("KeyC").is_err());
        assert!(parse("Ctrl+Alt+NotAKey").is_err());
    }

    #[test]
    fn pretty_labels() {
        assert_eq!(pretty("Ctrl+Alt+KeyC"), "Ctrl+Alt+C");
        assert_eq!(pretty("Ctrl+Shift+Digit1"), "Ctrl+Shift+1");
        assert_eq!(pretty("Ctrl+Alt+Space"), "Ctrl+Alt+Space");
    }
}
