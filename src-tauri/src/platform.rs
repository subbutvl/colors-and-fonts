//! Window behavior that Tauri has no API for, per OS.
//!
//! macOS: Tauri's always-on-top is `NSFloatingWindowLevel`, which sits below
//! the menu bar and the Dock, and a window only shows on the Space it was
//! opened on. The pick overlays must cover the whole screen (menu bar and
//! Dock included) on whatever Space is active, even over a full-screen app;
//! the toolbar must float over full-screen apps too. Call these after every
//! `set_always_on_top`, which resets the level. Elsewhere they do nothing.
//! Also the Dock icon policy (`set_dock_visible`).

use tauri::{AppHandle, WebviewWindow};

/// The pick overlay: above everything, on every Space.
pub fn raise_overlay(w: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    mac::apply(w, mac::SCREEN_SAVER_LEVEL);
    #[cfg(not(target_os = "macos"))]
    let _ = w;
}

/// The floating toolbar: above normal windows and full-screen apps.
pub fn raise_toolbar(w: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    mac::apply(w, mac::STATUS_LEVEL);
    #[cfg(not(target_os = "macos"))]
    let _ = w;
}

/// macOS: show the Dock icon (and app menu) only while the main window is
/// open; with it closed Huetype lives in the menu bar, like other pickers.
pub fn set_dock_visible(app: &AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    {
        use tauri::ActivationPolicy;
        let policy = if visible { ActivationPolicy::Regular } else { ActivationPolicy::Accessory };
        let _ = app.set_activation_policy(policy);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, visible);
}

#[cfg(target_os = "macos")]
mod mac {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use tauri::WebviewWindow;

    /// `kCGScreenSaverWindowLevel`: above the menu bar (24) and Dock (20).
    pub const SCREEN_SAVER_LEVEL: isize = 1000;
    /// `NSStatusWindowLevel`.
    pub const STATUS_LEVEL: isize = 25;

    // NSWindowCollectionBehavior bits.
    const CAN_JOIN_ALL_SPACES: usize = 1 << 0;
    const STATIONARY: usize = 1 << 4;
    const IGNORES_CYCLE: usize = 1 << 6;
    const FULL_SCREEN_AUXILIARY: usize = 1 << 8;
    const BEHAVIOR: usize = CAN_JOIN_ALL_SPACES | STATIONARY | IGNORES_CYCLE | FULL_SCREEN_AUXILIARY;

    pub fn apply(w: &WebviewWindow, level: isize) {
        let window = w.clone();
        // AppKit wants the main thread.
        let _ = w.run_on_main_thread(move || {
            let Ok(ptr) = window.ns_window() else { return };
            let ns = ptr.cast::<AnyObject>();
            if ns.is_null() {
                return;
            }
            // SAFETY: `ns` is this window's live NSWindow, used on the main
            // thread; both setters take plain integers.
            unsafe {
                let _: () = msg_send![ns, setLevel: level];
                let _: () = msg_send![ns, setCollectionBehavior: BEHAVIOR];
            }
        });
    }
}
