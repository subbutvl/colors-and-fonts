//! Screen Recording permission. macOS only lets an app read other apps'
//! windows once the user allows it in System Settings > Privacy & Security >
//! Screen Recording; without it a capture shows just the wallpaper and the
//! menu bar, so picks would be wrong rather than fail. Windows has no such
//! permission, so there everything is allowed.

use serde::Serialize;

/// Shown when a pick or a screen grab needs the permission.
pub const SCREEN_DENIED: &str = "Huetype needs Screen Recording permission to read colors from the screen. \
Allow it in System Settings > Privacy & Security > Screen Recording, then quit and reopen Huetype.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScreenAccess {
    // Only macOS reports Granted; Windows is NotNeeded.
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    Granted,
    Denied,
    /// This OS has no such permission (Windows).
    #[cfg_attr(target_os = "macos", allow(dead_code))]
    NotNeeded,
}

#[cfg(target_os = "macos")]
mod mac {
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
        fn CGRequestScreenCaptureAccess() -> bool;
    }

    pub fn granted() -> bool {
        // SAFETY: plain CoreGraphics calls with no arguments (macOS 10.15+).
        unsafe { CGPreflightScreenCaptureAccess() }
    }

    pub fn request() -> bool {
        // SAFETY: as above. Shows the system prompt the first time only.
        unsafe { CGRequestScreenCaptureAccess() }
    }
}

/// Whether we may capture the screen right now.
pub fn screen_access() -> ScreenAccess {
    #[cfg(target_os = "macos")]
    {
        if mac::granted() { ScreenAccess::Granted } else { ScreenAccess::Denied }
    }
    #[cfg(not(target_os = "macos"))]
    {
        ScreenAccess::NotNeeded
    }
}

/// Ok when capture is allowed. Otherwise asks macOS for the permission (the
/// system prompt appears the first time and lists Huetype in System Settings)
/// and returns the message to show.
pub fn ensure_screen_access() -> Result<(), String> {
    if screen_access() != ScreenAccess::Denied {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    if mac::request() {
        return Ok(());
    }
    Err(SCREEN_DENIED.to_string())
}

#[tauri::command]
pub fn screen_permission() -> ScreenAccess {
    screen_access()
}

/// Ask macOS for the permission (prompts once) and open the Screen
/// Recording pane of System Settings, where the user turns it on.
#[tauri::command]
pub fn open_screen_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = mac::request();
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn nothing_to_ask_outside_macos() {
        assert_eq!(screen_access(), ScreenAccess::NotNeeded);
        assert!(ensure_screen_access().is_ok());
    }

    #[test]
    fn access_serializes_for_the_frontend() {
        assert_eq!(serde_json::to_string(&ScreenAccess::NotNeeded).unwrap(), "\"notNeeded\"");
        assert_eq!(serde_json::to_string(&ScreenAccess::Denied).unwrap(), "\"denied\"");
    }
}
