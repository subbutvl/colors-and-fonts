import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  // Keys the user changed before the initial load finished; the load must not revert them.
  const edited = useRef(new Set<keyof Settings>());

  useEffect(() => {
    loadSettings()
      .then((loaded) =>
        setSettings((current) => {
          const next = { ...loaded };
          for (const key of edited.current) Object.assign(next, { [key]: current[key] });
          return next;
        }),
      )
      .catch((e) => setError(`Could not load settings: ${String(e)}`));
  }, []);

  // Apply the theme: "system" follows Windows through prefers-color-scheme.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  const update: Ctx["update"] = (key, value) => {
    edited.current.add(key);
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
