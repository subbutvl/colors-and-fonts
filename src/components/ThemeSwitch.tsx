import type { ThemePref } from "../lib/settings";
import { useSettings } from "../SettingsContext";

const THEMES: { value: ThemePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeSwitch({ className = "" }: { className?: string }) {
  const { settings, update } = useSettings();
  return (
    <div className={`theme-switch ${className}`} role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={settings.theme === t.value}
          className={settings.theme === t.value ? "on" : ""}
          onClick={() => update("theme", t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
