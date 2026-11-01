import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { FontCatalogSetting } from "../components/FontCatalogSetting";
import { ShortcutRow } from "../components/ShortcutRow";
import { ThemeSwitch } from "../components/ThemeSwitch";
import { getShortcutStatus, type ShortcutStatus } from "../lib/shortcuts";
import { getAutostart, setAutostart } from "../lib/autostart";
import { isTauri } from "../lib/env";
import { useSettings } from "../SettingsContext";

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
    if (isTauri()) getVersion().then(setVersion).catch(() => {});
    getShortcutStatus()
      .then(setShortcuts)
      .catch(() => setShortcuts([]));
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
              <span>Shortcuts work in the desktop app, from any app. Click a shortcut to change it.</span>
            </div>
          </div>
        ) : (
          shortcuts.map((s) => (
            <ShortcutRow
              key={s.action}
              status={s}
              onChange={(next) => setShortcuts((all) => all?.map((x) => (x.action === next.action ? next : x)) ?? null)}
            />
          ))
        )}
      </section>

      <section className="settings-group" aria-labelledby="set-fonts">
        <h2 id="set-fonts">Fonts</h2>
        <FontCatalogSetting />
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
