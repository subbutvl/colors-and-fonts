import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { ThemeSwitch } from "../components/ThemeSwitch";
import { getAutostart, setAutostart } from "../lib/autostart";
import { isTauri } from "../lib/env";
import { useSettings } from "../SettingsContext";

interface ShortcutStatus {
  action: "pick_color" | "identify_font" | "toggle_toolbar";
  label: string;
  registered: boolean;
  error: string | null;
}

const SHORTCUT_NAMES: Record<ShortcutStatus["action"], string> = {
  pick_color: "Pick color",
  identify_font: "Identify font",
  toggle_toolbar: "Show or hide the toolbar",
};

export function SettingsPage() {
  const [shortcuts, setShortcuts] = useState<ShortcutStatus[] | null>(null);
  const { error } = useSettings();
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  const [autostartError, setAutostartError] = useState<string | null>(null);
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    getAutostart()
      .then(setAutostartState)
      .catch((e) => setAutostartError(`Could not read the startup setting: ${String(e)}`));
    if (isTauri()) {
      getVersion().then(setVersion).catch(() => {});
      invoke<ShortcutStatus[]>("shortcut_status").then(setShortcuts).catch(() => setShortcuts([]));
    }
  }, []);

  const toggleAutostart = async (on: boolean) => {
    const before = autostart;
    setAutostartState(on);
    try {
      await setAutostart(on);
      setAutostartError(null);
    } catch (e) {
      setAutostartState(before);
      setAutostartError(`Could not change the startup setting: ${String(e)}`);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Settings</h1>
        <p>Saved on this computer.</p>
      </header>

      {error && <p className="alert" role="alert">{error}</p>}

      <section className="settings-group" aria-labelledby="set-appearance">
        <h2 id="set-appearance">Appearance</h2>
        <div className="setting-row">
          <div>
            <strong>Theme</strong>
            <span>System follows your Windows light or dark setting. The picker toolbar is always dark.</span>
          </div>
          <ThemeSwitch className="wide" />
        </div>
      </section>

      <section className="settings-group" aria-labelledby="set-startup">
        <h2 id="set-startup">Startup</h2>
        <div className="setting-row">
          <div>
            <label htmlFor="autostart"><strong>Launch Huetype when Windows starts</strong></label>
            <span>
              {autostart === null
                ? "Available in the desktop app."
                : "It starts quietly in the system tray, so it is ready when you need to pick a color."}
            </span>
          </div>
          <input
            id="autostart"
            type="checkbox"
            className="switch"
            checked={autostart ?? false}
            disabled={autostart === null}
            onChange={(e) => toggleAutostart(e.target.checked)}
          />
        </div>
        {autostartError && <p className="alert" role="alert">{autostartError}</p>}
      </section>

      <section className="settings-group" aria-labelledby="set-shortcuts">
        <h2 id="set-shortcuts">Keyboard shortcuts</h2>
        {shortcuts === null ? (
          <div className="setting-row">
            <div>
              <span>Shortcuts work in the desktop app, from any app.</span>
            </div>
          </div>
        ) : (
          shortcuts.map((s) => (
            <div className="setting-row" key={s.action}>
              <div>
                <strong>{SHORTCUT_NAMES[s.action]}</strong>
                <span>
                  {s.registered
                    ? "Works from any app."
                    : "Not available: another app is already using these keys. Close that app or its shortcut and restart Huetype."}
                </span>
              </div>
              <kbd className={`shortcut${s.registered ? "" : " off"}`}>{s.label.replace(/\+/g, " + ")}</kbd>
            </div>
          ))
        )}
      </section>

      <section className="settings-group" aria-labelledby="set-about">
        <h2 id="set-about">About</h2>
        <div className="setting-row">
          <div>
            <strong>Huetype {version && <span className="mono">v{version}</span>}</strong>
            <span>Pick colors and identify fonts from anywhere on your desktop.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
