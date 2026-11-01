import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cachedSettings, loadSettings, saveSetting, type Settings } from "./lib/settings";

interface Ctx {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** Set when SQLite could not be read or written. */
  error: string | null;
}

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(cachedSettings);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .catch((e) => setError(`Could not load settings: ${String(e)}`));
  }, []);

  // Apply the theme: "system" follows Windows through prefers-color-scheme.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  const update: Ctx["update"] = (key, value) => {
    setSettings((s) => ({ ...s, [key]: value }));
    saveSetting(key, value)
      .then(() => setError(null))
      .catch((e) => setError(`Could not save settings: ${String(e)}`));
  };

  return <SettingsCtx.Provider value={{ settings, update, error }}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
